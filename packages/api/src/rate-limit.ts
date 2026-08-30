import type { MiddlewareHandler } from "hono";
import { problemJson } from "./problem.js";

export interface RateLimitStore {
  take(
    key: string,
    limit: number,
    windowSeconds: number,
  ): { ok: boolean; remaining: number; resetSeconds: number };
  size(): number;
}

const SWEEP_INTERVAL_MS = 60_000;
const MAX_KEYS = 100_000;

export function createMemoryStore(now: () => number = () => Date.now()): RateLimitStore {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = now();
  return {
    take(key, limit, windowSeconds) {
      const t = now();
      if (t - lastSweep >= SWEEP_INTERVAL_MS || buckets.size > MAX_KEYS) {
        for (const [k, b] of buckets) {
          if (b.resetAt <= t) buckets.delete(k);
        }
        lastSweep = t;
      }
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= t) {
        buckets.set(key, { count: 1, resetAt: t + windowSeconds * 1000 });
        return { ok: true, remaining: limit - 1, resetSeconds: windowSeconds };
      }
      existing.count += 1;
      const resetSeconds = Math.max(1, Math.ceil((existing.resetAt - t) / 1000));
      if (existing.count > limit) return { ok: false, remaining: 0, resetSeconds };
      return { ok: true, remaining: limit - existing.count, resetSeconds };
    },
    size() {
      return buckets.size;
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
    // SOFT abuse limit only: keyed on the leftmost X-Forwarded-For hop, which is
    // trusted only as much as the upstream proxy. Precise trusted-proxy IP
    // derivation is deploy-specific and out of scope here.
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
