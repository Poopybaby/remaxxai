import type { NextRequest } from "next/server";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { isPlanId } from "@/config/plans";
import { getViewerContext } from "@/lib/auth/viewer";
import { salesState } from "@/lib/billing/sales";
import { BillingNotConfiguredError, startCheckout } from "@/lib/billing/stripe";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/editor/http";
import { rateLimit } from "@/lib/ratelimit";

const body = z.object({ plan: z.string().refine(isPlanId) });

/** Starts Stripe Checkout for a plan, or switches an existing subscription to it. */
export async function POST(request: NextRequest) {
  if (!isDbConfigured()) return jsonError(503, "Payments aren't set up yet.");
  const ctx = await getViewerContext();
  if (ctx.status !== "active") return jsonError(401, "Sign in to pick a plan.");
  if (!(await rateLimit("checkout", ctx.userId, { limit: 10, windowMs: 10 * 60_000 })).success) {
    return jsonError(429, "Too many tries. Wait a few minutes.");
  }
  const sales = salesState({ userId: ctx.userId, role: ctx.profile.role });
  if (!sales.open) {
    return jsonError(
      403,
      sales.reason === "ai_early_access"
        ? "Plans aren't on sale yet while AI editing is in early access."
        : "Payments aren't set up on this site yet.",
    );
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isPlanId(parsed.data.plan)) return jsonError(400, "Pick a plan.");
  try {
    const res = await startCheckout(getDb(), {
      user: { id: ctx.userId, email: ctx.email },
      planId: parsed.data.plan,
      appUrl: siteConfig.appUrl,
    });
    return jsonOk(res);
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) return jsonError(503, err.message);
    console.error("[billing.checkout]", err);
    return jsonError(502, "Stripe didn't respond. Try again in a moment.");
  }
}
