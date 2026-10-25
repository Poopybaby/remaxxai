import { afterEach, describe, expect, it, vi } from "vitest";

/** Settings are read once per module load, so each case loads a fresh copy. */
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import("@/lib/billing/sales")).salesState;
}

const admin = { userId: "a", role: "admin" as const };
const user = { userId: "u", role: "user" as const };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("salesState", () => {
  it("is closed without a Stripe key", async () => {
    const salesState = await load({ STRIPE_SECRET_KEY: "", AI_ACCESS: "signed-in" });
    expect(salesState(user)).toEqual({ open: false, reason: "payments_off" });
  });

  it("refuses a live key unless live payments are switched on", async () => {
    let salesState = await load({ STRIPE_SECRET_KEY: "sk_live_x", AI_ACCESS: "signed-in" });
    expect(salesState(user)).toEqual({ open: false, reason: "payments_off" });
    salesState = await load({
      STRIPE_SECRET_KEY: "sk_live_x",
      STRIPE_ALLOW_LIVE: "true",
      AI_ACCESS: "signed-in",
    });
    expect(salesState(user)).toEqual({ open: true, testMode: false });
  });

  it("only lets admins buy while AI is admins-only, so nobody pays for AI they can't use", async () => {
    const salesState = await load({ STRIPE_SECRET_KEY: "sk_test_x", AI_ACCESS: "admins" });
    expect(salesState(admin)).toEqual({ open: true, testMode: true });
    expect(salesState(user)).toEqual({ open: false, reason: "ai_early_access" });
    expect(salesState(null)).toEqual({ open: false, reason: "ai_early_access" });
  });

  it("is open to everyone once AI is open", async () => {
    const salesState = await load({ STRIPE_SECRET_KEY: "sk_test_x", AI_ACCESS: "signed-in" });
    expect(salesState(user)).toEqual({ open: true, testMode: true });
    expect(salesState(null)).toEqual({ open: true, testMode: true });
  });
});
