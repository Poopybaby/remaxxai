import { getViewer } from "@/lib/auth/viewer";
import { getEntitlement } from "@/lib/billing/credits";
import { BillingNotConfiguredError, listCustomerSubscriptions } from "@/lib/billing/stripe";
import { syncFromStripe } from "@/lib/billing/webhook";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/editor/http";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Pulls the signed-in person's subscription and latest payment straight from Stripe.
 * Runs when they come back from checkout and from the "Refresh from Stripe" button, so credits
 * arrive even if a webhook is late or missing. Only ever touches the caller's own account.
 */
export async function POST() {
  if (!isDbConfigured()) return jsonError(503, "Payments aren't set up yet.");
  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Sign in first.");
  if (
    !(await rateLimit("billing-sync", viewer.userId, { limit: 10, windowMs: 10 * 60_000 })).success
  ) {
    return jsonError(429, "Wait a few minutes before refreshing again.");
  }
  try {
    const db = getDb();
    const result = await syncFromStripe(db, viewer.userId, {
      listSubscriptions: listCustomerSubscriptions,
    });
    const ent = await getEntitlement(db, viewer.userId);
    return jsonOk({ result, plan: ent.plan?.id ?? null, balance: ent.balance });
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) return jsonError(503, err.message);
    console.error("[billing.sync]", err);
    return jsonError(502, "Stripe didn't respond. Try again in a moment.");
  }
}
