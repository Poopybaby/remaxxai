import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { RateLimitRule } from "@/config/limits";
import { serverEnv } from "@/lib/env";
import { MemoryRateLimiter, type RateLimitResult } from "./memory";

const memory = new MemoryRateLimiter();
const upstashLimiters = new Map<string, Ratelimit>();
let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = serverEnv();
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

/**
 * Checks and records one hit for `key` under `rule`. Uses Upstash when configured (shared across
 * instances), otherwise an in-memory window. `name` namespaces the rule, e.g. "waitlist".
 */
export async function rateLimit(
  name: string,
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const client = getRedis();
  if (!client) return memory.check(`${name}:${key}`, rule);

  const id = `${name}:${rule.limit}:${rule.windowMs}`;
  let limiter = upstashLimiters.get(id);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowMs} ms`),
      prefix: `rl:${name}`,
    });
    upstashLimiters.set(id, limiter);
  }
  const res = await limiter.limit(key);
  return { success: res.success, remaining: res.remaining, resetAt: res.reset };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
