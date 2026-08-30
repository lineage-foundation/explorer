import type { MiddlewareHandler } from "hono";
import { problemJson } from "./problem.js";

export interface RateLimitStore {
  take(
    key: string,
    limit: number,
    windowSeconds: number,
  ): { ok: boolean; remaining: number; resetSeconds: number };
}

export function createMemoryStore(): RateLimitStore {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    take(key, limit, windowSeconds) {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
        return { ok: true, remaining: limit - 1, resetSeconds: windowSeconds };
      }
      existing.count += 1;
      const resetSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      if (existing.count > limit) return { ok: false, remaining: 0, resetSeconds };
      return { ok: true, remaining: limit - existing.count, resetSeconds };
    },
  };
}

export interface RateLimitOptions {
  limit?: number;
  windowSeconds?: number;
  store?: RateLimitStore;
}

export function rateLimit(opts: RateLimitOptions = {}): MiddlewareHandler {
  const limit = opts.limit ?? 120;
  const windowSeconds = opts.windowSeconds ?? 60;
  const store = opts.store ?? createMemoryStore();
  return async (c, next) => {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    const key = forwarded && forwarded.length > 0 ? forwarded : "unknown";
    const result = store.take(key, limit, windowSeconds);
    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(result.remaining));
    c.header("RateLimit-Reset", String(result.resetSeconds));
    if (!result.ok) {
      return problemJson(c, 429, "Too Many Requests", "Rate limit exceeded. Retry later.", {
        "Retry-After": String(result.resetSeconds),
        "RateLimit-Limit": String(limit),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": String(result.resetSeconds),
      });
    }
    await next();
  };
}
