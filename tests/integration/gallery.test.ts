import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Viewer } from "@/lib/auth/permissions";
import { adminAuditLog, blobs, projectFiles, projects, remixLineage } from "@/lib/db/schema";
import { allowedRemixLicenses } from "@/lib/licensing/compat";
import { getAncestorLicenses, getCreditChain, getDescendantIds } from "@/lib/licensing/chain";
import {
  approveProject,
  createReport,
  dismissReport,
  listOpenReports,
  listProjectsAwaitingReview,
  removeProject,
  setOwnProjectVisibility,
} from "@/lib/moderation/actions";
import { createProfile } from "@/lib/profiles";
import { createProject, type CreateProjectInput } from "@/lib/projects/create";
import { projectMetadataSchema, type ProjectMetadataInput } from "@/lib/projects/metadata";
import {
  getProjectBySlug,
  getVersionFile,
  getViewerProjectState,
  listPublishedProjects,
  listSavedProjects,
} from "@/lib/projects/queries";
import { setFollow, setLike, setSave } from "@/lib/projects/social";
import { validateUpload } from "@/lib/upload/validate";
import { createAuthUser, createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
let alice: Viewer;
let bob: Viewer;
let carol: Viewer;
let admin: Viewer;

const enc = new TextEncoder();

async function makeUser(handle: string, role: "user" | "admin" = "user"): Promise<Viewer> {
  const id = await createAuthUser(t.pg);
  const res = await createProfile(t.db, id, {
    handle,
    displayName: handle,
    ageConfirmed: true,
    termsAccepted: true,
  });
  if (!res.ok) throw new Error(JSON.stringify(res.errors));
  if (role === "admin") await t.pg.query("update profiles set role = 'admin' where id = $1", [id]);
  return { userId: id, role };
}

function meta(overrides: Partial<ProjectMetadataInput> = {}) {
  return projectMetadataSchema.parse({
    title: "Moonbrew",
    description: "A coffee pop-up landing page.",
    category: "landing-page",
    toolUsed: "claude",
    licenseId: "mit",
    styles: ["pastel"],
    tags: ["Coffee", "#food truck"],
    rightsConfirmed: true,
    ...overrides,
  });
}

function files(body = "<!doctype html><h1>Moonbrew</h1>") {
  const res = validateUpload([
    { path: "index.html", bytes: enc.encode(body) },
    { path: "style.css", bytes: enc.encode("body{background:pink}") },
  ]);
  if (!res.ok) throw new Error("fixture invalid");
  return res;
}

async function make(owner: Viewer, overrides: Partial<CreateProjectInput> = {}, m = meta()) {
  const v = files(`<!doctype html><h1>${m.title}</h1>`);
  return createProject(t.db, {
    ownerId: owner!.userId,
    metadata: m,
    files: v.files,
    entryPath: v.entryPath,
    coverUrl: null,
    status: "published",
    ...overrides,
  });
}

beforeAll(async () => {
  t = await createTestDb();
  alice = await makeUser("alice");
  bob = await makeUser("bob");
  carol = await makeUser("carol");
  admin = await makeUser("the_admin", "admin");
});

afterAll(async () => {
  await t.close();
});

describe("createProject", () => {
  it("stores the project, version, files, tags and rights record together", async () => {
    const p = await make(alice);
    expect(p.slug).toMatch(/^moonbrew-[a-f0-9]{6}$/);
    expect(p.currentVersionId).toBeTruthy();
    expect(p.publishedAt).toBeInstanceOf(Date);

    const detail = await getProjectBySlug(t.db, p.slug);
    expect(detail?.tags.map((x) => x.slug).sort()).toEqual(["coffee", "food-truck", "pastel"]);
    expect(detail?.tags.find((x) => x.slug === "pastel")?.kind).toBe("style");
    expect(detail?.license.id).toBe("mit");

    const file = await getVersionFile(t.db, p.currentVersionId!, "index.html");
    expect(new TextDecoder().decode(file!.bytes)).toContain("Moonbrew");
    expect(file?.mime).toMatch(/text\/html/);

    const att = await t.pg.query(
      "select license_id from rights_attestations where project_id = $1",
      [p.id],
    );
    expect(att.rows).toEqual([{ license_id: "mit" }]);
  });

  it("stores identical files only once across projects", async () => {
    const before = (await t.db.select().from(blobs)).length;
    await make(bob, {}, meta({ title: "Same CSS" }));
    const after = (await t.db.select().from(blobs)).length;
    // index.html differs by title, style.css is identical: one new blob.
    expect(after - before).toBe(1);
  });

  it("is all-or-nothing: a failure leaves no partial project behind", async () => {
    const count = async () => (await t.db.select().from(projects)).length;
    const before = await count();
    await expect(
      make(
        alice,
        { parentProjectId: "00000000-0000-4000-8000-000000000000" },
        meta({ title: "Orphan" }),
      ),
    ).rejects.toThrow();
    expect(await count()).toBe(before);
  });

  it("requires the rights confirmation and a known license", () => {
    expect(() => meta({ rightsConfirmed: false as unknown as true })).toThrow(/rights/);
    expect(() => meta({ licenseId: "gpl-3.0" as "mit" })).toThrow();
  });
});

describe("remix lineage and credit chain", () => {
  it("records a three-generation chain with nearest credit first", async () => {
    const original = await make(alice, {}, meta({ title: "Original", licenseId: "cc-by-sa-4.0" }));
    const remix = await make(
      bob,
      { parentProjectId: original.id },
      meta({ title: "Remix", licenseId: "cc-by-sa-4.0" }),
    );
    const remix2 = await make(
      carol,
      { parentProjectId: remix.id },
      meta({ title: "Remix of remix", licenseId: "cc-by-sa-4.0" }),
    );

    const chain = await getCreditChain(t.db, remix2.id);
    expect(chain.map((c) => [c.position, c.title, c.ownerHandle])).toEqual([
      [1, "Remix", "bob"],
      [2, "Original", "alice"],
    ]);
    expect(chain.every((c) => c.available)).toBe(true);

    const lineage = await t.db
      .select()
      .from(remixLineage)
      .where(eq(remixLineage.descendantId, remix2.id));
    expect(lineage.map((l) => [l.ancestorId, l.depth]).sort()).toEqual(
      [
        [remix.id, 1],
        [original.id, 2],
      ].sort(),
    );

    expect((await getDescendantIds(t.db, original.id)).sort()).toEqual(
      [remix.id, remix2.id].sort(),
    );
    const [orig] = await t.db.select().from(projects).where(eq(projects.id, original.id));
    expect(orig?.remixCount).toBe(1); // direct remixes only
    expect(remix2.rootProjectId).toBe(original.id);

    // Share-alike at the top of the chain binds the whole chain.
    expect(allowedRemixLicenses(await getAncestorLicenses(t.db, remix2.id))).toEqual([
      "cc-by-sa-4.0",
    ]);
  });

  it("credits survive the ancestor being renamed", async () => {
    const original = await make(alice, {}, meta({ title: "Before rename" }));
    const remix = await make(bob, { parentProjectId: original.id }, meta({ title: "Child" }));
    await t.db.update(projects).set({ title: "After rename" }).where(eq(projects.id, original.id));
    const [credit] = await getCreditChain(t.db, remix.id);
    expect(credit?.title).toBe("Before rename");
  });

  it("credits survive the ancestor being deleted", async () => {
    const original = await make(alice, {}, meta({ title: "Deleted later" }));
    const remix = await make(bob, { parentProjectId: original.id }, meta({ title: "Survivor" }));
    await t.db.delete(projects).where(eq(projects.id, original.id));
    const [credit] = await getCreditChain(t.db, remix.id);
    expect(credit).toMatchObject({
      title: "Deleted later",
      ownerHandle: "alice",
      available: false,
      removed: true,
    });
  });
});

describe("takedowns", () => {
  it("copyright removal hides published remixes for review and records an audit entry", async () => {
    const original = await make(alice, {}, meta({ title: "Infringing" }));
    const remix = await make(bob, { parentProjectId: original.id }, meta({ title: "Built on it" }));
    const remix2 = await make(
      carol,
      { parentProjectId: remix.id },
      meta({ title: "Two levels down" }),
    );
    await setOwnProjectVisibility(t.db, carol, remix2.id, "unpublished");

    const res = await removeProject(t.db, admin, original.id, {
      copyright: true,
      note: "DMCA notice #1",
    });
    expect(res).toMatchObject({ ok: true, hiddenDescendants: 1 });

    const status = async (id: string) =>
      (await t.db.select({ s: projects.status }).from(projects).where(eq(projects.id, id)))[0]?.s;
    expect(await status(original.id)).toBe("removed");
    expect(await status(remix.id)).toBe("hidden_pending_review");
    expect(await status(remix2.id)).toBe("unpublished"); // already hidden by its owner; untouched

    const [credit] = await getCreditChain(t.db, remix.id);
    expect(credit).toMatchObject({ removed: true, available: false });

    const log = await t.db
      .select()
      .from(adminAuditLog)
      .where(eq(adminAuditLog.targetId, original.id));
    expect(log[0]?.action).toBe("remove_copyright");

    const queue = await listProjectsAwaitingReview(t.db, admin);
    expect(queue.map((q) => q.id)).toContain(remix.id);

    expect(await approveProject(t.db, admin, remix.id)).toEqual({ ok: true });
    expect(await status(remix.id)).toBe("published");
  });

  it("non-copyright removals don't touch remixes", async () => {
    const original = await make(alice, {}, meta({ title: "Spammy" }));
    const remix = await make(
      bob,
      { parentProjectId: original.id },
      meta({ title: "Innocent remix" }),
    );
    await removeProject(t.db, admin, original.id, { copyright: false, note: "spam" });
    const [r] = await t.db
      .select({ s: projects.status })
      .from(projects)
      .where(eq(projects.id, remix.id));
    expect(r?.s).toBe("published");
  });

  it("only admins can remove or approve", async () => {
    const p = await make(alice, {}, meta({ title: "Protected" }));
    expect((await removeProject(t.db, bob, p.id, { copyright: true, note: "" })).ok).toBe(false);
    expect((await removeProject(t.db, alice, p.id, { copyright: false, note: "" })).ok).toBe(false);
    expect((await approveProject(t.db, alice, p.id)).ok).toBe(false);
  });

  it("owners can't republish a removed project", async () => {
    const p = await make(alice, {}, meta({ title: "Removed for good" }));
    await removeProject(t.db, admin, p.id, { copyright: false, note: "" });
    expect((await setOwnProjectVisibility(t.db, alice, p.id, "published")).ok).toBe(false);
  });

  it("held uploads stay out of the gallery until approved", async () => {
    const p = await make(
      alice,
      { status: "pending_review", statusReason: "Scanner flag" },
      meta({ title: "Held upload" }),
    );
    const visible = async () =>
      (await listPublishedProjects(t.db, { q: "Held upload" })).cards.length;
    expect(await visible()).toBe(0);
    await approveProject(t.db, admin, p.id);
    expect(await visible()).toBe(1);
  });
});

describe("likes, saves and follows", () => {
  it("keeps counters in step with rows, and toggles are idempotent", async () => {
    const p = await make(alice, {}, meta({ title: "Popular" }));
    expect(await setLike(t.db, bob, p.id, true)).toMatchObject({ ok: true, count: 1 });
    expect(await setLike(t.db, bob, p.id, true)).toMatchObject({ ok: true, count: 1 });
    expect(await setLike(t.db, carol, p.id, true)).toMatchObject({ ok: true, count: 2 });
    expect(await setLike(t.db, bob, p.id, false)).toMatchObject({ ok: true, count: 1 });

    expect(await setSave(t.db, bob, p.id, true)).toMatchObject({ ok: true, count: 1 });
    expect((await listSavedProjects(t.db, bob!.userId)).map((c) => c.id)).toContain(p.id);

    const state = await getViewerProjectState(t.db, bob!.userId, p.id, alice!.userId);
    expect(state).toEqual({ liked: false, saved: true, following: false });
  });

  it("refuses anonymous visitors and hidden projects", async () => {
    const p = await make(alice, {}, meta({ title: "Hidden one" }));
    expect((await setLike(t.db, null, p.id, true)).ok).toBe(false);
    await setOwnProjectVisibility(t.db, alice, p.id, "unpublished");
    expect((await setLike(t.db, bob, p.id, true)).ok).toBe(false);
    expect((await setSave(t.db, bob, p.id, true)).ok).toBe(false);
  });

  it("follows count followers and refuse self-follows", async () => {
    expect(await setFollow(t.db, bob, alice!.userId, true)).toMatchObject({ ok: true, count: 1 });
    expect(await setFollow(t.db, carol, alice!.userId, true)).toMatchObject({ ok: true, count: 2 });
    expect(await setFollow(t.db, carol, alice!.userId, false)).toMatchObject({
      ok: true,
      count: 1,
    });
    expect((await setFollow(t.db, alice, alice!.userId, true)).ok).toBe(false);
  });
});

describe("explore filters", () => {
  it("filters by category, tool, license and style, and searches title and tags", async () => {
    await make(
      carol,
      {},
      meta({
        title: "Neon Arcade",
        category: "game",
        toolUsed: "gemini",
        licenseId: "cc0-1.0",
        styles: ["neon"],
        tags: ["arcade"],
      }),
    );
    const ids = async (f: Parameters<typeof listPublishedProjects>[1]) =>
      (await listPublishedProjects(t.db, f)).cards.map((c) => c.title);
    expect(await ids({ category: "game" })).toEqual(["Neon Arcade"]);
    expect(await ids({ tool: "gemini" })).toEqual(["Neon Arcade"]);
    expect(await ids({ license: "cc0-1.0" })).toEqual(["Neon Arcade"]);
    expect(await ids({ style: "neon" })).toEqual(["Neon Arcade"]);
    expect(await ids({ q: "arcade" })).toContain("Neon Arcade");
    expect(await ids({ q: "100%_" })).toEqual([]); // wildcards are literal
  });
});

describe("reports", () => {
  it("signed-in reports and public DMCA notices reach the admin queue", async () => {
    const p = await make(alice, {}, meta({ title: "Reported" }));
    expect(
      await createReport(t.db, bob!.userId, {
        projectId: p.id,
        profileId: null,
        reason: "spam",
        details: "",
        isDmca: false,
        contactName: null,
        contactEmail: null,
      }),
    ).toEqual({ ok: true });
    expect(
      await createReport(t.db, null, {
        projectId: p.id,
        profileId: null,
        reason: "copyright",
        details: "This copies my portfolio site word for word.",
        isDmca: true,
        contactName: "Rights Holder",
        contactEmail: "owner@example.com",
      }),
    ).toEqual({ ok: true });

    const queue = await listOpenReports(t.db, admin);
    const mine = queue.filter((r) => r.project?.id === p.id);
    expect(mine).toHaveLength(2);
    expect(mine[0]?.isDmca).toBe(true); // DMCA notices sort first

    expect(await listOpenReports(t.db, bob)).toEqual([]);
    expect(await dismissReport(t.db, admin, mine[1]!.id, "not spam")).toEqual({ ok: true });
    expect((await dismissReport(t.db, admin, mine[1]!.id)).ok).toBe(false);
  });

  it("rejects anonymous non-DMCA reports and incomplete DMCA notices", async () => {
    const p = await make(alice, {}, meta({ title: "Reported twice" }));
    const base = {
      projectId: p.id,
      profileId: null,
      details: "",
      contactName: null,
      contactEmail: null,
    };
    expect((await createReport(t.db, null, { ...base, reason: "spam", isDmca: false })).ok).toBe(
      false,
    );
    expect(
      (await createReport(t.db, null, { ...base, reason: "copyright", isDmca: true })).ok,
    ).toBe(false);
  });
});

describe("file storage", () => {
  it("never stores a path that escapes the project", async () => {
    const p = await make(alice, {}, meta({ title: "Paths" }));
    await expect(
      t.db
        .insert(projectFiles)
        .values({
          versionId: p.currentVersionId!,
          path: "../escape.html",
          blobSha256: "a".repeat(64),
          size: 1,
          mime: "text/html",
        }),
    ).rejects.toThrow();
  });
});
