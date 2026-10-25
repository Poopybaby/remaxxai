import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Every key is optional at parse time so the app can boot (and CI can
 * build) without secrets; features that need a key check for it and fail with a clear message.
 * Never import this file from a Client Component.
 */
const serverSchema = z.object({
  DATABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  /** Optional: an OpenAI-compatible endpoint (a proxy or gateway). Defaults to api.openai.com. */
  OPENAI_BASE_URL: z.url().optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  /** Who can use AI features before credits exist (Phase 5): "admins" (default) or "signed-in". */
  AI_ACCESS: z.enum(["admins", "signed-in"]).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Live Stripe keys are refused unless this is "true" (test mode until the owner says otherwise). */
  STRIPE_ALLOW_LIVE: z.enum(["true", "false"]).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse({
    DATABASE_URL: emptyToUndefined(process.env.DATABASE_URL),
    NEXT_PUBLIC_SUPABASE_URL: emptyToUndefined(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: emptyToUndefined(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    // SUPABASE_SERVICE_ROLE_KEY is the name Vercel's Supabase integration uses.
    SUPABASE_SECRET_KEY: emptyToUndefined(
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    UPSTASH_REDIS_REST_URL: emptyToUndefined(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: emptyToUndefined(process.env.UPSTASH_REDIS_REST_TOKEN),
    OPENAI_API_KEY: emptyToUndefined(process.env.OPENAI_API_KEY),
    OPENAI_BASE_URL: emptyToUndefined(process.env.OPENAI_BASE_URL),
    ANTHROPIC_API_KEY: emptyToUndefined(process.env.ANTHROPIC_API_KEY),
    GOOGLE_GENERATIVE_AI_API_KEY: emptyToUndefined(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    DEEPSEEK_API_KEY: emptyToUndefined(process.env.DEEPSEEK_API_KEY),
    AI_ACCESS: emptyToUndefined(process.env.AI_ACCESS) as "admins" | "signed-in" | undefined,
    STRIPE_SECRET_KEY: emptyToUndefined(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: emptyToUndefined(process.env.STRIPE_WEBHOOK_SECRET),
    STRIPE_ALLOW_LIVE: emptyToUndefined(process.env.STRIPE_ALLOW_LIVE) as
      "true" | "false" | undefined,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Invalid environment variables: ${fields}. Check .env.local against .env.example.`,
    );
  }
  cached = parsed.data;
  return cached;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export class MissingConfigError extends Error {
  constructor(feature: string, keys: string[]) {
    super(`${feature} is not configured. Set ${keys.join(", ")} in .env.local.`);
    this.name = "MissingConfigError";
  }
}
