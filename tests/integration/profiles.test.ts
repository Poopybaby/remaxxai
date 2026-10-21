import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEGAL_VERSIONS } from "@/config/legal";
import type { Viewer } from "@/lib/auth/permissions";
import { legalAcceptances, profiles } from "@/lib/db/schema";
import {
  createProfile,
  getProfileByHandle,
  isHandleAvailable,
  updateProfile,
} from "@/lib/profiles";
import { joinWaitlist } from "@/lib/waitlist";
import { createAuthUser, createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

const validInput = (handle: string) => ({
  handle,
  displayName: "Juno Rivera",
  ageConfirmed: true as const,
  termsAccepted: true as const,
});

describe("createProfile", () => {
  it("creates a profile and records legal acceptances", async () => {
    const userId = await createAuthUser(t.pg);
    const res = await createProfile(t.db, userId, validInput("Juno"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.handle).toBe("juno");
    expect(res.value.role).toBe("user");
    expect(res.value.ageConfirmedAt).toBeInstanceOf(Date);

    const accepted = await t.db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, userId));
    expect(accepted.map((a) => [a.document, a.version]).sort()).toEqual([
      ["acceptable_use", LEGAL_VERSIONS.acceptableUse],
      ["terms", LEGAL_VERSIONS.terms],
    ]);
  });

  it("requires age confirmation and terms acceptance", async () => {
    const userId = await createAuthUser(t.pg);
    const res = await createProfile(t.db, userId, {
      ...validInput("kai"),
      ageConfirmed: false as unknown as true,
      termsAccepted: false as unknown as true,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.ageConfirmed).toMatch(/18/);
    expect(res.errors.termsAccepted).toBeDefined();
    expect(await getProfileByHandle(t.db, "kai")).toBeNull();
  });

  it("rejects taken, reserved and malformed handles", async () => {
    const userId = await createAuthUser(t.pg);
    const taken = await createProfile(t.db, userId, validInput("JUNO"));
    expect(taken).toMatchObject({ ok: false, errors: { handle: expect.stringMatching(/taken/) } });
    const reserved = await createProfile(t.db, userId, validInput("admin"));
    expect(reserved).toMatchObject({
      ok: false,
      errors: { handle: expect.stringMatching(/reserved/) },
    });
    const bad = await createProfile(t.db, userId, validInput("no spaces"));
    expect(bad.ok).toBe(false);
  });

  it("refuses a second profile for the same user", async () => {
    const userId = await createAuthUser(t.pg);
    expect((await createProfile(t.db, userId, validInput("first_one"))).ok).toBe(true);
    const again = await createProfile(t.db, userId, validInput("second_one"));
    expect(again).toMatchObject({ ok: false, errors: { form: expect.any(String) } });
  });

  it("the database itself rejects invalid handles even if app checks are bypassed", async () => {
    const userId = await createAuthUser(t.pg);
    await expect(
      t.pg.query(
        "insert into profiles (id, handle, display_name, age_confirmed_at) values ($1, 'Bad Handle', 'x', now())",
        [userId],
      ),
    ).rejects.toThrow();
  });

  it("deleting the auth user removes the profile", async () => {
    const userId = await createAuthUser(t.pg);
    await createProfile(t.db, userId, validInput("leaving_soon"));
    await t.pg.query("delete from auth.users where id = $1", [userId]);
    expect(await isHandleAvailable(t.db, "leaving_soon")).toBe(true);
  });
});

describe("updateProfile", () => {
  let ownerId: string;
  let otherId: string;
  let owner: Viewer;
  let other: Viewer;
  let admin: Viewer;

  beforeAll(async () => {
    ownerId = await createAuthUser(t.pg);
    otherId = await createAuthUser(t.pg);
    await createProfile(t.db, ownerId, validInput("owner_person"));
    await createProfile(t.db, otherId, validInput("other_person"));
    owner = { userId: ownerId, role: "user" };
    other = { userId: otherId, role: "user" };
    admin = { userId: crypto.randomUUID(), role: "admin" };
  });

  it("lets the owner update display name, bio and website", async () => {
    const res = await updateProfile(t.db, owner, ownerId, {
      displayName: "  New Name ",
      bio: "I remix landing pages.",
      websiteUrl: "https://example.com",
    });
    expect(res).toMatchObject({
      ok: true,
      value: {
        displayName: "New Name",
        bio: "I remix landing pages.",
        websiteUrl: "https://example.com",
      },
    });
  });

  it("clears the website when left blank", async () => {
    const res = await updateProfile(t.db, owner, ownerId, {
      displayName: "N",
      bio: "",
      websiteUrl: "",
    });
    expect(res).toMatchObject({ ok: true, value: { websiteUrl: null } });
  });

  it("rejects non-http links", async () => {
    const res = await updateProfile(t.db, owner, ownerId, {
      displayName: "N",
      bio: "",
      websiteUrl: "javascript:alert(1)",
    });
    expect(res).toMatchObject({ ok: false, errors: { websiteUrl: expect.any(String) } });
  });

  it("blocks other users and anonymous visitors", async () => {
    const input = { displayName: "Hacked", bio: "", websiteUrl: "" };
    expect((await updateProfile(t.db, other, ownerId, input)).ok).toBe(false);
    expect((await updateProfile(t.db, null, ownerId, input)).ok).toBe(false);
    expect((await getProfileByHandle(t.db, "owner_person"))?.displayName).not.toBe("Hacked");
  });

  it("allows admins to moderate", async () => {
    const res = await updateProfile(t.db, admin, otherId, {
      displayName: "Moderated",
      bio: "",
      websiteUrl: "",
    });
    expect(res.ok).toBe(true);
  });

  it("ignores attempts to escalate role through extra fields", async () => {
    const sneaky = { displayName: "Me", bio: "", websiteUrl: "", role: "admin", handle: "admin" };
    await updateProfile(t.db, owner, ownerId, sneaky);
    const [row] = await t.db.select().from(profiles).where(eq(profiles.id, ownerId));
    expect(row?.role).toBe("user");
    expect(row?.handle).toBe("owner_person");
  });
});

describe("joinWaitlist", () => {
  it("stores normalized emails and treats repeats as success", async () => {
    expect(await joinWaitlist(t.db, "  Fan@Example.COM ")).toEqual({ ok: true });
    expect(await joinWaitlist(t.db, "fan@example.com")).toEqual({ ok: true });
    const res = await t.pg.query<{ count: number }>(
      "select count(*)::int as count from waitlist where email = 'fan@example.com'",
    );
    expect(res.rows[0]?.count).toBe(1);
  });

  it("rejects invalid emails", async () => {
    expect(await joinWaitlist(t.db, "not-an-email")).toMatchObject({ ok: false });
  });
});

describe("row level security", () => {
  it("is enabled on every app table, with no grants to browser roles", async () => {
    const rls = await t.pg.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migrations'`,
    );
    expect(rls.rows.length).toBeGreaterThan(0);
    for (const row of rls.rows) expect(row, row.relname).toMatchObject({ relrowsecurity: true });

    const grants = await t.pg.query(
      `select table_name, grantee from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')`,
    );
    expect(grants.rows).toEqual([]);
  });
});
