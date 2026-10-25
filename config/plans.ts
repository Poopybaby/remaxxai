/**
 * Plans, prices and how AI usage turns into credits. Placeholder numbers: change them here.
 *
 * Changing a plan's price: bump `priceVersion`. Stripe prices can't be edited, so a new version
 * makes a new price (existing subscribers keep theirs until they change plan).
 */
import type { ModelEntry } from "./models";

/** What one credit is worth to the person, in USD. */
export const CREDIT_VALUE_USD = 0.01;
/** Credits charged = provider cost × MARKUP ÷ CREDIT_VALUE_USD, rounded up. */
export const MARKUP = 2.5;
/** Free prompts every new account gets, on Starter-tier models, no card needed. Keep in sync with 0005_credits.sql. */
export const FREE_TRIAL_PROMPTS = 2;

export type PlanId = "starter" | "pro" | "power";

export type Plan = {
  id: PlanId;
  name: string;
  priceUsdMonthly: number;
  /** Granted each billing period; unused credits expire when the period ends. */
  monthlyCredits: number;
  /** Highest model tier included. */
  modelTier: ModelEntry["tier"];
  /** AI requests per minute and at once. Power's "priority" is more of both. */
  aiPerMinute: number;
  aiConcurrent: number;
  blurb: string;
  features: string[];
  priceVersion: number;
};

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceUsdMonthly: 14,
    monthlyCredits: 600,
    modelTier: "starter",
    aiPerMinute: 6,
    aiConcurrent: 1,
    blurb: "For trying ideas and small remixes.",
    features: ["600 credits a month", "Fast, low-cost models", "Publish unlimited remixes"],
    priceVersion: 1,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsdMonthly: 34,
    monthlyCredits: 1800,
    modelTier: "pro",
    aiPerMinute: 8,
    aiConcurrent: 1,
    blurb: "Every model, including the top ones.",
    features: [
      "1,800 credits a month",
      "Every model: Claude, GPT, Gemini, DeepSeek",
      "Publish unlimited remixes",
    ],
    priceVersion: 1,
  },
  power: {
    id: "power",
    name: "Power",
    priceUsdMonthly: 89,
    monthlyCredits: 5500,
    modelTier: "pro",
    aiPerMinute: 20,
    aiConcurrent: 2,
    blurb: "For heavy builders who remix all day.",
    features: [
      "5,500 credits a month",
      "Every model",
      "Priority: more requests per minute, two at once",
    ],
    priceVersion: 1,
  },
};

export const PLAN_ORDER: PlanId[] = ["starter", "pro", "power"];

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && v in PLANS;
}

/** Limits for someone without a plan (free prompts only). */
export const FREE_LIMITS = { aiPerMinute: 4, aiConcurrent: 1, modelTier: "starter" as const };

/** Credits for a provider cost, always at least 1 for a real request. */
export function creditsForCost(costUsd: number): number {
  if (costUsd <= 0) return 0;
  return Math.max(1, Math.ceil((costUsd * MARKUP) / CREDIT_VALUE_USD - 1e-9));
}

export function modelAllowed(tier: ModelEntry["tier"], planTier: ModelEntry["tier"]): boolean {
  return planTier === "pro" || tier === "starter";
}

/** The Stripe price lookup key for a plan, versioned so price changes create new prices. */
export function priceLookupKey(plan: Plan): string {
  return `remaxx_${plan.id}_monthly_v${plan.priceVersion}`;
}
