import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getModel, type ModelEntry } from "@/config/models";
import { PLANS } from "@/config/plans";
import { PermissionError, type Viewer } from "@/lib/auth/permissions";
import {
  adminAdjustCredits,
  applyEntries,
  authorizeAiRequest,
  estimateCredits,
  getEntitlement,
  InsufficientCreditsError,
  refundAiRequest,
  releaseStaleHolds,
  settleAiRequest,
  startBillingPeriod,
  grantUpgradeDifference,
  expireAllCredits,
} from "@/lib/billing/credits";
import { aiMessages, creditAccounts, creditLedger, subscriptions } from "@/lib/db/schema";
import { createProfile } from "@/lib/profiles";
import { createAuthUser, createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
const users: string[] = [];
const mini = getModel("gpt-mini") as ModelEntry;
const top = getModel("gpt") as ModelEntry;

async function newUser(role: "user" | "admin" = "user"): Promise<string> {
  const id = await createAuthUser(t.pg);
  const res = await createProfile(t.db, id, {
    handle: `u${id.replace(/-/g, "").slice(0, 12)}`,
    displayName: "x",
    ageConfirmed: true,
    termsAccepted: true,
  });
  if (!res.ok) throw new Error(JSON.stringify(res.errors));
  if (role === "admin") await t.pg.query("update profiles set role = 'admin' where id = $1", [id]);
  users.push(id);
  return id;
}

async function account(userId: string) {
  const [a] = await t.db.select().from(creditAccounts).where(eq(creditAccounts.userId, userId));
  return a!;
}

async function pendingReply(userId: string): Promise<string> {
  const [r] = await t.db
    .insert(aiMessages)
    .values({ userId, kind: "edit", role: "assistant", status: "pending" })
    .returning({ id: aiMessages.id });
  return r!.id;
}

async function subscribe(userId: string, plan: keyof typeof PLANS) {
  await t.db
    .insert(subscriptions)
    .values({
      userId,
      stripeCustomerId: `cus_${userId.slice(0, 8)}`,
      stripeSubscriptionId: `sub_${userId.slice(0, 8)}`,
      planId: plan,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
    })
    .onConflictDoUpdate({ target: subscriptions.userId, set: { planId: plan, status: "active" } });
}

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

// The core invariant: the cached balance always equals the sum of the ledger.
afterEach(async () => {
  for (const userId of users) {
    const res = await t.pg.query<{ balance: number; sum: number }>(
      `select a.balance, coalesce((select sum(delta) from credit_ledger l where l.user_id = a.user_id), 0)::int as sum
       from credit_accounts a where a.user_id = $1`,
      [userId],
    );
    expect(res.rows[0]?.balance).toBe(res.rows[0]?.sum);
    expect(res.rows[0]?.balance).toBeGreaterThanOrEqual(0);
  }
});

describe("accounts and the ledger", () => {
  it("gives every new account its free prompts and no credits", async () => {
    const u = await newUser();
    expect(await account(u)).toMatchObject({ balance: 0, trialPrompts: 2 });
    expect((await getEntitlement(t.db, u)).plan).toBeNull();
  });

  it("applies each idempotency key once, so retries do nothing", async () => {
    const u = await newUser();
    const grant = { delta: 100, kind: "admin_adjust" as const, key: `test:${u}` };
    expect((await applyEntries(t.db, u, [grant])).balance).toBe(100);
    expect(await applyEntries(t.db, u, [grant])).toEqual({ balance: 100, applied: 0 });
  });

  it("refuses to go below zero and writes nothing when it would", async () => {
    const u = await newUser();
    await applyEntries(t.db, u, [{ delta: 5, kind: "admin_adjust", key: `a:${u}` }]);
    await expect(
      applyEntries(t.db, u, [{ delta: -6, kind: "spend", key: `b:${u}` }]),
    ).rejects.toThrow(InsufficientCreditsError);
    expect((await account(u)).balance).toBe(5);
    expect(
      await t.db
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.idempotencyKey, `b:${u}`)),
    ).toEqual([]);
  });

  it("can't be edited or deleted, but goes away with a deleted account", async () => {
    const u = await newUser();
    await applyEntries(t.db, u, [{ delta: 1, kind: "admin_adjust", key: `c:${u}` }]);
    await expect(
      t.db.update(creditLedger).set({ delta: 1000 }).where(eq(creditLedger.userId, u)),
    ).rejects.toThrow();
    await expect(t.db.delete(creditLedger).where(eq(creditLedger.userId, u))).rejects.toThrow();
    users.splice(users.indexOf(u), 1);
    await t.pg.query("delete from profiles where id = $1", [u]);
    expect(await t.db.select().from(creditLedger).where(eq(creditLedger.userId, u))).toEqual([]);
  });
});

