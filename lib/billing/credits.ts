/**
 * Credits: grants, AI holds and settlements, expiry, and admin adjustments.
 *
 * Every change goes through applyEntries(): it locks the person's credit_accounts row, writes
 * ledger rows (skipping any whose idempotency key was already used, so retries are safe), and
 * updates the cached balance in the same transaction. The balance can never go below zero.
 * tests/integration/credits.test.ts checks balance == SUM(ledger) after every scenario.
 */
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  FREE_LIMITS,
  FREE_TRIAL_PROMPTS,
  PLANS,
  creditsForCost,
  isPlanId,
  modelAllowed,
  type Plan,
} from "@/config/plans";
import type { ModelEntry } from "@/config/models";
import { assert, canModerate, type Viewer } from "@/lib/auth/permissions";
import {
  aiMessages,
  creditAccounts,
  creditLedger,
  subscriptions,
  type LedgerKind,
} from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Not enough credits.");
    this.name = "InsufficientCreditsError";
  }
}

export type LedgerEntry = {
  delta: number;
  kind: LedgerKind;
  key: string;
  refType?: string;
  refId?: string;
  meta?: Record<string, unknown>;
};

/** Subscription states that keep a plan's features (past_due: Stripe is still retrying payment). */
const ACTIVE = ["active", "trialing", "past_due"];

export async function ensureAccount(db: Executor, userId: string): Promise<void> {
  await db
    .insert(creditAccounts)
    .values({ userId, trialPrompts: FREE_TRIAL_PROMPTS })
    .onConflictDoNothing();
}

async function lockAccount(tx: Tx, userId: string) {
  await ensureAccount(tx, userId);
  // FOR UPDATE: concurrent requests for the same person wait here, so two can't spend the same credits.
  const [row] = await tx
    .select({ balance: creditAccounts.balance, trialPrompts: creditAccounts.trialPrompts })
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
    .for("update");
  if (!row) throw new Error("Credit account missing");
  return row;
}

/**
 * Writes ledger entries atomically. Entries whose key was used before are skipped (that's what
 * makes webhook retries and double clicks harmless). Throws if the balance would go below zero.
 */
export async function applyEntries(
  db: Db,
  userId: string,
  entries: LedgerEntry[],
): Promise<{ balance: number; applied: number }> {
  return db.transaction(async (tx) => applyEntriesTx(tx, userId, entries));
}

async function applyEntriesTx(tx: Tx, userId: string, entries: LedgerEntry[]) {
  const { balance } = await lockAccount(tx, userId);
  let next = balance;
  let applied = 0;
  for (const e of entries) {
    if (!Number.isInteger(e.delta)) throw new Error("Credit amounts are whole numbers");
    const inserted = await tx
      .insert(creditLedger)
      .values({
        userId,
        delta: e.delta,
        kind: e.kind,
        refType: e.refType ?? null,
        refId: e.refId ?? null,
        idempotencyKey: e.key,
        meta: e.meta ?? {},
      })
      .onConflictDoNothing({ target: creditLedger.idempotencyKey })
      .returning({ id: creditLedger.id });
    if (inserted.length === 0) continue;
    next += e.delta;
    applied++;
  }
  if (next < 0) throw new InsufficientCreditsError();
  if (next !== balance) {
    await tx
      .update(creditAccounts)
      .set({ balance: next, updatedAt: new Date() })
      .where(eq(creditAccounts.userId, userId));
  }
  return { balance: next, applied };
}

// ── What someone can do ─────────────────────────────────────────────────────

export type Entitlement = {
  plan: Plan | null;
  status: string;
  balance: number;
  trialPrompts: number;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  modelTier: ModelEntry["tier"];
  aiPerMinute: number;
  aiConcurrent: number;
};

