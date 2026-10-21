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
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse({
    DATABASE_URL: emptyToUndefined(process.env.DATABASE_URL),
    NEXT_PUBLIC_SUPABASE_URL: emptyToUndefined(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: emptyToUndefined(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    SUPABASE_SECRET_KEY: emptyToUndefined(process.env.SUPABASE_SECRET_KEY),
    UPSTASH_REDIS_REST_URL: emptyToUndefined(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: emptyToUndefined(process.env.UPSTASH_REDIS_REST_TOKEN),
    OPENAI_API_KEY: emptyToUndefined(process.env.OPENAI_API_KEY),
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
  return value === undefined || value.trim() === "" ? undefined : value;
}

export class MissingConfigError extends Error {
  constructor(feature: string, keys: string[]) {
    super(`${feature} is not configured. Set ${keys.join(", ")} in .env.local.`);
    this.name = "MissingConfigError";
  }
}