describe("estimates", () => {
  it("costs more for bigger projects and pricier models, and holds more than it expects to charge", () => {
    const small = estimateCredits(mini, "edit", 5_000, 16_000);
    const big = estimateCredits(mini, "edit", 50_000, 16_000);
    const pricey = estimateCredits(top, "edit", 5_000, 16_000);
    expect(big.typical).toBeGreaterThan(small.typical);
    expect(pricey.typical).toBeGreaterThan(small.typical);
    expect(small.max).toBeGreaterThan(small.typical);
    expect(small.typical).toBeGreaterThanOrEqual(1);
  });
});

describe("charging for AI requests", () => {
  const est = { typical: 5, max: 40 };

  it("holds up to the maximum, then charges only what the request actually cost", async () => {
    const u = await newUser();
    await applyEntries(t.db, u, [{ delta: 100, kind: "admin_adjust", key: `g:${u}` }]);
    const replyId = await pendingReply(u);
    const auth = await authorizeAiRequest(t.db, { userId: u, model: mini, estimate: est, replyId });
    expect(auth).toEqual({ ok: true, mode: "credits", hold: 40 });
    expect((await account(u)).balance).toBe(60);

    // $0.012 × 2.5 markup ÷ $0.01 = 3 credits.
    expect(
      await settleAiRequest(t.db, { userId: u, replyId, auth: auth as never, costUsd: 0.012 }),
    ).toBe(3);
    expect((await account(u)).balance).toBe(97);
    const [msg] = await t.db.select().from(aiMessages).where(eq(aiMessages.id, replyId));
    expect(msg?.creditsCharged).toBe(3);
  });

  it("never charges more than it held", async () => {
    const u = await newUser();
    await applyEntries(t.db, u, [{ delta: 10, kind: "admin_adjust", key: `g2:${u}` }]);
    const replyId = await pendingReply(u);
    const auth = await authorizeAiRequest(t.db, { userId: u, model: mini, estimate: est, replyId });
    expect(auth).toMatchObject({ ok: true, hold: 10 });
    expect(
      await settleAiRequest(t.db, { userId: u, replyId, auth: auth as never, costUsd: 5 }),
    ).toBe(10);
    expect((await account(u)).balance).toBe(0);
  });

  it("gives everything back when the request fails", async () => {
    const u = await newUser();
    await applyEntries(t.db, u, [{ delta: 50, kind: "admin_adjust", key: `g3:${u}` }]);
    const replyId = await pendingReply(u);
    const auth = await authorizeAiRequest(t.db, { userId: u, model: mini, estimate: est, replyId });
    await refundAiRequest(t.db, { userId: u, replyId, auth: auth as never });
    expect((await account(u)).balance).toBe(50);
  });

  it("uses a free prompt when there aren't enough credits, on Starter models only, and refunds it on failure", async () => {
    const u = await newUser();
    const replyId = await pendingReply(u);
    const auth = await authorizeAiRequest(t.db, { userId: u, model: mini, estimate: est, replyId });
    expect(auth).toEqual({ ok: true, mode: "trial", hold: 0 });
    expect((await account(u)).trialPrompts).toBe(1);
    await refundAiRequest(t.db, { userId: u, replyId, auth: auth as never });
    expect((await account(u)).trialPrompts).toBe(2);

    const locked = await authorizeAiRequest(t.db, {
      userId: u,
      model: top,
      estimate: est,
      replyId: await pendingReply(u),
    });
    expect(locked).toMatchObject({ ok: false, code: "model_locked" });
  });

  it("stops hard when there are no credits and no free prompts left", async () => {
    const u = await newUser();
    await t.db.update(creditAccounts).set({ trialPrompts: 0 }).where(eq(creditAccounts.userId, u));
    const res = await authorizeAiRequest(t.db, {
      userId: u,
      model: mini,
      estimate: est,
      replyId: await pendingReply(u),
    });
    expect(res).toMatchObject({
      ok: false,
      code: "no_credits",
      message: expect.stringMatching(/out of credits/),
    });
  });

  it("lets two requests share a balance without overspending it", async () => {
    const u = await newUser();
    await t.db.update(creditAccounts).set({ trialPrompts: 0 }).where(eq(creditAccounts.userId, u));
    await applyEntries(t.db, u, [{ delta: 8, kind: "admin_adjust", key: `g4:${u}` }]);
    const [a, b] = await Promise.all([
      authorizeAiRequest(t.db, {
        userId: u,
        model: mini,
        estimate: { typical: 5, max: 5 },
        replyId: await pendingReply(u),
      }),
      authorizeAiRequest(t.db, {
        userId: u,
        model: mini,
        estimate: { typical: 5, max: 5 },
        replyId: await pendingReply(u),
      }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((await account(u)).balance).toBe(3);
  });

  it("unlocks top models with Pro, not with Starter", async () => {
    const u = await newUser();
    await applyEntries(t.db, u, [{ delta: 100, kind: "admin_adjust", key: `g5:${u}` }]);
    await subscribe(u, "starter");
    expect(
      await authorizeAiRequest(t.db, {
        userId: u,
        model: top,
        estimate: est,
        replyId: await pendingReply(u),
      }),
    ).toMatchObject({
      ok: false,
      code: "model_locked",
    });
    await subscribe(u, "pro");
    expect(
      await authorizeAiRequest(t.db, {
        userId: u,
        model: top,
        estimate: est,
        replyId: await pendingReply(u),
      }),
    ).toMatchObject({
      ok: true,
      mode: "credits",
    });
  });

  it("returns credits held by requests that never finished", async () => {
    const u = await newUser();
    await applyEntries(t.db, u, [{ delta: 30, kind: "admin_adjust", key: `g6:${u}` }]);
    const replyId = await pendingReply(u);
    await authorizeAiRequest(t.db, { userId: u, model: mini, estimate: est, replyId });
    expect((await account(u)).balance).toBe(0);
    await t.db
      .update(aiMessages)
      .set({ createdAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(aiMessages.id, replyId));
    expect(await releaseStaleHolds(t.db, u, new Date(Date.now() - 3 * 60_000))).toBe(1);
    expect((await account(u)).balance).toBe(30);
    expect(await releaseStaleHolds(t.db, u, new Date())).toBe(0);
  });
});

describe("billing periods", () => {
  it("expires unused credits and grants the plan's credits once per paid invoice", async () => {
    const u = await newUser();
    await applyEntries(t.db, u, [{ delta: 42, kind: "admin_adjust", key: `p:${u}` }]);
    await startBillingPeriod(t.db, { userId: u, plan: PLANS.starter, invoiceId: `in_1_${u}` });
    expect((await account(u)).balance).toBe(600);
    await startBillingPeriod(t.db, { userId: u, plan: PLANS.starter, invoiceId: `in_1_${u}` });
    expect((await account(u)).balance).toBe(600);
    await applyEntries(t.db, u, [{ delta: -100, kind: "spend", key: `s:${u}` }]);
    await startBillingPeriod(t.db, { userId: u, plan: PLANS.starter, invoiceId: `in_2_${u}` });
    expect((await account(u)).balance).toBe(600);
    const kinds = await t.db
      .select({ kind: creditLedger.kind, delta: creditLedger.delta })
      .from(creditLedger)
      .where(eq(creditLedger.userId, u));
    expect(kinds.filter((k) => k.kind === "expiry").map((k) => k.delta)).toEqual([-42, -500]);
  });

  it("tops up the difference on an upgrade, and expires everything when the plan ends", async () => {
    const u = await newUser();
    await startBillingPeriod(t.db, { userId: u, plan: PLANS.starter, invoiceId: `in_a_${u}` });
    await grantUpgradeDifference(t.db, {
      userId: u,
      from: PLANS.starter,
      to: PLANS.pro,
      invoiceId: `in_b_${u}`,
    });
    expect((await account(u)).balance).toBe(1800);
    await grantUpgradeDifference(t.db, {
      userId: u,
      from: PLANS.pro,
      to: PLANS.starter,
      invoiceId: `in_c_${u}`,
    });
    expect((await account(u)).balance).toBe(1800);
    await expireAllCredits(t.db, u, `end:${u}`);
    await expireAllCredits(t.db, u, `end:${u}`);
    expect((await account(u)).balance).toBe(0);
  });
});

describe("admin adjustments", () => {
  it("only admins can adjust, and removals stop at zero", async () => {
    const admin = await newUser("admin");
    const u = await newUser();
    const asAdmin: Viewer = { userId: admin, role: "admin" };
    await expect(
      adminAdjustCredits(
        t.db,
        { userId: u, role: "user" },
        { userId: u, delta: 100, note: "", requestId: "r0" },
      ),
    ).rejects.toThrow(PermissionError);
    expect(
      await adminAdjustCredits(t.db, asAdmin, {
        userId: u,
        delta: 250,
        note: "testing",
        requestId: `r1:${u}`,
      }),
    ).toBe(250);
    expect(
      await adminAdjustCredits(t.db, asAdmin, {
        userId: u,
        delta: -1000,
        note: "",
        requestId: `r2:${u}`,
      }),
    ).toBe(0);
    await expect(
      adminAdjustCredits(t.db, asAdmin, { userId: u, delta: 1.5, note: "", requestId: "r3" }),
    ).rejects.toThrow();
  });
});
