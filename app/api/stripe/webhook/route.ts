import type { NextRequest } from "next/server";
import { getStripe, verifyWebhook } from "@/lib/billing/stripe";
import { handleStripeEvent, normalizeSubscription } from "@/lib/billing/webhook";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { serverEnv } from "@/lib/env";

/**
 * Stripe → REMAXX. Every request must carry a valid signature for STRIPE_WEBHOOK_SECRET.
 * Answers 200 once handled (or already handled), 400 for bad signatures, 500 to make Stripe retry.
 */
export async function POST(request: NextRequest) {
  const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret || !isDbConfigured()) return new Response("Not configured", { status: 503 });
  const body = await request.text();
  let event;
  try {
    event = verifyWebhook(body, request.headers.get("stripe-signature"), secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  try {
    const stripe = getStripe();
    const result = await handleStripeEvent(getDb(), event, {
      retrieveSubscription: async (id) =>
        normalizeSubscription(await stripe.subscriptions.retrieve(id)),
    });
    return Response.json({ received: true, result });
  } catch (err) {
    console.error("[stripe.webhook]", event.type, err);
    return new Response("Handler error", { status: 500 });
  }
}
