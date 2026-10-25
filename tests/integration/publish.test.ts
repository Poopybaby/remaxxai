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
import { createFromStarter } from "@/lib/projects/new-project";
import { createRemix, MAX_DRAFTS_PER_USER } from "@/lib/projects/remix";
import { STARTER_ORDER, STARTERS, titleFromIdea } from "@/lib/projects/starters";
import { LICENSE_IDS } from "@/config/licenses";
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

describe("Create (new projects from a starter)", () => {
  it("makes a private draft owned by the person, with no remix credit", async () => {
    const draft = await createFromStarter(t.db, ana, {
      starter: "landing",
      idea: "Make a landing page for my mobile car detailing service",
    });
    expect(draft).toMatchObject({ status: "draft", ownerId: ana!.userId, parentProjectId: null });
    expect(draft.title).toBe("Landing page for my mobile car detailing service");
    expect(await getCreditChain(t.db, draft.id)).toEqual([]);
    const files = await loadEditorFiles(t.db, draft.currentVersionId!);
    expect(files.map((f) => f.path).sort()).toEqual(Object.keys(STARTERS.landing.files).sort());
    // Nothing upstream, so every license is open to it.
    expect(await licensesForDraft(t.db, draft.id)).toEqual([...LICENSE_IDS]);
  });

  it("needs a cover to publish, then publishes under any license with the upload rights statement", async () => {
    const draft = await createFromStarter(t.db, ana, { starter: "app" });
    expect(draft.title).toBe("My small app");
    await expect(
      publishDraft(
        t.db,
        ana,
        draft.id,
        { metadata: meta({ title: "Habit grid" }), cover: null },
        pass,
      ),
    ).rejects.toMatchObject({ field: "cover" });
    const res = await publishDraft(
      t.db,
      ana,
      draft.id,
      { metadata: meta({ title: "Habit grid", licenseId: "cc0-1.0" }), cover: PNG },
      pass,
    );
    expect(res.status).toBe("published");
    const rows = await t.db
      .select()
      .from(rightsAttestations)
      .where(eq(rightsAttestations.projectId, draft.id));
    expect(rows.map((r) => r.statementVersion)).not.toContain(REMIX_RIGHTS_STATEMENT_VERSION);
  });

  it("only the owner can open or publish it", async () => {
    const draft = await createFromStarter(t.db, ana, { starter: "blank" });
    await expect(
      publishDraft(t.db, ben, draft.id, { metadata: meta(), cover: PNG }, pass),
    ).rejects.toThrow(PermissionError);
    await expect(createFromStarter(t.db, null, { starter: "blank" })).rejects.toThrow(
      PermissionError,
    );
  });

  it("counts toward the draft limit", async () => {
    const carl = await makeUser("carl");
    for (let i = 0; i < MAX_DRAFTS_PER_USER; i++)
      await createFromStarter(t.db, carl, { starter: "blank" });
    await expect(createFromStarter(t.db, carl, { starter: "blank" })).rejects.toThrow(/drafts/);
  });

  it("every starter is a small, safe static project", () => {
    for (const id of STARTER_ORDER) {
      const s = STARTERS[id];
      expect(s.files["index.html"]).toContain("<!doctype html>");
      for (const text of Object.values(s.files)) {
        expect(text).not.toMatch(/https?:\/\/(?!example\.com)/);
        expect(text.length).toBeLessThan(20_000);
      }
    }
  });

  it("titles come from the description", () => {
    expect(titleFromIdea("A booking page for a barbershop", "x")).toBe(
      "Booking page for a barbershop",
    );
    expect(titleFromIdea("   ", "My blank page")).toBe("My blank page");
    expect(
      titleFromIdea("A booking page for a barbershop with prices and opening hours", "x"),
    ).toBe("Booking page for a barbershop with prices and opening hours");
    expect(titleFromIdea("make me a countdown page for my album release, neon!", "x")).toBe(
      "Countdown page for my album release neon",
    );
  });
});
