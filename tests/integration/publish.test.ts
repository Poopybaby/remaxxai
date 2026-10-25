import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PermissionError, type Viewer } from "@/lib/auth/permissions";
import { projects, rightsAttestations } from "@/lib/db/schema";
import { getCreditChain } from "@/lib/licensing/chain";
import type { ModerationVerdict } from "@/lib/moderation";
import { createProfile } from "@/lib/profiles";
import {
  publishDraft,
  licensesForDraft,
  PublishError,
  REMIX_RIGHTS_STATEMENT_VERSION,
} from "@/lib/projects/publish";
import { getProjectBySlug } from "@/lib/projects/queries";
import { createRemix } from "@/lib/projects/remix";
import { loadEditorFiles, saveVersion } from "@/lib/projects/versions";
import { buildSeedSql, seedUuid } from "@/lib/seed/build-sql";
import { createAuthUser, createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
let ana: Viewer;
let ben: Viewer;
const pid = (slug: string) => seedUuid(`project:${slug}`);
const pass = {
  moderate: async (): Promise<ModerationVerdict> => ({
    verdict: "pass",
    categories: [],
    source: "openai",
  }),
};
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
]);

async function makeUser(handle: string): Promise<Viewer> {
  const id = await createAuthUser(t.pg);
  await createProfile(t.db, id, {
    handle,
    displayName: handle,
    ageConfirmed: true,
    termsAccepted: true,
  });
  return { userId: id, role: "user" };
}

const meta = (over: Record<string, unknown> = {}) => ({
  title: "Sunbrew late night",
  description: "Moonbrew, but warmer.",
  category: "landing-page",
  toolUsed: "remaxx",
  licenseId: "mit",
  styles: ["dark"],
  tags: ["coffee", "night"],
  rightsConfirmed: true,
  ...over,
});

async function project(id: string) {
  const [p] = await t.db.select().from(projects).where(eq(projects.id, id));
  return p!;
}

beforeAll(async () => {
  t = await createTestDb();
  await t.pg.exec(await buildSeedSql());
  ana = await makeUser("ana");
  ben = await makeUser("ben");
});
afterAll(async () => {
  await t.close();
});

