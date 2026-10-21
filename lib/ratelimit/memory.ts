import type { RateLimitRule } from "@/config/limits";

export type RateLimitResult = { success: boolean; remaining: number; resetAt: number };

/**
 * Sliding-window limiter kept in process memory. Used in development and tests, and as a
 * fallback when Upstash isn't configured. Not shared across serverless instances, so
 * production should set the Upstash keys.
 */
export class MemoryRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  check(key: string, rule: RateLimitRule): RateLimitResult {
    const now = this.now();
    const windowStart = now - rule.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (recent.length >= rule.limit) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? now;
      return { success: false, remaining: 0, resetAt: oldest + rule.windowMs };
    }
    recent.push(now);
    this.hits.set(key, recent);
    this.prune(windowStart);
    return { success: true, remaining: rule.limit - recent.length, resetAt: now + rule.windowMs };
  }

  /** Keeps memory bounded when many distinct keys are seen. */
  private prune(windowStart: number) {
    if (this.hits.size < 10_000) return;
    for (const [key, times] of this.hits) {
      if ((times[times.length - 1] ?? 0) <= windowStart) this.hits.delete(key);
    }
  }
}
