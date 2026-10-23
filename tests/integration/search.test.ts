import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { projectSearch, projects } from "@/lib/db/schema";
import { createProfile } from "@/lib/profiles";
import { createProject } from "@/lib/projects/create";
import { projectMetadataSchema } from "@/lib/projects/metadata";
import { buildSeedSql, seedUuid } from "@/lib/seed/build-sql";
import { indexProjects, indexStatus } from "@/lib/search/indexer";
import { getStyleDescription, similarProjects, vibeSearch } from "@/lib/search/query";
import { validateUpload } from "@/lib/upload/validate";
import { createAuthUser, createTestDb, type TestDb } from "../helpers/db";
import { fakeEmbedder, hashVector } from "../helpers/embedder";

let t: TestDb;
const enc = new TextEncoder();
const pid = (slug: string) => seedUuid(`project:${slug}`);

beforeAll(async () => {
  t = await createTestDb();
  await t.pg.exec(await buildSeedSql());
});
afterAll(async () => {
  await t.close();
});

async function upload(title: string, css: string, extra: Record<string, unknown> = {}) {
  const id = await createAuthUser(t.pg);
  const handle = `u${id.replace(/-/g, "").slice(0, 10)}`;
  const res = await createProfile(t.db, id, {
    handle,
    displayName: handle,
    ageConfirmed: true,
    termsAccepted: true,
  });
  if (!res.ok) throw new Error(JSON.stringify(res.errors));
  const v = validateUpload([
    {
      path: "index.html",
      bytes: enc.encode(`<!doctype html><title>${title}</title><h1>${title}</h1>`),
    },
    { path: "style.css", bytes: enc.encode(css) },
  ]);
  if (!v.ok) throw new Error("fixture invalid");
  return createProject(t.db, {
    ownerId: id,
    metadata: projectMetadataSchema.parse({
      title,
      description: "An uploaded test template.",
      category: "landing-page",
      toolUsed: "claude",
      licenseId: "mit",
      styles: [],
      tags: ["test"],
      rightsConfirmed: true,
      ...extra,
    }),
    files: v.files,
    entryPath: v.entryPath,
    coverUrl: null,
    status: "published",
  });
}

describe("seeded search index", () => {
  it("the seed writes a hand-written description and search text for every template", async () => {
    const status = await indexStatus(t.db);
    expect(status).toEqual({ published: 29, indexed: 29, embedded: 0 });
    expect(await getStyleDescription(t.db, pid("ledgerline"))).toMatch(/fintech dashboard/);
  });

  it("works as word search before any embeddings exist", async () => {
    const res = await vibeSearch(t.db, {
      q: "dark glassy fintech dashboard",
      filters: {},
      queryVector: null,
    });
    expect(res.mode).toBe("keyword");
    expect(res.cards[0]?.slug).toBe("ledgerline");
    expect(res.cards[0]?.reasons.map((r) => r.label)).toContain("Glassy");
  });
});