export async function getEntitlement(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<Entitlement> {
  await ensureAccount(db, userId);
  const [account] = await db.select().from(creditAccounts).where(eq(creditAccounts.userId, userId));
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  const active =
    sub &&
    isPlanId(sub.planId) &&
    ACTIVE.includes(sub.status) &&
    (!sub.currentPeriodEnd || sub.currentPeriodEnd > now);
  const plan = active && isPlanId(sub.planId) ? PLANS[sub.planId] : null;
  return {
    plan,
    status: sub?.status ?? "none",
    balance: account?.balance ?? 0,
    trialPrompts: account?.trialPrompts ?? 0,
    periodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    modelTier: plan?.modelTier ?? FREE_LIMITS.modelTier,
    aiPerMinute: plan?.aiPerMinute ?? FREE_LIMITS.aiPerMinute,
    aiConcurrent: plan?.aiConcurrent ?? FREE_LIMITS.aiConcurrent,
  };
}

// ── Estimating (see estimate.ts) ─────────────────────────────────────────────

export { estimateCredits, tokensFromChars, type CreditEstimate } from "./estimate";
import type { CreditEstimate } from "./estimate";

// ── Charging for AI requests ────────────────────────────────────────────────

export type Authorization =
  | { ok: true; mode: "trial"; hold: 0 }
  | { ok: true; mode: "credits"; hold: number }
  | { ok: false; code: "model_locked" | "no_credits"; message: string };

/**
 * Reserves payment for one AI request before the model is called. Uses credits when there are
 * enough for a typical request (holding up to the maximum it could cost); otherwise one of the
 * free trial prompts, on Starter models only. Hard stop when neither is available.
 */
export async function authorizeAiRequest(
  db: Db,
  input: {
    userId: string;
    model: ModelEntry;
    estimate: CreditEstimate;
    replyId: string;
    now?: Date;
  },
): Promise<Authorization> {
  const ent = await getEntitlement(db, input.userId, input.now);
  if (!modelAllowed(input.model.tier, ent.modelTier)) {
    return {
      ok: false,
      code: "model_locked",
      message: ent.plan
        ? `${input.model.label} needs the Pro or Power plan.`
        : `${input.model.label} is included with Pro and Power. Pick a Starter model, or upgrade.`,
    };
  }

  return db.transaction(async (tx) => {
    const { balance, trialPrompts } = await lockAccount(tx, input.userId);
    if (balance >= input.estimate.typical && balance > 0) {
      const hold = Math.max(1, Math.min(input.estimate.max, balance));
      await applyEntriesTx(tx, input.userId, [
        {
          delta: -hold,
          kind: "hold",
          key: `hold:${input.replyId}`,
          refType: "ai_message",
          refId: input.replyId,
        },
      ]);
      return { ok: true as const, mode: "credits" as const, hold };
    }
    if (trialPrompts > 0 && input.model.tier === "starter") {
      await tx
        .update(creditAccounts)
        .set({ trialPrompts: trialPrompts - 1, updatedAt: new Date() })
        .where(eq(creditAccounts.userId, input.userId));
      await tx.update(aiMessages).set({ usedTrial: true }).where(eq(aiMessages.id, input.replyId));
      return { ok: true as const, mode: "trial" as const, hold: 0 as const };
    }
    return {
      ok: false as const,
      code: "no_credits" as const,
      message:
        trialPrompts > 0
          ? `Your free prompts work with Starter models. Pick one, or get credits to use ${input.model.label}.`
          : balance > 0
            ? `That needs about ${input.estimate.typical} credits and you have ${balance}. Get more credits to keep going.`
            : "You're out of credits. Pick a plan to keep remixing with AI.",
    };
  });
}

/** After a successful call: charge what it actually cost (never more than the hold). */
export async function settleAiRequest(
  db: Db,
  input: {
    userId: string;
    replyId: string;
    auth: Extract<Authorization, { ok: true }>;
    costUsd: number;
  },
): Promise<number> {
  if (input.auth.mode === "trial") return 0;
  const charged = Math.min(creditsForCost(input.costUsd), input.auth.hold);
  await applyEntries(db, input.userId, [
    {
      delta: input.auth.hold,
      kind: "release",
      key: `release:${input.replyId}`,
      refType: "ai_message",
      refId: input.replyId,
    },
    {
      delta: -charged,
      kind: "spend",
      key: `spend:${input.replyId}`,
      refType: "ai_message",
      refId: input.replyId,
    },
  ]);
  await db
    .update(aiMessages)
    .set({ creditsCharged: charged })
    .where(eq(aiMessages.id, input.replyId));
  return charged;
}

/** After a failed or timed-out call: give everything back, including a free prompt. */
export async function refundAiRequest(
  db: Db,
  input: { userId: string; replyId: string; auth: Extract<Authorization, { ok: true }> },
): Promise<void> {
  if (input.auth.mode === "trial") {
    await db.transaction(async (tx) => {
      const { trialPrompts } = await lockAccount(tx, input.userId);
      await tx
        .update(creditAccounts)
        .set({ trialPrompts: trialPrompts + 1, updatedAt: new Date() })
        .where(eq(creditAccounts.userId, input.userId));
      await tx.update(aiMessages).set({ usedTrial: false }).where(eq(aiMessages.id, input.replyId));
    });
    return;
  }
  await applyEntries(db, input.userId, [
    {
      delta: input.auth.hold,
      kind: "release",
      key: `release:${input.replyId}`,
      refType: "ai_message",
      refId: input.replyId,
    },
  ]);
}

/**
 * Releases holds left behind by requests that never finished (a crashed or killed function).
 * Safe to call often: each release has a unique key.
 */
export async function releaseStaleHolds(db: Db, userId: string, olderThan: Date): Promise<number> {
  const stale = await db
    .select({ id: aiMessages.id })
    .from(aiMessages)
    .where(
      and(
        eq(aiMessages.userId, userId),
        eq(aiMessages.status, "pending"),
        lt(aiMessages.createdAt, olderThan),
      ),
    );
  if (stale.length === 0) return 0;
  const ids = stale.map((s) => s.id);
  const holds = await db
    .select({ refId: creditLedger.refId, delta: creditLedger.delta })
    .from(creditLedger)
    .where(and(eq(creditLedger.kind, "hold"), inArray(creditLedger.refId, ids)));
  for (const h of holds) {
    await applyEntries(db, userId, [
      {
        delta: -h.delta,
        kind: "release",
        key: `release:${h.refId}`,
        refType: "ai_message",
        refId: h.refId ?? undefined,
      },
    ]);
  }
  const trials = await db
    .select({ id: aiMessages.id })
    .from(aiMessages)
    .where(and(inArray(aiMessages.id, ids), eq(aiMessages.usedTrial, true)));
  if (trials.length) {
    await db.transaction(async (tx) => {
      const { trialPrompts } = await lockAccount(tx, userId);
      await tx
        .update(creditAccounts)
        .set({ trialPrompts: trialPrompts + trials.length })
        .where(eq(creditAccounts.userId, userId));
      await tx
        .update(aiMessages)
        .set({ usedTrial: false })
        .where(
          inArray(
            aiMessages.id,
            trials.map((t) => t.id),
          ),
        );
    });
  }
  await db
    .update(aiMessages)
    .set({ status: "error", error: "Request didn't finish; credits returned." })
    .where(inArray(aiMessages.id, ids));
  return stale.length;
}

// ── Plans and admin ──────────────────────────────────────────────────────────

/**
 * Starts a new billing period: unused credits expire, the plan's credits are granted.
 * Keyed by the paid invoice, so a retried webhook does nothing the second time.
 */
export async function startBillingPeriod(
  db: Db,
  input: { userId: string; plan: Plan; invoiceId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const { balance } = await lockAccount(tx, input.userId);
    const already = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(eq(creditLedger.idempotencyKey, `grant:${input.invoiceId}`));
    if (already.length) return;
    await applyEntriesTx(tx, input.userId, [
      ...(balance > 0
        ? [
            {
              delta: -balance,
              kind: "expiry" as const,
              key: `expire:${input.invoiceId}`,
              refType: "invoice",
              refId: input.invoiceId,
            },
          ]
        : []),
      {
        delta: input.plan.monthlyCredits,
        kind: "subscription_grant",
        key: `grant:${input.invoiceId}`,
        refType: "invoice",
        refId: input.invoiceId,
        meta: { plan: input.plan.id },
      },
    ]);
  });
}

