import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LICENSES, type LicenseId } from "@/config/licenses";
import { isCategoryId, isStyleId, isToolId } from "@/config/taxonomy";
import { getCreditChain } from "@/lib/licensing/chain";
import { allowedRemixLicenses } from "@/lib/licensing/compat";
import { getProjectBySlug, getVersionFile, listPublishedProjects } from "@/lib/projects/queries";
import {
  buildSeedSql,
  loadSeedTemplates,
  seedUuid,
  type LoadedTemplate,
} from "@/lib/seed/build-sql";
import { SEED_TEMPLATES, STUDIO } from "@/seed/catalog";
import { createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
let templates: LoadedTemplate[];
let sql: string;

beforeAll(async () => {
  t = await createTestDb();
  templates = await loadSeedTemplates();
  sql = await buildSeedSql(templates);
});
afterAll(async () => {
  await t.close();
});

describe("seed catalog", () => {
  it("has 25-30 templates with unique slugs and valid metadata", () => {
    expect(SEED_TEMPLATES.length).toBeGreaterThanOrEqual(25);
    expect(SEED_TEMPLATES.length).toBeLessThanOrEqual(30);
    expect(new Set(SEED_TEMPLATES.map((s) => s.slug)).size).toBe(SEED_TEMPLATES.length);
    for (const s of SEED_TEMPLATES) {
      expect(isCategoryId(s.category), s.slug).toBe(true);
      expect(isToolId(s.tool), s.slug).toBe(true);
      expect(LICENSES[s.license], s.slug).toBeDefined();
      for (const style of s.styles) expect(isStyleId(style), `${s.slug}: ${style}`).toBe(true);
      expect(s.title.length).toBeGreaterThanOrEqual(3);
      expect(s.title.length).toBeLessThanOrEqual(80);
    }
  });

  it("covers varied aesthetics and categories", () => {
    expect(new Set(SEED_TEMPLATES.flatMap((s) => s.styles)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(SEED_TEMPLATES.map((s) => s.category)).size).toBeGreaterThanOrEqual(8);
  });

  it("every template passes the same validation and scanner as uploads, and has a cover", () => {
    expect(templates).toHaveLength(SEED_TEMPLATES.length);
    for (const tpl of templates) {
      expect(tpl.entryPath).toBe("index.html");
      expect(
        existsSync(path.join(process.cwd(), "public", "seed", "covers", `${tpl.slug}.jpg`)),
        `cover for ${tpl.slug}`,
      ).toBe(true);
    }
  });

  it("every remix uses a license its ancestors allow", () => {
    const bySlug = new Map(SEED_TEMPLATES.map((s) => [s.slug, s]));
    for (const s of SEED_TEMPLATES.filter((x) => x.parent)) {
      const chain: LicenseId[] = [];
      for (let a = bySlug.get(s.parent!); a; a = a.parent ? bySlug.get(a.parent) : undefined)
        chain.push(a.license);
      expect(allowedRemixLicenses(chain), s.slug).toContain(s.license);
    }
  });

  it("templates load nothing from other websites (they must work offline in the sandbox)", () => {
    for (const tpl of templates) {
      for (const f of tpl.files) {
        const text = new TextDecoder().decode(f.bytes);
        expect(text, `${tpl.slug}/${f.path}`).not.toMatch(
          /<(script|link)[^>]+(src|href)=["']https?:/i,
        );
        expect(text, `${tpl.slug}/${f.path}`).not.toMatch(/@import\s+url\(["']?https?:/i);
      }
    }
  });
});

describe("seed SQL", () => {
  it("loads into a migrated database, and running it twice changes nothing", async () => {
    await t.pg.exec(sql);
    const count = async () =>
      (await t.pg.query<{ n: number }>("select count(*)::int as n from projects")).rows[0]?.n;
    const blobs = async () =>
      (await t.pg.query<{ n: number }>("select count(*)::int as n from blobs")).rows[0]?.n;
    const first = [await count(), await blobs()];
    await t.pg.exec(sql);
    expect([await count(), await blobs()]).toEqual(first);
    expect(first[0]).toBe(SEED_TEMPLATES.length);
  });

  it("publishes everything under the studio account and fills the explore feed", async () => {
    const { cards } = await listPublishedProjects(t.db, {});
    expect(cards.length).toBe(Math.min(24, SEED_TEMPLATES.length));
    expect(cards.every((c) => c.owner.handle === STUDIO.handle)).toBe(true);
    expect(cards[0]?.slug).toBe("ledgerline");
  });

  it("serves every template file from its version", async () => {
    for (const tpl of templates) {
      const p = await getProjectBySlug(t.db, tpl.slug);
      expect(p?.currentVersionId, tpl.slug).toBe(seedUuid(`version:${tpl.slug}`));
      for (const f of tpl.files) {
        const file = await getVersionFile(t.db, p!.currentVersionId!, f.path);
        expect(file?.bytes.byteLength, `${tpl.slug}/${f.path}`).toBe(f.bytes.byteLength);
      }
    }
  });

  it("records the Moonbrew remix chain with credits and remix counts", async () => {
    const chain = await getCreditChain(t.db, seedUuid("project:moonbrew-live"));
    expect(chain.map((c) => c.slug)).toEqual(["moonbrew-night", "moonbrew"]);
    const original = await getProjectBySlug(t.db, "moonbrew");
    expect(original?.remixCount).toBe(1);
    const live = await t.pg.query<{ root: string }>(
      "select root_project_id as root from projects where slug = 'moonbrew-live'",
    );
    expect(live.rows[0]?.root).toBe(seedUuid("project:moonbrew"));
  });

  it("tags styles and topics so filters work", async () => {
    expect(
      (await listPublishedProjects(t.db, { style: "neon" })).cards.map((c) => c.slug).sort(),
    ).toEqual(["arcade-snake", "synthwave-countdown"].sort());
    expect((await listPublishedProjects(t.db, { q: "fintech" })).cards.map((c) => c.slug)).toEqual([
      "ledgerline",
    ]);
  });
});
