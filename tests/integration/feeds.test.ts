import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PermissionError } from "@/lib/auth/permissions";
import { projects } from "@/lib/db/schema";
import { setStaffPick } from "@/lib/moderation/actions";
import { listPublishedProjects } from "@/lib/projects/queries";
import { buildSeedSql, seedUuid } from "@/lib/seed/build-sql";
import { createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
const pid = (slug: string) => seedUuid(`project:${slug}`);
const admin = { userId: "00000000-0000-4000-8000-0000000000aa", role: "admin" as const };
const user = { userId: "00000000-0000-4000-8000-0000000000bb", role: "user" as const };

beforeAll(async () => {
  t = await createTestDb();
  await t.pg.exec(await buildSeedSql());
});
afterAll(async () => {
  await t.close();
});

describe("explore feeds", () => {
  it("trending puts engagement first among projects of the same age", async () => {
    await t.db.update(projects).set({ publishedAt: new Date(Date.now() - 2 * 86400_000) });
    await t.db
      .update(projects)
      .set({ likeCount: 40, remixCount: 5 })
      .where(eq(projects.id, pid("tip-split")));
    const { cards } = await listPublishedProjects(t.db, { sort: "trending" });
    expect(cards[0]?.slug).toBe("tip-split");
  });

  it("staff picks lists only picked projects, and only admins can pick", async () => {
    expect((await listPublishedProjects(t.db, { sort: "picks" })).cards).toEqual([]);
    await expect(setStaffPick(t.db, user, pid("moonbrew"), true)).rejects.toThrow(PermissionError);
    await setStaffPick(t.db, admin, pid("moonbrew"), true);
    const { cards } = await listPublishedProjects(t.db, { sort: "picks" });
    expect(cards.map((c) => c.slug)).toEqual(["moonbrew"]);
    expect(cards[0]?.isStaffPick).toBe(true);
    await setStaffPick(t.db, admin, pid("moonbrew"), false);
    expect((await listPublishedProjects(t.db, { sort: "picks" })).cards).toEqual([]);
  });
});
