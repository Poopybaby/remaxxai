import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_AVATARS, randomDefaultAvatarUrl } from "@/config/avatars";
import { PermissionError, type Viewer } from "@/lib/auth/permissions";
import { AvatarError, chooseDefaultAvatar, uploadAvatar } from "@/lib/avatars";
import { profiles } from "@/lib/db/schema";
import type { ModerationVerdict } from "@/lib/moderation";
import { createProfile } from "@/lib/profiles";
import { createAuthUser, createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
let me: Viewer;
const CREW = DEFAULT_AVATARS.map((a) => a.url);
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
]);
const pass = {
  moderate: async (): Promise<ModerationVerdict> => ({
    verdict: "pass",
    categories: [],
    source: "openai",
  }),
};

async function newProfile(handle: string, avatarUrl?: string | null) {
  const id = await createAuthUser(t.pg);
  const res = await createProfile(t.db, id, {
    handle,
    displayName: handle,
    ageConfirmed: true,
    termsAccepted: true,
    avatarUrl,
  });
  if (!res.ok) throw new Error(JSON.stringify(res.errors));
  return res.value;
}

async function avatarOf(id: string) {
  const [p] = await t.db
    .select({ a: profiles.avatarUrl })
    .from(profiles)
    .where(eq(profiles.id, id));
  return p?.a;
}

beforeAll(async () => {
  t = await createTestDb();
  me = { userId: (await newProfile("picky")).id, role: "user" };
});
afterAll(async () => {
  await t.close();
});

describe("default avatars", () => {
  it("gives every new account one of the crew, at random", async () => {
    expect(CREW).toContain((await newProfile("fresh")).avatarUrl);
    expect(CREW).toContain((await newProfile("fresh_two", null)).avatarUrl);
    expect(randomDefaultAvatarUrl(() => 0)).toBe(CREW[0]);
    expect(randomDefaultAvatarUrl(() => 0.9999)).toBe(CREW[3]);
  });

  it("keeps the crew in the migration in step with config/avatars.ts", () => {
    const sql = readFileSync(path.join(process.cwd(), "db/migrations/0007_avatars.sql"), "utf8");
    for (const url of CREW) expect(sql).toContain(`'${url}'`);
    const listed = sql.match(/array\[([^\]]+)\]/)?.[1]?.split(",").length;
    expect(listed).toBe(CREW.length);
  });

  it("gives profiles created any other way one too (database default)", async () => {
    const id = await createAuthUser(t.pg);
    await t.pg.query(
      "insert into profiles (id, handle, display_name, age_confirmed_at) values ($1, 'raw_insert', 'x', now())",
      [id],
    );
    expect(CREW).toContain(await avatarOf(id));
  });

  it("only stores picture URLs it knows how to serve safely", async () => {
    for (const bad of [
      "javascript:alert(1)",
      "/etc/passwd",
      "http://x.test/a.png",
      "/media/abc.svg",
    ]) {
      await expect(
        t.pg.query("update profiles set avatar_url = $1 where id = $2", [bad, me!.userId]),
      ).rejects.toThrow(/profiles_avatar_url_check/);
    }
  });
});

describe("changing the picture", () => {
  it("switches to another crew member", async () => {
    await chooseDefaultAvatar(t.db, me, "snooze");
    expect(await avatarOf(me!.userId)).toBe("/avatars/snooze.webp");
    await expect(chooseDefaultAvatar(t.db, me, "not-a-crew-member")).rejects.toThrow(AvatarError);
    await expect(chooseDefaultAvatar(t.db, null, "patch")).rejects.toThrow(PermissionError);
  });

  it("uploads your own picture", async () => {
    const res = await uploadAvatar(t.db, me, PNG, pass);
    expect(res.url).toMatch(/^\/media\/[a-f0-9]{64}\.png$/);
    expect(await avatarOf(me!.userId)).toBe(res.url);
  });

  it("refuses non-images, oversized files, flagged pictures and signed-out uploads", async () => {
    const before = await avatarOf(me!.userId);
    await expect(uploadAvatar(t.db, me, new TextEncoder().encode("<svg/>"), pass)).rejects.toThrow(
      /PNG, JPG, WebP or GIF/,
    );
    const big = new Uint8Array(1024 * 1024 + 1);
    big.set(PNG);
    await expect(uploadAvatar(t.db, me, big, pass)).rejects.toThrow(/under 1 MB/);
    await expect(
      uploadAvatar(t.db, me, PNG, {
        moderate: async () => ({ verdict: "flag", categories: ["sexual"], source: "openai" }),
      }),
    ).rejects.toThrow(/can't be used/);
    await expect(uploadAvatar(t.db, null, PNG, pass)).rejects.toThrow(PermissionError);
    expect(await avatarOf(me!.userId)).toBe(before);
  });
});
