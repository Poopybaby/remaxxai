import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PermissionError, type Viewer } from "@/lib/auth/permissions";
import {
  getModelCosts,
  getOverview,
  getWebhookStatus,
  listUsers,
  startOfUtcMonth,
} from "@/lib/admin/dashboard";
import { aiMessages, stripeEvents, subscriptions } from "@/lib/db/schema";
import { createProfile } from "@/lib/profiles";
import { buildSeedSql } from "@/lib/seed/build-sql";
import { createAuthUser, createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
let admin: Viewer;
let member: Viewer;

async function newUser(handle: string, role: "user" | "admin" = "user"): Promise<string> {
  const id = await createAuthUser(t.pg);
  const res = await createProfile(t.db, id, {
    handle,
    displayName: handle.replace(/_/g, " "),
    ageConfirmed: true,
    termsAccepted: true,
  });
  if (!res.ok) throw new Error(JSON.stringify(res.errors));
  if (role === "admin") await t.pg.query("update profiles set role = 'admin' where id = $1", [id]);
  return id;
}

async function subscribe(userId: string, plan: string, status = "active", endsInDays = 30) {
  await t.db.insert(subscriptions).values({
    userId,
    stripeCustomerId: `cus_${userId.slice(0, 8)}`,
    stripeSubscriptionId: `sub_${userId.slice(0, 8)}`,
    planId: plan,
    status,
    currentPeriodEnd: new Date(Date.now() + endsInDays * 86_400_000),
  });
}

beforeAll(async () => {
  t = await createTestDb();
  await t.pg.exec(await buildSeedSql());
  admin = { userId: await newUser("boss", "admin"), role: "admin" };
  member = { userId: await newUser("plain_member"), role: "user" };
  await subscribe(member.userId, "pro");
  await subscribe(await newUser("power_one"), "power");
  await subscribe(await newUser("power_two"), "power", "past_due");
  await subscribe(await newUser("lapsed"), "starter", "canceled");
  await subscribe(await newUser("expired"), "starter", "active", -1);
  await newUser("ab_c");
  await newUser("abxc");

  const reply = (
    userId: string,
    modelId: string,
    extra: Partial<typeof aiMessages.$inferInsert>,
  ) => ({
    userId,
    modelId,
    kind: "edit" as const,
    role: "assistant" as const,
    status: "ok" as const,
    ...extra,
  });
  await t.db.insert(aiMessages).values([
    reply(member.userId, "gpt-mini", {
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.004,
      creditsCharged: 1,
    }),
    reply(member.userId, "gpt-mini", { costUsd: 0.002, usedTrial: true }),
    reply(member.userId, "gpt", { costUsd: 0.1, creditsCharged: 25 }),
    reply(member.userId, "gpt", { status: "error" }),
    reply(admin.userId, "gpt", { costUsd: 0.05 }),
    // Last month: not counted.
    reply(member.userId, "gpt", { costUsd: 9, createdAt: new Date(Date.UTC(2020, 0, 5)) }),
    // The person's own message is not a model call.
    { userId: member.userId, kind: "edit", role: "user", content: "hi", modelId: "gpt" },
  ]);
});
afterAll(async () => {
  await t.close();
});

describe("admin dashboard", () => {
  it("is for admins only", async () => {
    await expect(getOverview(t.db, member)).rejects.toThrow(PermissionError);
    await expect(getModelCosts(t.db, null, new Date())).rejects.toThrow(PermissionError);
    await expect(listUsers(t.db, member)).rejects.toThrow(PermissionError);
  });

  it("counts people, templates and live plans, and works out monthly revenue", async () => {
    const o = await getOverview(t.db, admin);
    // The seed's studio account plus the eight people above.
    expect(o.users.total).toBe(9);
    expect(o.users.newLast7Days).toBe(9);
    expect(o.templates.published).toBe(29);
    // Cancelled and expired subscriptions don't count; past_due still does until it ends.
    expect(o.plans).toEqual({ starter: 0, pro: 1, power: 2 });
    expect(o.mrrUsd).toBe(34 + 89 * 2);
  });

  it("totals AI cost per model for this month, with free and admin use split out", async () => {
    const rows = await getModelCosts(t.db, admin, startOfUtcMonth(new Date()));
    expect(rows.map((r) => r.modelId)).toEqual(["gpt", "gpt-mini"]);
    expect(rows[0]).toMatchObject({
      requests: 3,
      errors: 1,
      creditsCharged: 25,
      adminRequests: 1,
      freeRequests: 0,
    });
    expect(rows[0]!.providerUsd).toBeCloseTo(0.15);
    expect(rows[1]).toMatchObject({
      requests: 2,
      inputTokens: 1000,
      outputTokens: 500,
      creditsCharged: 1,
      freeRequests: 1,
    });
  });

  it("lists people with their plan and balance, and searches handles literally", async () => {
    const all = await listUsers(t.db, admin, { limit: 3 });
    expect(all.rows).toHaveLength(3);
    expect(all.hasMore).toBe(true);
    const one = await listUsers(t.db, admin, { query: "@plain" });
    expect(one.rows).toHaveLength(1);
    expect(one.rows[0]).toMatchObject({ handle: "plain_member", plan: "pro", trialPrompts: 2 });
    expect(one.rows[0]!.aiRequests30d).toBe(4);
    // "_" is a wildcard in SQL LIKE; here it must only match an actual underscore.
    expect((await listUsers(t.db, admin, { query: "ab_c" })).rows.map((r) => r.handle)).toEqual([
      "ab_c",
    ]);
    const expired = await listUsers(t.db, admin, { query: "expired" });
    expect(expired.rows[0]).toMatchObject({ plan: null, subscriptionStatus: "active" });
  });

  it("reports when Stripe last reached the webhook", async () => {
    expect(await getWebhookStatus(t.db)).toEqual({ lastAt: null, lastType: null, total: 0 });
    await t.db.insert(stripeEvents).values({ id: "evt_1", type: "invoice.paid" });
    const s = await getWebhookStatus(t.db);
    expect(s).toMatchObject({ lastType: "invoice.paid", total: 1 });
    expect(s.lastAt).toBeInstanceOf(Date);
  });
});
