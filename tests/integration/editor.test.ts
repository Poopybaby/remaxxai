import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Viewer } from "@/lib/auth/permissions";
import { PermissionError } from "@/lib/auth/permissions";
import { projectFiles, projects } from "@/lib/db/schema";
import { getCreditChain } from "@/lib/licensing/chain";
import { createProfile } from "@/lib/profiles";
import { createRemix, MAX_DRAFTS_PER_USER, remixTitle } from "@/lib/projects/remix";
import {
  deleteDraft,
  listVersions,
  loadEditorFiles,
  restoreVersion,
  saveVersion,
  SaveError,
} from "@/lib/projects/versions";
import { buildSeedSql, seedUuid } from "@/lib/seed/build-sql";
import { createAuthUser, createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
let ana: Viewer;
let ben: Viewer;
const pid = (slug: string) => seedUuid(`project:${slug}`);

async function makeUser(handle: string): Promise<Viewer> {
  const id = await createAuthUser(t.pg);
  const res = await createProfile(t.db, id, {
    handle,
    displayName: handle,
    ageConfirmed: true,
    termsAccepted: true,
  });
  if (!res.ok) throw new Error(JSON.stringify(res.errors));
  return { userId: id, role: "user" };
}

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

describe("createRemix", () => {
  it("makes a private draft with the same files, credit to the whole chain, and a compatible license", async () => {
    const before = await project(pid("moonbrew-live"));
    const draft = await createRemix(t.db, ana, pid("moonbrew-live"));
    expect(draft.status).toBe("draft");
    expect(draft.ownerId).toBe(ana!.userId);
    expect(draft.title).toBe("Moonbrew Live remix");
    expect(draft.toolUsed).toBe("remaxx");
    expect(draft.licenseId).toBe(before.licenseId);
    expect(draft.parentProjectId).toBe(before.id);
    expect(draft.publishedAt).toBeNull();

    const chain = await getCreditChain(t.db, draft.id);
    expect(chain.map((c) => c.slug)).toEqual(["moonbrew-live", "moonbrew-night", "moonbrew"]);

    const src = await loadEditorFiles(t.db, before.currentVersionId!);
    const mine = await loadEditorFiles(t.db, draft.currentVersionId!);
    expect(mine.map((f) => [f.path, f.sha256])).toEqual(src.map((f) => [f.path, f.sha256]));
    expect(mine.find((f) => f.path.endsWith(".html"))?.text).toContain("<");

    // Drafts don't count as public remixes.
    expect((await project(before.id)).remixCount).toBe(before.remixCount);
  });

  it("counts the remix once it's published", async () => {
    const before = (await project(pid("tip-split"))).remixCount;
    const draft = await createRemix(t.db, ana, pid("tip-split"));
    await t.db.update(projects).set({ status: "published" }).where(eq(projects.id, draft.id));
    expect((await project(pid("tip-split"))).remixCount).toBe(before + 1);
    await t.db.update(projects).set({ status: "unpublished" }).where(eq(projects.id, draft.id));
    expect((await project(pid("tip-split"))).remixCount).toBe(before);
  });

  it("refuses signed-out visitors and other people's drafts", async () => {
    await expect(createRemix(t.db, null, pid("moonbrew"))).rejects.toThrow(PermissionError);
    const draft = await createRemix(t.db, ana, pid("moonbrew"));
    await expect(createRemix(t.db, ben, draft.id)).rejects.toThrow(PermissionError);
  });

  it("caps how many drafts one person can hold", async () => {
    const carl = await makeUser("carl");
    const id = (await createRemix(t.db, carl, pid("color-lab"))).id;
    await t.pg.query(
      `insert into projects (owner_id, slug, title, category, tool_used, license_id, status)
       select $1, 'filler-' || g, 'Filler draft', 'tool', 'remaxx', 'mit', 'draft'
       from generate_series(1, $2) g`,
      [carl!.userId, MAX_DRAFTS_PER_USER - 1],
    );
    await expect(createRemix(t.db, carl, pid("color-lab"))).rejects.toThrow(/50 drafts/);
    await deleteDraft(t.db, carl, id);
  });

  it("keeps long titles within the limit", () => {
    expect(remixTitle("x".repeat(80))).toHaveLength(80);
    expect(remixTitle("Moonbrew remix")).toBe("Moonbrew remix");
  });
});

describe("saveVersion", () => {
  async function freshDraft(who: Viewer = ana) {
    const draft = await createRemix(t.db, who, pid("moonbrew"));
    const files = await loadEditorFiles(t.db, draft.currentVersionId!);
    return { draft, files };
  }
  const keep = (files: { path: string; sha256: string }[]) =>
    files.map((f) => ({ path: f.path, sha256: f.sha256 }));

  it("saves edited text as a new numbered version and keeps unchanged files by hash", async () => {
    const { draft, files } = await freshDraft();
    const html = files.find((f) => f.path === draft.entryPath)!;
    const res = await saveVersion(t.db, ana, draft.id, {
      baseVersionId: draft.currentVersionId!,
      files: [
        ...keep(files.filter((f) => f !== html)),
        { path: html.path, text: html.text!.replace("Moonbrew", "Sunbrew") },
      ],
      message: "Rename to Sunbrew",
      createdBy: "ai",
    });
    expect(res.changed).toBe(true);
    expect(res.version.number).toBe(2);
    expect(res.version.createdBy).toBe("ai");
    expect((await project(draft.id)).currentVersionId).toBe(res.version.id);
    const saved = await loadEditorFiles(t.db, res.version.id);
    expect(saved.find((f) => f.path === html.path)?.text).toContain("Sunbrew");
    expect((await listVersions(t.db, ana, draft.id)).map((v) => v.number)).toEqual([2, 1]);
  });

  it("doesn't make a version when nothing changed", async () => {
    const { draft, files } = await freshDraft();
    const res = await saveVersion(t.db, ana, draft.id, {
      baseVersionId: draft.currentVersionId!,
      files: keep(files),
      message: "noop",
      createdBy: "user",
    });
    expect(res.changed).toBe(false);
    expect(res.version.number).toBe(1);
  });

  it("rejects a save based on an old version (another tab saved first)", async () => {
    const { draft, files } = await freshDraft();
    const html = files.find((f) => f.path === draft.entryPath)!;
    const edit = (text: string) =>
      saveVersion(t.db, ana, draft.id, {
        baseVersionId: draft.currentVersionId!,
        files: [...keep(files.filter((f) => f !== html)), { path: html.path, text }],
        message: "edit",
        createdBy: "user",
      });
    await edit("<h1>first</h1>");
    await expect(edit("<h1>second</h1>")).rejects.toMatchObject({ code: "conflict" });
  });

  it("won't let a draft borrow files from someone else's project by hash", async () => {
    const { draft, files } = await freshDraft();
    const [other] = await t.db
      .select({ sha: projectFiles.blobSha256 })
      .from(projectFiles)
      .innerJoin(projects, eq(projects.currentVersionId, projectFiles.versionId))
      .where(eq(projects.id, pid("ledgerline")));
    await expect(
      saveVersion(t.db, ana, draft.id, {
        baseVersionId: draft.currentVersionId!,
        files: [...keep(files), { path: "stolen.js", sha256: other!.sha }],
        message: "x",
        createdBy: "user",
      }),
    ).rejects.toThrow(/isn't part of this project/);
  });

  it.each([
    [{ path: "../escape.html", text: "x" }, /outside the project/],
    [{ path: "evil.exe", text: "x" }, /isn't supported/],
    [{ path: "notes.txt", text: "-----BEGIN RSA PRIVATE KEY-----\nabc" }, /private key/],
  ])("rejects unsafe files: %o", async (bad, message) => {
    const { draft, files } = await freshDraft();
    await expect(
      saveVersion(t.db, ana, draft.id, {
        baseVersionId: draft.currentVersionId!,
        files: [...keep(files), bad],
        message: "x",
        createdBy: "user",
      }),
    ).rejects.toThrow(message);
  });

  it("requires the page the preview opens", async () => {
    const { draft, files } = await freshDraft();
    await expect(
      saveVersion(t.db, ana, draft.id, {
        baseVersionId: draft.currentVersionId!,
        files: keep(files.filter((f) => f.path !== draft.entryPath)),
        message: "x",
        createdBy: "user",
      }),
    ).rejects.toThrow(SaveError);
  });

  it("only the owner can save, and only while it's a draft", async () => {
    const { draft, files } = await freshDraft();
    const req = {
      baseVersionId: draft.currentVersionId!,
      files: keep(files),
      message: "x",
      createdBy: "user" as const,
    };
    await expect(saveVersion(t.db, ben, draft.id, req)).rejects.toThrow(PermissionError);
    await expect(saveVersion(t.db, null, draft.id, req)).rejects.toThrow(PermissionError);
    await expect(saveVersion(t.db, ana, pid("moonbrew"), req)).rejects.toThrow(PermissionError);
  });
});

describe("restoreVersion and deleteDraft", () => {
  it("restores an old version as a new one, so undo can itself be undone", async () => {
    const draft = await createRemix(t.db, ana, pid("moonbrew"));
    const files = await loadEditorFiles(t.db, draft.currentVersionId!);
    const html = files.find((f) => f.path === draft.entryPath)!;
    await saveVersion(t.db, ana, draft.id, {
      baseVersionId: draft.currentVersionId!,
      files: files.map((f) =>
        f === html
          ? { path: f.path, text: "<h1>changed</h1>" }
          : { path: f.path, sha256: f.sha256 },
      ),
      message: "change",
      createdBy: "ai",
    });
    const res = await restoreVersion(t.db, ana, draft.id, draft.currentVersionId!);
    expect(res.version.number).toBe(3);
    expect(res.version.message).toBe("Restored version 1");
    const restored = await loadEditorFiles(t.db, res.version.id);
    expect(restored.map((f) => f.sha256)).toEqual(files.map((f) => f.sha256));
  });

  it("won't restore a version from a different project", async () => {
    const a = await createRemix(t.db, ana, pid("moonbrew"));
    const b = await createRemix(t.db, ana, pid("tip-split"));
    await expect(restoreVersion(t.db, ana, a.id, b.currentVersionId!)).rejects.toThrow(
      /doesn't exist/,
    );
  });

  it("deletes the owner's draft but never a published project", async () => {
    const draft = await createRemix(t.db, ana, pid("moonbrew"));
    await expect(deleteDraft(t.db, ben, draft.id)).rejects.toThrow(PermissionError);
    await deleteDraft(t.db, ana, draft.id);
    expect(await t.db.select().from(projects).where(eq(projects.id, draft.id))).toEqual([]);
    await expect(deleteDraft(t.db, ana, pid("moonbrew"))).rejects.toThrow(PermissionError);
  });
});
