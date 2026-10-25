/**
 * Numbers for the admin dashboard: people, templates, plans and revenue, and what AI costs us.
 * Every function checks the admin role itself; the page check is only for the UI.
 */
import { and, asc, count, desc, eq, gt, gte, ilike, isNotNull, or, sql } from "drizzle-orm";
import { isPlanId, PLAN_ORDER, PLANS, type PlanId } from "@/config/plans";
import { assert, canAccessAdmin, type Viewer } from "@/lib/auth/permissions";
import {
  aiMessages,
  creditAccounts,
  profiles,
  projects,
  stripeEvents,
  subscriptions,
} from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

// Dates inside sql`` fragments go in as ISO strings: postgres-js (production) won't encode a raw
// Date there, though PGlite (tests) would.
const LIVE_STATUSES = ["active", "trialing", "past_due"];

export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type Overview = {
  users: { total: number; newLast7Days: number };
  templates: { published: number; remixes: number; drafts: number; pendingReview: number };
  plans: Record<PlanId, number>;
  /** Monthly recurring revenue from live subscriptions at list price, in USD. */
  mrrUsd: number;
};

export async function getOverview(db: Db, viewer: Viewer, now = new Date()): Promise<Overview> {
  assert(canAccessAdmin(viewer), "Admins only.");
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [[users], [tpl], subs] = await Promise.all([
    db
      .select({
        total: count(),
        recent: sql<number>`count(*) filter (where ${profiles.createdAt} >= ${weekAgo.toISOString()}::timestamptz)::int`,
      })
      .from(profiles),
    db
      .select({
        published: sql<number>`count(*) filter (where ${projects.status} = 'published')::int`,
        remixes: sql<number>`count(*) filter (where ${projects.status} = 'published' and ${projects.parentProjectId} is not null)::int`,
        drafts: sql<number>`count(*) filter (where ${projects.status} = 'draft')::int`,
        pending: sql<number>`count(*) filter (where ${projects.status} = 'pending_review')::int`,
      })
      .from(projects),
    db
      .select({ planId: subscriptions.planId, n: count() })
      .from(subscriptions)
      .where(
        and(
          isNotNull(subscriptions.planId),
          sql`${subscriptions.status} in ('active', 'trialing', 'past_due')`,
          or(
            sql`${subscriptions.currentPeriodEnd} is null`,
            gt(subscriptions.currentPeriodEnd, now),
          ),
        ),
      )
      .groupBy(subscriptions.planId),
  ]);
  const plans: Record<PlanId, number> = { starter: 0, pro: 0, power: 0 };
  for (const s of subs) if (isPlanId(s.planId)) plans[s.planId] += Number(s.n);
  return {
    users: { total: Number(users?.total ?? 0), newLast7Days: users?.recent ?? 0 },
    templates: {
      published: tpl?.published ?? 0,
      remixes: tpl?.remixes ?? 0,
      drafts: tpl?.drafts ?? 0,
      pendingReview: tpl?.pending ?? 0,
    },
    plans,
    mrrUsd: PLAN_ORDER.reduce((sum, id) => sum + plans[id] * PLANS[id].priceUsdMonthly, 0),
  };
}

export type ModelCostRow = {
  modelId: string;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  /** What the provider charged us (estimated from token counts and config/models.ts prices). */
  providerUsd: number;
  creditsCharged: number;
  /** Requests paid for with a free prompt, and requests by admins (both charge nothing). */
  freeRequests: number;
  adminRequests: number;
};