describe("indexer", () => {
  it("embeds the seeds in one batch, keeping their hand-written descriptions", async () => {
    const embedder = fakeEmbedder();
    const res = await indexProjects(t.db, { embedder, describer: null });
    expect(res).toMatchObject({ indexed: 29, embedded: 29, described: 0, failed: 0 });
    expect(embedder.calls).toHaveLength(1);
    const [row] = await t.db
      .select()
      .from(projectSearch)
      .where(eq(projectSearch.projectId, pid("moonbrew")));
    expect(row?.styleSource).toBe("seed");
    expect(row?.embeddingModel).toBe("fake-embedding");
    expect(await indexStatus(t.db)).toEqual({ published: 29, indexed: 29, embedded: 29 });
  });

  it("does nothing on a second run", async () => {
    const embedder = fakeEmbedder();
    const res = await indexProjects(t.db, { embedder, describer: null });
    expect(res.indexed).toBe(0);
    expect(embedder.calls).toHaveLength(0);
  });

  it("re-embeds everything when the embedding model changes", async () => {
    const embedder = fakeEmbedder({ model: "fake-embedding-v2" });
    const res = await indexProjects(t.db, { embedder, describer: null, limit: 200 });
    expect(res.embedded).toBe(29);
    // Put the original model back for the rest of the file.
    await indexProjects(t.db, { embedder: fakeEmbedder(), describer: null });
  });

  it("describes an upload with AI, treating the code as data", async () => {
    const p = await upload(
      "Midnight Glass",
      "body{background:#05050a} .card{backdrop-filter:blur(10px)}",
    );
    let seen = "";
    const res = await indexProjects(t.db, {
      embedder: fakeEmbedder(),
      describer: async (input) => {
        seen = input.code;
        expect(input.hints).toEqual(
          expect.arrayContaining(["dark background", "frosted glass panels"]),
        );
        return "A **moody** midnight look with frosted <i>glass</i> cards. https://x.example";
      },
      projectIds: [p.id],
    });
    expect(res).toMatchObject({ indexed: 1, embedded: 1, described: 1 });
    expect(seen).toContain("backdrop-filter");
    expect(await getStyleDescription(t.db, p.id)).toBe(
      "A moody midnight look with frosted glass cards.",
    );
  });

  it("falls back to code hints when the AI describer fails, and still embeds", async () => {
    const p = await upload(
      "Paper Brut",
      ".x{border:4px solid #000}.y{border:4px solid #000}.z{border:6px solid #000}.s{box-shadow:5px 5px 0 #000} body{background:#fff}",
    );
    const res = await indexProjects(t.db, {
      embedder: fakeEmbedder(),
      describer: async () => {
        throw new Error("model down");
      },
      projectIds: [p.id],
    });
    expect(res).toMatchObject({ indexed: 1, embedded: 1, described: 0, failed: 0 });
    const [row] = await t.db.select().from(projectSearch).where(eq(projectSearch.projectId, p.id));
    expect(row?.styleSource).toBe("auto");
    expect(row?.styleDescription).toMatch(/thick borders/);
  });

  it("keeps the words-only index when embedding fails, and fills it in on the next run", async () => {
    const p = await upload("Offline Day", "body{background:#fafafa}");
    const down = await indexProjects(t.db, {
      embedder: fakeEmbedder({ fail: true }),
      describer: null,
      projectIds: [p.id],
    });
    expect(down).toMatchObject({ indexed: 1, embedded: 0 });
    const words = await vibeSearch(t.db, { q: "offline day", filters: {}, queryVector: null });
    expect(words.cards[0]?.id).toBe(p.id);
    const up = await indexProjects(t.db, {
      embedder: fakeEmbedder(),
      describer: null,
      projectIds: [p.id],
    });
    expect(up.embedded).toBe(1);
  });

  it("skips projects that aren't public", async () => {
    const p = await upload("Hidden Thing", "body{background:#000}");
    await t.db.update(projects).set({ status: "unpublished" }).where(eq(projects.id, p.id));
    const res = await indexProjects(t.db, {
      embedder: fakeEmbedder(),
      describer: null,
      projectIds: [p.id],
    });
    expect(res.indexed).toBe(0);
  });
});

describe("vibeSearch with embeddings", () => {
  const search = (q: string, filters = {}) =>
    vibeSearch(t.db, { q, filters, queryVector: hashVector(q) });

  it.each([
    ["dark glassy fintech dashboard", "ledgerline"],
    ["playful pastel booking site", "petal-and-pine"],
    ["neon retro arcade game", "arcade-snake"],
  ])("“%s” finds %s first", async (q, slug) => {
    const res = await search(q);
    expect(res.mode).toBe("vibe");
    expect(res.cards[0]?.slug).toBe(slug);
  });

  it("applies the dropdown filters on top of the vibe", async () => {
    const res = await search("dark", { category: "game" });
    expect(res.cards.length).toBeGreaterThan(0);
    expect(res.cards.every((c) => c.category === "game")).toBe(true);
  });

  it("never returns hidden projects", async () => {
    const res = await search("hidden thing");
    expect(res.cards.map((c) => c.title)).not.toContain("Hidden Thing");
  });

  it("returns nothing for an empty query with no vector", async () => {
    expect((await vibeSearch(t.db, { q: "the a", filters: {}, queryVector: null })).cards).toEqual(
      [],
    );
  });
});

describe("similarProjects", () => {
  it("finds the closest templates and says what they share", async () => {
    const cards = await similarProjects(t.db, pid("arcade-snake"));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.map((c) => c.slug)).not.toContain("arcade-snake");
    expect(cards.slice(0, 3).map((c) => c.slug)).toContain("synthwave-countdown");
    expect(cards[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("still works for a project without an embedding", async () => {
    await t.db
      .update(projectSearch)
      .set({ embedding: null })
      .where(eq(projectSearch.projectId, pid("moonbrew")));
    const cards = await similarProjects(t.db, pid("moonbrew"));
    expect(cards.map((c) => c.slug)).toContain("petal-and-pine");
  });
});
