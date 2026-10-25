import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEntitlement } from "@/lib/billing/credits";
import { verifyWebhook } from "@/lib/billing/stripe";
import {
  handleStripeEvent,
  normalizeInvoice,
  normalizeSubscription,
  planFromPrice,
  syncFromStripe,
  type NormalizedSubscription,
} from "@/lib/billing/webhook";
import { applyEntries } from "@/lib/billing/credits";
import { creditAccounts, subscriptions } from "@/lib/db/schema";
import { createProfile } from "@/lib/profiles";
import { createAuthUser, createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const now = Math.floor(Date.now() / 1000);

/** A Stripe subscription object as the current API version sends it (period on the item). */
function stripeSub(over: {
  id: string;
  customer: string;
  user?: string;
  plan: string;
  status?: string;
  cancel?: boolean;
}) {
  return {
    id: over.id,
    object: "subscription",
    customer: over.customer,
    status: over.status ?? "active",
    cancel_at_period_end: over.cancel ?? false,
    metadata: over.user ? { remaxx_user: over.user, remaxx_plan: over.plan } : {},
    items: {
      data: [
        {
          id: `si_${over.id}`,
          current_period_start: now,
          current_period_end: now + 30 * 86400,
          price: {
            id: `price_${over.plan}`,
            lookup_key: `remaxx_${over.plan}_monthly_v1`,
            metadata: {},
          },
        },
      ],
    },
  };
}

const invoice = (id: string, customer: string, sub: string, reason: string) => ({
  id,
  object: "invoice",
  customer,
  billing_reason: reason,
  parent: { type: "subscription_details", subscription_details: { subscription: sub } },
});

async function newUser(): Promise<string> {
  const id = await createAuthUser(t.pg);
  await createProfile(t.db, id, {
    handle: `b${id.replace(/-/g, "").slice(0, 12)}`,
    displayName: "b",
    ageConfirmed: true,
    termsAccepted: true,
  });
  return id;
}

async function balanceOf(userId: string) {
  const [a] = await t.db.select().from(creditAccounts).where(eq(creditAccounts.userId, userId));
  return a?.balance ?? 0;
}

describe("normalizing Stripe objects", () => {
  it("reads the plan from the price's lookup key or metadata", () => {
    expect(planFromPrice({ lookup_key: "remaxx_pro_monthly_v3" })).toBe("pro");
    expect(planFromPrice({ metadata: { remaxx_plan: "power" } })).toBe("power");
    expect(planFromPrice({ lookup_key: "someone_elses_price" })).toBeNull();
  });

  it("reads subscriptions in both the current shape (period on the item) and the older one", () => {
    const current = normalizeSubscription(
      stripeSub({ id: "sub_1", customer: "cus_1", user: "u1", plan: "starter" }),
    );
    expect(current).toMatchObject({
      id: "sub_1",
      customerId: "cus_1",
      userId: "u1",
      planId: "starter",
      status: "active",
    });
    expect(current?.periodEnd).toBeInstanceOf(Date);
    const older = normalizeSubscription({
      id: "sub_2",
      customer: { id: "cus_2" },
      status: "past_due",
      current_period_end: now + 100,
      metadata: { remaxx_plan: "pro" },
      items: { data: [{ price: {} }] },
    });
    expect(older).toMatchObject({ customerId: "cus_2", planId: "pro", status: "past_due" });
    expect(older?.periodEnd?.getTime()).toBe((now + 100) * 1000);
    expect(normalizeSubscription({})).toBeNull();
  });

  it("finds an invoice's subscription in its parent, or the older top-level field", () => {
    expect(normalizeInvoice(invoice("in_1", "cus_1", "sub_1", "subscription_cycle"))).toEqual({
      id: "in_1",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      billingReason: "subscription_cycle",
    });
    expect(
      normalizeInvoice({ id: "in_2", customer: "cus_1", subscription: "sub_9" })?.subscriptionId,
    ).toBe("sub_9");
  });
});

describe("handleStripeEvent", () => {
  it("runs a whole subscription: checkout, credits, renewal, upgrade, downgrade, cancel", async () => {
    const user = await newUser();
    const cus = `cus_${user.slice(0, 6)}`;
    const subId = `sub_${user.slice(0, 6)}`;
    let current: NormalizedSubscription = normalizeSubscription(
      stripeSub({ id: subId, customer: cus, user, plan: "starter" }),
    )!;
    const deps = { retrieveSubscription: async () => current };
    const send = (id: string, type: string, object: unknown) =>
      handleStripeEvent(t.db, { id, type, data: { object } }, deps);

    // 1. Checkout finishes; the first invoice is paid.
    expect(await send("evt_1", "checkout.session.completed", { subscription: subId })).toBe(
      "processed",
    );
    expect(
      await send("evt_2", "invoice.paid", invoice("in_1", cus, subId, "subscription_create")),
    ).toBe("processed");
    expect(await balanceOf(user)).toBe(600);
    expect((await getEntitlement(t.db, user)).plan?.id).toBe("starter");

    // Stripe retries an event: nothing happens twice.
    expect(
      await send("evt_2", "invoice.paid", invoice("in_1", cus, subId, "subscription_create")),
    ).toBe("duplicate");
    // A different event about the same invoice is also harmless.
    await send("evt_2b", "invoice.paid", invoice("in_1", cus, subId, "subscription_create"));
    expect(await balanceOf(user)).toBe(600);

    // 2. Some credits are spent, then the plan renews: leftovers expire, a fresh 600 arrives.
    await applyEntries(t.db, user, [{ delta: -250, kind: "spend", key: `spend:${user}` }]);
    await send("evt_3", "invoice.paid", invoice("in_2", cus, subId, "subscription_cycle"));
    expect(await balanceOf(user)).toBe(600);

    // 3. Upgrade to Pro mid-period: the subscription update can arrive before the invoice.
    current = normalizeSubscription(stripeSub({ id: subId, customer: cus, user, plan: "pro" }))!;
    await send(
      "evt_4",
      "customer.subscription.updated",
      stripeSub({ id: subId, customer: cus, user, plan: "pro" }),
    );
    await send("evt_5", "invoice.paid", invoice("in_3", cus, subId, "subscription_update"));
    expect(await balanceOf(user)).toBe(600 + 1200);
    expect((await getEntitlement(t.db, user)).plan?.id).toBe("pro");

    // 4. Downgrade back to Starter: no credits taken now; the smaller grant starts next period.
    current = normalizeSubscription(
      stripeSub({ id: subId, customer: cus, user, plan: "starter" }),
    )!;
    await send("evt_6", "invoice.paid", invoice("in_4", cus, subId, "subscription_update"));
    expect(await balanceOf(user)).toBe(1800);
    await send("evt_7", "invoice.paid", invoice("in_5", cus, subId, "subscription_cycle"));
    expect(await balanceOf(user)).toBe(600);

    // 5. Cancelled at period end, then the period ends: plan and credits go.
    const cancelled = stripeSub({ id: subId, customer: cus, user, plan: "starter", cancel: true });
    await send("evt_8", "customer.subscription.updated", cancelled);
    expect((await getEntitlement(t.db, user)).cancelAtPeriodEnd).toBe(true);
    await send("evt_9", "customer.subscription.deleted", { ...cancelled, status: "canceled" });
    expect(await balanceOf(user)).toBe(0);
    expect((await getEntitlement(t.db, user)).plan).toBeNull();
  });

  it("finds the person by customer when the subscription has no metadata", async () => {
    const user = await newUser();
    await t.db
      .insert(subscriptions)
      .values({ userId: user, stripeCustomerId: "cus_known", status: "none" });
    const sub = stripeSub({ id: "sub_known", customer: "cus_known", plan: "power" });
    await handleStripeEvent(
      t.db,
      { id: "evt_k", type: "customer.subscription.created", data: { object: sub } },
      {
        retrieveSubscription: async () => null,
      },
    );
    expect((await getEntitlement(t.db, user)).plan?.id).toBe("power");
  });

  it("ignores events it doesn't need and subscriptions it can't place", async () => {
    const deps = { retrieveSubscription: async () => null };
    expect(
      await handleStripeEvent(
        t.db,
        { id: "evt_x", type: "charge.refunded", data: { object: {} } },
        deps,
      ),
    ).toBe("ignored");
    const stray = stripeSub({ id: "sub_stray", customer: "cus_nobody", plan: "pro" });
    expect(
      await handleStripeEvent(
        t.db,
        { id: "evt_y", type: "customer.subscription.created", data: { object: stray } },
        deps,
      ),
    ).toBe("processed");
    expect(
      await t.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeCustomerId, "cus_nobody")),
    ).toEqual([]);
  });
});

