/**
 * Distributed Rate Limiter — Upstash Redis
 * 
 * Provides serverless-safe rate limiting across all Vercel instances.
 * Falls back to in-memory limiting if Redis is not configured (dev mode).
 * 
 * Usage:
 *   const { success, remaining } = await rateLimit("cart", ip, { limit: 10, window: 60 });
 *   if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// ── Redis client (lazy init) ────────────────────────────────────────
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// ── Pre-built rate limiters ─────────────────────────────────────────
const limiters = new Map<string, Ratelimit>();
let warnedAboutMemoryFallback = false;

function getLimiter(prefix: string, limit: number, windowSeconds: number): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;

  const key = `${prefix}:${limit}:${windowSeconds}`;
  if (limiters.has(key)) return limiters.get(key)!;

  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: `rl:${prefix}`,
    analytics: true,
  });
  limiters.set(key, limiter);
  return limiter;
}

// ── In-memory fallback for dev/missing Redis ────────────────────────
const memoryStore = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(identifier: string, limit: number, windowSeconds: number): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = memoryStore.get(identifier);

  if (!entry || now > entry.resetAt) {
    memoryStore.set(identifier, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { success: true, remaining: limit - 1 };
  }

  entry.count++;
  if (entry.count > limit) {
    return { success: false, remaining: 0 };
  }
  return { success: true, remaining: limit - entry.count };
}

// Cleanup stale entries periodically (every 60s)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore) {
      if (now > entry.resetAt) memoryStore.delete(key);
    }
  }, 60_000);
}

// ── Public API ──────────────────────────────────────────────────────

export type RateLimitConfig = {
  /** Max requests in window */
  limit: number;
  /** Window in seconds */
  window: number;
};

/** Default rate limits per route category */
export const RATE_LIMITS = {
  cart: { limit: 10, window: 60 } as RateLimitConfig,     // 10 checkouts/min
  chat: { limit: 30, window: 60 } as RateLimitConfig,     // 30 messages/min
  products: { limit: 60, window: 60 } as RateLimitConfig,  // 60 reads/min
  suggest: { limit: 40, window: 60 } as RateLimitConfig,   // 40 autocomplete/min
} as const;

/**
 * Rate limit a request.
 * 
 * @param prefix - Route category (e.g. "cart", "chat")
 * @param identifier - Usually IP address or session ID
 * @param config - { limit, window } override (optional, defaults to RATE_LIMITS[prefix])
 * @returns { success, remaining }
 */
export async function rateLimit(
  prefix: keyof typeof RATE_LIMITS | string,
  identifier: string,
  config?: RateLimitConfig
): Promise<{ success: boolean; remaining: number }> {
  const cfg = config || RATE_LIMITS[prefix as keyof typeof RATE_LIMITS] || { limit: 30, window: 60 };
  const fullIdentifier = `${prefix}:${identifier}`;

  // Try distributed (Upstash Redis)
  const limiter = getLimiter(prefix, cfg.limit, cfg.window);
  if (limiter) {
    try {
      const result = await limiter.limit(fullIdentifier);
      return { success: result.success, remaining: result.remaining };
    } catch (e) {
      console.warn("[RateLimit] Upstash error:", (e as Error).message);
    }
  }

  if (process.env.NODE_ENV === "production" && process.env.RATE_LIMIT_REDIS_REQUIRED !== "false") {
    console.error("[RateLimit] Redis is required in production! Failing closed.");
    return { success: false, remaining: 0 };
  }

  if (process.env.NODE_ENV === "production" && !warnedAboutMemoryFallback) {
    warnedAboutMemoryFallback = true;
    console.warn("[RateLimit] Upstash Redis is not configured; using in-memory limits for this Node process.");
  }

  // Fallback: in-memory (works in dev and single-node Hetzner deployments)
  return memoryRateLimit(fullIdentifier, cfg.limit, cfg.window);
}

/**
 * Extract client IP from request headers.
 * Caddy sets X-Real-IP from the connecting peer — that's non-spoofable.
 * If X-Real-IP is absent (non-prod / direct connections), fall back to the LAST
 * hop in X-Forwarded-For (the IP closest to our proxy), never the first
 * (which a remote client can prepend).
 */
export function getClientIP(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}
