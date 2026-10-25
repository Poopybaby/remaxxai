/**
 * Stripe webhooks → subscriptions and credits. Stripe objects are first turned into small plain
 * shapes (normalize*), so the logic doesn't depend on Stripe's field layout (which moves between
 * API versions) and can be tested with fixtures.
 *
 * Safe to receive the same event twice and in any order: each event is recorded once, credits are
 * keyed by invoice, and the subscription is re-read from Stripe when it matters.
 */
import { eq } from "drizzle-orm";
import { isPlanId, PLANS, type PlanId } from "@/config/plans";
import { stripeEvents, subscriptions } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { expireAllCredits, grantUpgradeDifference, startBillingPeriod } from "./credits";

export type NormalizedSubscription = {
  id: string;
  customerId: string;
  /** The REMAXX user, from metadata set at checkout. */
  userId: string | null;
  planId: PlanId | null;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type NormalizedInvoice = {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  billingReason: string | null;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const idOf = (v: unknown): string | null => str(v) ?? str(obj(v).id);
const date = (v: unknown): Date | null => (typeof v === "number" ? new Date(v * 1000) : null);

/** Which plan a Stripe price belongs to: its metadata, else its lookup key (remaxx_<plan>_monthly_vN). */
export function planFromPrice(price: unknown): PlanId | null {
  const p = obj(price);
  const fromMeta = str(obj(p.metadata).remaxx_plan);
  if (isPlanId(fromMeta)) return fromMeta;
  const m = str(p.lookup_key)?.match(/^remaxx_([a-z]+)_monthly_v\d+$/);
  return m && isPlanId(m[1]) ? m[1] : null;
}

export function normalizeSubscription(raw: unknown): NormalizedSubscription | null {
  const s = obj(raw);
  const id = str(s.id);
  const customerId = idOf(s.customer);
  if (!id || !customerId) return null;
  const item = obj((obj(s.items).data as unknown[] | undefined)?.[0]);
  const meta = obj(s.metadata);
  return {
    id,
    customerId,
    userId: str(meta.remaxx_user),
    planId:
      planFromPrice(item.price) ??
      (isPlanId(meta.remaxx_plan) ? (meta.remaxx_plan as PlanId) : null),
    status: str(s.status) ?? "incomplete",
    // Newer API versions keep the period on the item; older ones on the subscription.
    periodStart: date(item.current_period_start) ?? date(s.current_period_start),
    periodEnd: date(item.current_period_end) ?? date(s.current_period_end),
    cancelAtPeriodEnd: s.cancel_at_period_end === true,
  };
}

export function normalizeInvoice(raw: unknown): NormalizedInvoice | null {
  const i = obj(raw);
  const id = str(i.id);
  const customerId = idOf(i.customer);
  if (!id || !customerId) return null;
  const fromParent = idOf(obj(obj(i.parent).subscription_details).subscription);
  return {
    id,
    customerId,
    subscriptionId: fromParent ?? idOf(i.subscription),
    billingReason: str(i.billing_reason),
  };
}

export type WebhookDeps = {
  /** Reads the current subscription from Stripe (normalized). */
  retrieveSubscription: (id: string) => Promise<NormalizedSubscription | null>;
};

export type EventLike = { id: string; type: string; data: { object: unknown } };

/** Saves the subscription's latest state. Returns the REMAXX user it belongs to, if known. */
async function saveSubscription(db: Db, sub: NormalizedSubscription): Promise<string | null> {
  let userId = sub.userId;
  if (!userId) {
    const [row] = await db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, sub.customerId));
    userId = row?.userId ?? null;
  }
  if (!userId) return null;
  const values = {
    stripeCustomerId: sub.customerId,
    stripeSubscriptionId: sub.id,
    planId: sub.planId,
    status: sub.status,
    currentPeriodStart: sub.periodStart,
    currentPeriodEnd: sub.periodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
  await db
    .insert(subscriptions)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: subscriptions.userId, set: values });
  return userId;
}

export type HandleResult = "processed" | "duplicate" | "ignored";

export async function handleStripeEvent(
  db: Db,
  event: EventLike,
  deps: WebhookDeps,
): Promise<HandleResult> {
  const [seen] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id));
  if (seen) return "duplicate";

  let handled = true;
  const o = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      const subId = idOf(obj(o).subscription);
      const sub = subId ? await deps.retrieveSubscription(subId) : null;
      if (sub) await saveSubscription(db, sub);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = normalizeSubscription(o);
      if (!sub) break;
      const userId = await saveSubscription(db, sub);
      // A plan that has ended takes its unused credits with it.
      if (userId && (event.type === "customer.subscription.deleted" || sub.status === "canceled")) {
        await expireAllCredits(db, userId, `ended:${sub.id}`);
        await db
          .update(subscriptions)
          .set({ creditedPlanId: null })
          .where(eq(subscriptions.userId, userId));
      }
      break;
    }
    case "invoice.paid": {
      const inv = normalizeInvoice(o);
      if (!inv?.subscriptionId) break;
      const sub = await deps.retrieveSubscription(inv.subscriptionId);
      if (!sub?.planId) break;
      const userId = await saveSubscription(db, sub);
      if (!userId) break;
      const plan = PLANS[sub.planId];
      const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
      const credited = row?.creditedPlanId;
      if (inv.billingReason === "subscription_update" && isPlanId(credited)) {
        // Mid-period plan change: top up the difference on upgrades; downgrades apply next period.
        await grantUpgradeDifference(db, {
          userId,
          from: PLANS[credited],
          to: plan,
          invoiceId: inv.id,
        });
        if (plan.monthlyCredits > PLANS[credited].monthlyCredits) {
          await db
            .update(subscriptions)
            .set({ creditedPlanId: plan.id })
            .where(eq(subscriptions.userId, userId));
        }
      } else {
        // New subscription or renewal: last period's credits expire, this period's are granted.
        await startBillingPeriod(db, { userId, plan, invoiceId: inv.id });
        await db
          .update(subscriptions)
          .set({ creditedPlanId: plan.id })
          .where(eq(subscriptions.userId, userId));
      }
      break;
    }
    default:
      handled = false;
  }

  await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
  return handled ? "processed" : "ignored";
}