/** AI usage and cost per model since `since` (model replies only). */
export async function getModelCosts(db: Db, viewer: Viewer, since: Date): Promise<ModelCostRow[]> {
  assert(canAccessAdmin(viewer), "Admins only.");
  const rows = await db
    .select({
      modelId: aiMessages.modelId,
      requests: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${aiMessages.status} = 'error')::int`,
      inputTokens: sql<number>`coalesce(sum(${aiMessages.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiMessages.outputTokens}), 0)::int`,
      providerUsd: sql<number>`coalesce(sum(${aiMessages.costUsd}), 0)::float`,
      creditsCharged: sql<number>`coalesce(sum(${aiMessages.creditsCharged}), 0)::int`,
      freeRequests: sql<number>`count(*) filter (where ${aiMessages.usedTrial})::int`,
      adminRequests: sql<number>`count(*) filter (where ${profiles.role} = 'admin')::int`,
    })
    .from(aiMessages)
    .leftJoin(profiles, eq(profiles.id, aiMessages.userId))
    .where(and(eq(aiMessages.role, "assistant"), gte(aiMessages.createdAt, since)))
    .groupBy(aiMessages.modelId)
    .orderBy(desc(sql`sum(${aiMessages.costUsd})`), asc(aiMessages.modelId));
  return rows.map((r) => ({ ...r, modelId: r.modelId ?? "unknown" }));
}

export type WebhookStatus = { lastAt: Date | null; lastType: string | null; total: number };

/** When Stripe last reached our webhook. "Never" with paying customers means it's misconfigured. */
export async function getWebhookStatus(db: Db): Promise<WebhookStatus> {
  const [[last], [n]] = await Promise.all([
    db
      .select({ at: stripeEvents.processedAt, type: stripeEvents.type })
      .from(stripeEvents)
      .orderBy(desc(stripeEvents.processedAt))
      .limit(1),
    db.select({ n: count() }).from(stripeEvents),
  ]);
  return { lastAt: last?.at ?? null, lastType: last?.type ?? null, total: Number(n?.n ?? 0) };
}

export type AdminUserRow = {
  id: string;
  handle: string;
  displayName: string;
  role: "user" | "admin";
  createdAt: Date;
  balance: number;
  trialPrompts: number;
  plan: PlanId | null;
  subscriptionStatus: string | null;
  templates: number;
  aiRequests30d: number;
};

/** People, newest first, optionally filtered by handle or name. */
export async function listUsers(
  db: Db,
  viewer: Viewer,
  opts: { query?: string; limit?: number; offset?: number; now?: Date } = {},
): Promise<{ rows: AdminUserRow[]; hasMore: boolean }> {
  assert(canAccessAdmin(viewer), "Admins only.");
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = opts.query?.trim().replace(/^@/, "").slice(0, 60);
  const monthAgo = new Date((opts.now ?? new Date()).getTime() - 30 * 86_400_000);
  // Escape LIKE wildcards so a search for "a_b" means exactly that.
  const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const rows = await db
    .select({
      id: profiles.id,
      handle: profiles.handle,
      displayName: profiles.displayName,
      role: profiles.role,
      createdAt: profiles.createdAt,
      balance: sql<number>`coalesce(${creditAccounts.balance}, 0)::int`,
      trialPrompts: sql<number>`coalesce(${creditAccounts.trialPrompts}, 0)::int`,
      planId: subscriptions.planId,
      status: subscriptions.status,
      periodEnd: subscriptions.currentPeriodEnd,
      templates: sql<number>`(select count(*) from ${projects} where ${projects.ownerId} = ${profiles.id} and ${projects.status} = 'published')::int`,
      aiRequests: sql<number>`(select count(*) from ${aiMessages} where ${aiMessages.userId} = ${profiles.id} and ${aiMessages.role} = 'assistant' and ${aiMessages.createdAt} >= ${monthAgo.toISOString()}::timestamptz)::int`,
    })
    .from(profiles)
    .leftJoin(creditAccounts, eq(creditAccounts.userId, profiles.id))
    .leftJoin(subscriptions, eq(subscriptions.userId, profiles.id))
    .where(
      pattern
        ? or(ilike(profiles.handle, pattern), ilike(profiles.displayName, pattern))
        : undefined,
    )
    .orderBy(desc(profiles.createdAt), asc(profiles.handle))
    .limit(limit + 1)
    .offset(offset);
  const now = opts.now ?? new Date();
  return {
    hasMore: rows.length > limit,
    rows: rows.slice(0, limit).map((r) => {
      const live =
        isPlanId(r.planId) &&
        LIVE_STATUSES.includes(r.status ?? "") &&
        (!r.periodEnd || r.periodEnd > now);
      return {
        id: r.id,
        handle: r.handle,
        displayName: r.displayName,
        role: r.role,
        createdAt: r.createdAt,
        balance: r.balance,
        trialPrompts: r.trialPrompts,
        plan: live && isPlanId(r.planId) ? r.planId : null,
        subscriptionStatus: r.status && r.status !== "none" ? r.status : null,
        templates: r.templates,
        aiRequests30d: r.aiRequests,
      };
    }),
  };
}