describe("syncFromStripe (fallback when a webhook is missed)", () => {
  const paid = (id: string, cus: string, sub: string, reason = "subscription_create") => ({
    ...normalizeInvoice(invoice(id, cus, sub, reason))!,
    paid: true,
  });

  it("grants a paid plan's credits once, however often it runs, and agrees with the webhook", async () => {
    const user = await newUser();
    const cus = `cus_s${user.slice(0, 6)}`;
    await t.db
      .insert(subscriptions)
      .values({ userId: user, stripeCustomerId: cus, status: "none" });
    expect((await getEntitlement(t.db, user)).plan).toBeNull();

    const sub = normalizeSubscription(
      stripeSub({ id: `sub_s${user.slice(0, 6)}`, customer: cus, user, plan: "power" }),
    )!;
    const deps = {
      listSubscriptions: async () => [{ sub, latestInvoice: paid("in_s1", cus, sub.id) }],
    };
    expect(await syncFromStripe(t.db, user, deps)).toBe("synced");
    expect(await syncFromStripe(t.db, user, deps)).toBe("synced");
    expect(await balanceOf(user)).toBe(5500);
    expect((await getEntitlement(t.db, user)).plan?.id).toBe("power");

    // The webhook for the same invoice arrives late: nothing is granted twice.
    await handleStripeEvent(
      t.db,
      {
        id: "evt_late",
        type: "invoice.paid",
        data: { object: invoice("in_s1", cus, sub.id, "subscription_create") },
      },
      { retrieveSubscription: async () => sub },
    );
    expect(await balanceOf(user)).toBe(5500);
  });

  it("does nothing for an unpaid invoice or someone who never started checkout", async () => {
    const user = await newUser();
    expect(await syncFromStripe(t.db, user, { listSubscriptions: async () => [] })).toBe(
      "no_customer",
    );
    const cus = `cus_u${user.slice(0, 6)}`;
    await t.db
      .insert(subscriptions)
      .values({ userId: user, stripeCustomerId: cus, status: "none" });
    const sub = normalizeSubscription(
      stripeSub({
        id: `sub_u${user.slice(0, 6)}`,
        customer: cus,
        user,
        plan: "pro",
        status: "incomplete",
      }),
    )!;
    await syncFromStripe(t.db, user, {
      listSubscriptions: async () => [
        { sub, latestInvoice: { ...paid("in_u1", cus, sub.id), paid: false } },
      ],
    });
    expect(await balanceOf(user)).toBe(0);
    expect((await getEntitlement(t.db, user)).plan).toBeNull();
  });

  it("only ever applies to the person asking, whatever Stripe's metadata says", async () => {
    const me = await newUser();
    const other = await newUser();
    const cus = `cus_m${me.slice(0, 6)}`;
    await t.db.insert(subscriptions).values({ userId: me, stripeCustomerId: cus, status: "none" });
    const sub = normalizeSubscription(
      stripeSub({ id: `sub_m${me.slice(0, 6)}`, customer: cus, user: other, plan: "starter" }),
    )!;
    await syncFromStripe(t.db, me, {
      listSubscriptions: async () => [{ sub, latestInvoice: paid("in_m1", cus, sub.id) }],
    });
    expect(await balanceOf(me)).toBe(600);
    expect(await balanceOf(other)).toBe(0);
  });
});

describe("verifyWebhook", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({
    id: "evt_sig",
    object: "event",
    type: "invoice.paid",
    data: { object: {} },
  });

  it("accepts a correctly signed event", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(verifyWebhook(payload, header, secret).id).toBe("evt_sig");
  });

  it("rejects a tampered body, a wrong secret or a missing signature", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => verifyWebhook(payload.replace("invoice", "fake"), header, secret)).toThrow();
    expect(() => verifyWebhook(payload, header, "whsec_other")).toThrow();
    expect(() => verifyWebhook(payload, null, secret)).toThrow();
  });
});