/** Mid-period upgrade: top up the difference between the new plan's credits and the old one's. */
export async function grantUpgradeDifference(
  db: Db,
  input: { userId: string; from: Plan; to: Plan; invoiceId: string },
): Promise<void> {
  const extra = input.to.monthlyCredits - input.from.monthlyCredits;
  if (extra <= 0) return;
  await applyEntries(db, input.userId, [
    {
      delta: extra,
      kind: "subscription_grant",
      key: `upgrade:${input.invoiceId}`,
      refType: "invoice",
      refId: input.invoiceId,
      meta: { from: input.from.id, to: input.to.id },
    },
  ]);
}

/** When a subscription ends, its unused credits expire. */
export async function expireAllCredits(db: Db, userId: string, key: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { balance } = await lockAccount(tx, userId);
    if (balance <= 0) return;
    await applyEntriesTx(tx, userId, [
      { delta: -balance, kind: "expiry", key, refType: "subscription" },
    ]);
  });
}

/** Admins can add or remove credits (support, testing). Removal stops at zero. */
export async function adminAdjustCredits(
  db: Db,
  admin: Viewer,
  input: { userId: string; delta: number; note: string; requestId: string },
): Promise<number> {
  assert(canModerate(admin), "Only admins can adjust credits.");
  if (!Number.isInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > 100_000) {
    throw new Error("Enter a whole number of credits between -100,000 and 100,000.");
  }
  return db.transaction(async (tx) => {
    const { balance } = await lockAccount(tx, input.userId);
    const delta = Math.max(input.delta, -balance);
    if (delta === 0) return balance;
    const res = await applyEntriesTx(tx, input.userId, [
      {
        delta,
        kind: "admin_adjust",
        key: `adjust:${input.requestId}`,
        refType: "admin",
        refId: admin!.userId,
        meta: { note: input.note.slice(0, 200) },
      },
    ]);
    return res.balance;
  });
}

