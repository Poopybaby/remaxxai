import { siteConfig } from "@/config/site";
import { getViewer } from "@/lib/auth/viewer";
import { BillingNotConfiguredError, portalUrl } from "@/lib/billing/stripe";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/editor/http";

/** Opens Stripe's billing page: card, invoices, cancel. */
export async function POST() {
  if (!isDbConfigured()) return jsonError(503, "Payments aren't set up yet.");
  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Sign in first.");
  try {
    const url = await portalUrl(getDb(), { userId: viewer.userId, appUrl: siteConfig.appUrl });
    if (!url) return jsonError(404, "You don't have a plan yet.");
    return jsonOk({ url });
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) return jsonError(503, err.message);
    console.error("[billing.portal]", err);
    return jsonError(502, "Stripe didn't respond. Try again in a moment.");
  }
}
