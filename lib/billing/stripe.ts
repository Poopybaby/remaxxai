import "server-only";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { PLANS, priceLookupKey, type Plan, type PlanId } from "@/config/plans";
import { subscriptions } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { normalizeInvoice, normalizeSubscription, type SyncDeps } from "./webhook";
import { serverEnv } from "@/lib/env";

/**
 * Stripe, server side only. Products and prices are created on first use from config/plans.ts
 * (found again later by their lookup key), so the only setup is the API keys and the webhook.
 */
export class BillingNotConfiguredError extends Error {
  constructor(message = "Payments aren't set up on this site yet.") {
    super(message);
    this.name = "BillingNotConfiguredError";
  }
}

export function stripeMode(): "off" | "test" | "live" | "live-blocked" {
  const { STRIPE_SECRET_KEY: key, STRIPE_ALLOW_LIVE: allowLive } = serverEnv();
  if (!key) return "off";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_"))
    return allowLive === "true" ? "live" : "live-blocked";
  return "test";
}

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const mode = stripeMode();
  if (mode === "off") throw new BillingNotConfiguredError();
  if (mode === "live-blocked") {
    throw new BillingNotConfiguredError(
      "A live Stripe key is set but live payments aren't switched on (STRIPE_ALLOW_LIVE).",
    );
  }
  client ??= new Stripe(serverEnv().STRIPE_SECRET_KEY!, { appInfo: { name: "REMAXX" } });
  return client;
}

const priceIds = new Map<string, string>();

/** The Stripe price for a plan, creating its product and price the first time. */
export async function ensurePrice(stripe: Stripe, plan: Plan): Promise<string> {
  const key = priceLookupKey(plan);
  const cached = priceIds.get(key);
  if (cached) return cached;
  const found = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  let id = found.data[0]?.id;
  if (!id) {
    const product = await stripe.products.create({
      name: `REMAXX ${plan.name}`,
      description: `${plan.monthlyCredits.toLocaleString("en-US")} AI credits every month.`,
      metadata: { remaxx_plan: plan.id },
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: Math.round(plan.priceUsdMonthly * 100),
      recurring: { interval: "month" },
      lookup_key: key,
      metadata: { remaxx_plan: plan.id },
    });
    id = price.id;
  }
  priceIds.set(key, id);
  return id;
}

let portalConfigId: string | null = null;

/** A customer portal setup for REMAXX: update card, see invoices, cancel at period end. */
async function ensurePortalConfiguration(stripe: Stripe): Promise<string> {
  if (portalConfigId) return portalConfigId;
  const list = await stripe.billingPortal.configurations.list({ active: true, limit: 20 });
  const mine = list.data.find((c) => c.metadata?.remaxx === "1");
  portalConfigId =
    mine?.id ??
    (
      await stripe.billingPortal.configurations.create({
        business_profile: { headline: "Manage your REMAXX plan" },
        features: {
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
          subscription_cancel: { enabled: true, mode: "at_period_end" },
        },
        metadata: { remaxx: "1" },
      })
    ).id;
  return portalConfigId;
}

async function getOrCreateCustomer(
  db: Db,
  stripe: Stripe,
  user: { id: string; email: string | null },
): Promise<string> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
  if (row) return row.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { remaxx_user: user.id },
  });
  await db
    .insert(subscriptions)
    .values({ userId: user.id, stripeCustomerId: customer.id, status: "none" })
    .onConflictDoNothing();
  const [after] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
  return after!.stripeCustomerId;
}

export type CheckoutResult = { kind: "redirect"; url: string } | { kind: "changed" };

/**
 * Starts a subscription (Stripe Checkout), or switches an existing one to another plan
 * (charged or credited pro rata straight away; the webhook tops up credits on upgrades).
 */
export async function startCheckout(
  db: Db,
  input: { user: { id: string; email: string | null }; planId: PlanId; appUrl: string },
): Promise<CheckoutResult> {
  const stripe = getStripe();
  const plan = PLANS[input.planId];
  const price = await ensurePrice(stripe, plan);
  const customer = await getOrCreateCustomer(db, stripe, input.user);

  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, input.user.id));
  const live = row?.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(row.status);
  if (live && row?.stripeSubscriptionId) {
    const sub = await stripe.subscriptions.retrieve(row.stripeSubscriptionId);
    const item = sub.items.data[0];
    if (!item) throw new Error("Subscription has no items");
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price }],
      proration_behavior: "always_invoice",
      cancel_at_period_end: false,
      metadata: { remaxx_user: input.user.id, remaxx_plan: plan.id },
    });
    return { kind: "changed" };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: input.user.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { remaxx_user: input.user.id, remaxx_plan: plan.id } },
    success_url: `${input.appUrl}/billing?checkout=success`,
    cancel_url: `${input.appUrl}/pricing?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe didn't return a checkout link");
  return { kind: "redirect", url: session.url };
}

/** Stripe's page for changing the card, seeing invoices or cancelling. */
export async function portalUrl(
  db: Db,
  input: { userId: string; appUrl: string },
): Promise<string | null> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, input.userId));
  if (!row) return null;
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${input.appUrl}/billing`,
    configuration: await ensurePortalConfiguration(stripe),
  });
  return session.url;
}

/** Verifies a webhook's signature and returns the event. Throws if it isn't from Stripe. */
export function verifyWebhook(
  body: string,
  signature: string | null,
  secret: string,
): Stripe.Event {
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return Stripe.webhooks.constructEvent(body, signature, secret);
}

/** The customer's subscriptions straight from Stripe (newest first), for the sync fallback. */
export async function listCustomerSubscriptions(
  customerId: string,
): Promise<Awaited<ReturnType<SyncDeps["listSubscriptions"]>>> {
  const stripe = getStripe();
  const res = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 5,
    expand: ["data.latest_invoice"],
  });
  const out = [];
  for (const raw of res.data) {
    const sub = normalizeSubscription(raw);
    if (!sub) continue;
    const invRaw = raw.latest_invoice;
    const inv = invRaw && typeof invRaw === "object" ? normalizeInvoice(invRaw) : null;
    out.push({
      sub,
      latestInvoice:
        inv && typeof invRaw === "object" && invRaw
          ? { ...inv, subscriptionId: inv.subscriptionId ?? sub.id, paid: invRaw.status === "paid" }
          : null,
    });
  }
  return out;
}