export async function recentLedger(db: Db, userId: string, limit = 50) {
  return db
    .select({
      id: creditLedger.id,
      delta: creditLedger.delta,
      kind: creditLedger.kind,
      meta: creditLedger.meta,
      createdAt: creditLedger.createdAt,
    })
    .from(creditLedger)
    .where(
      and(eq(creditLedger.userId, userId), sql`${creditLedger.kind} not in ('hold', 'release')`),
    )
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit);
}

/** Credits spent and estimated provider cost since `since`, for the admin page. */
export async function spendSince(
  db: Db,
  since: Date,
): Promise<{ credits: number; providerUsd: number }> {
  const [row] = await db
    .select({
      credits: sql<number>`coalesce(sum(${aiMessages.creditsCharged}), 0)::int`,
      providerUsd: sql<number>`coalesce(sum(${aiMessages.costUsd}), 0)::float`,
    })
    .from(aiMessages)
    .where(gte(aiMessages.createdAt, since));
  return row ?? { credits: 0, providerUsd: 0 };
}

/** Balance and free prompts without creating the account (for the header; cheap, read-only). */
export async function readCredits(
  db: Db,
  userId: string,
): Promise<{ balance: number; trialPrompts: number }> {
  const [a] = await db
    .select({ balance: creditAccounts.balance, trialPrompts: creditAccounts.trialPrompts })
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId));
  return a ?? { balance: 0, trialPrompts: FREE_TRIAL_PROMPTS };
}