describe("publishDraft", () => {
  it("publishes a remix with new details, keeps credit to the chain, and counts it on the original", async () => {
    const before = (await project(pid("moonbrew"))).remixCount;
    const draft = await createRemix(t.db, ana, pid("moonbrew"));
    const res = await publishDraft(t.db, ana, draft.id, { metadata: meta(), cover: PNG }, pass);
    expect(res.status).toBe("published");
    expect(res.slug).toMatch(/^sunbrew-late-night-/);

    const p = await getProjectBySlug(t.db, res.slug);
    expect(p).toMatchObject({
      title: "Sunbrew late night",
      status: "published",
      category: "landing-page",
    });
    expect(p?.publishedAt).toBeInstanceOf(Date);
    expect(p?.coverUrl).toMatch(/^\/media\/[a-f0-9]{64}\.png$/);
    expect(p?.tags.map((x) => x.slug).sort()).toEqual(["coffee", "dark", "night"]);
    expect((await getCreditChain(t.db, draft.id)).map((c) => c.slug)).toEqual(["moonbrew"]);
    expect((await project(pid("moonbrew"))).remixCount).toBe(before + 1);
    const [rights] = await t.db
      .select()
      .from(rightsAttestations)
      .where(eq(rightsAttestations.projectId, draft.id))
      .orderBy(rightsAttestations.createdAt);
    expect(rights).toBeDefined();
    const all = await t.db
      .select()
      .from(rightsAttestations)
      .where(eq(rightsAttestations.projectId, draft.id));
    expect(all.map((r) => r.statementVersion)).toContain(REMIX_RIGHTS_STATEMENT_VERSION);
  });

  it("keeps the original's cover when none is given", async () => {
    const draft = await createRemix(t.db, ana, pid("tip-split"));
    const res = await publishDraft(
      t.db,
      ana,
      draft.id,
      { metadata: meta({ title: "Split it remix" }), cover: null },
      pass,
    );
    expect((await getProjectBySlug(t.db, res.slug))?.coverUrl).toBe("/seed/covers/tip-split.jpg");
  });

  it("only allows licenses the whole chain permits", async () => {
    // The Paper Trail is CC BY-SA: remixes must stay CC BY-SA.
    const draft = await createRemix(t.db, ana, pid("paper-trail-blog"));
    expect(await licensesForDraft(t.db, draft.id)).toEqual(["cc-by-sa-4.0"]);
    await expect(
      publishDraft(t.db, ana, draft.id, { metadata: meta(), cover: null }, pass),
    ).rejects.toThrow(/can only be shared as CC BY-SA/);
    const ok = await publishDraft(
      t.db,
      ana,
      draft.id,
      { metadata: meta({ licenseId: "cc-by-sa-4.0" }), cover: null },
      pass,
    );
    expect(ok.status).toBe("published");
  });

  it("keeps Personal Use remixes Personal Use", async () => {
    const draft = await createRemix(t.db, ana, pid("sneaker-drop"));
    expect(await licensesForDraft(t.db, draft.id)).toEqual(["remaxx-personal"]);
  });

  it("refuses other people, published projects, and anything already published", async () => {
    const draft = await createRemix(t.db, ana, pid("color-lab"));
    await expect(
      publishDraft(t.db, ben, draft.id, { metadata: meta(), cover: null }, pass),
    ).rejects.toThrow(PermissionError);
    await expect(
      publishDraft(t.db, ana, pid("color-lab"), { metadata: meta(), cover: null }, pass),
    ).rejects.toThrow(PermissionError);
    await publishDraft(t.db, ana, draft.id, { metadata: meta(), cover: null }, pass);
    await expect(
      publishDraft(t.db, ana, draft.id, { metadata: meta(), cover: null }, pass),
    ).rejects.toThrow(PermissionError);
  });

  it("checks the details", async () => {
    const draft = await createRemix(t.db, ana, pid("dev-docs"));
    await expect(
      publishDraft(t.db, ana, draft.id, { metadata: meta({ title: "x" }), cover: null }, pass),
    ).rejects.toMatchObject({
      field: "title",
    });
    await expect(
      publishDraft(
        t.db,
        ana,
        draft.id,
        { metadata: meta({ rightsConfirmed: false }), cover: null },
        pass,
      ),
    ).rejects.toThrow(PublishError);
    await expect(
      publishDraft(
        t.db,
        ana,
        draft.id,
        { metadata: meta(), cover: new TextEncoder().encode("<svg/>") },
        pass,
      ),
    ).rejects.toMatchObject({ field: "cover" });
  });

  it("refuses files the scanner blocks, and holds flagged ones for review", async () => {
    const draft = await createRemix(t.db, ana, pid("moonbrew"));
    const files = await loadEditorFiles(t.db, draft.currentVersionId!);
    const keep = files.map((f) => ({ path: f.path, sha256: f.sha256 }));
    const v2 = await saveVersion(t.db, ana, draft.id, {
      baseVersionId: draft.currentVersionId!,
      files: [...keep, { path: "notes.txt", text: "-----BEGIN RSA PRIVATE KEY-----\nabc" }],
      message: "oops",
      createdBy: "user",
    }).catch((e: Error) => e);
    // Saving already refuses it; publishing would too.
    expect(v2).toBeInstanceOf(Error);

    const flagged = await publishDraft(
      t.db,
      ana,
      draft.id,
      { metadata: meta({ title: "Flag me" }), cover: null },
      {
        moderate: async () => ({ verdict: "flag", categories: ["harassment"], source: "openai" }),
      },
    );
    expect(flagged.status).toBe("pending_review");
  });

  it("refuses content moderation blocks", async () => {
    const draft = await createRemix(t.db, ana, pid("moonbrew"));
    await expect(
      publishDraft(
        t.db,
        ana,
        draft.id,
        { metadata: meta(), cover: null },
        {
          moderate: async () => ({
            verdict: "block",
            categories: ["hate/threatening"],
            source: "openai",
          }),
        },
      ),
    ).rejects.toThrow(/can't be published/);
    expect((await project(draft.id)).status).toBe("draft");
  });
});
