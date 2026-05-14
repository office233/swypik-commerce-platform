/**
 * Simple Redis-backed sliding-window rate limit + idempotency helpers.
 */
import { getRedis } from "@/lib/redis";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter: number; // seconds
}

/**
 * Fixed-window counter: max N requests per windowSec for a given key.
 */
export async function rateLimit(
  key: string,
  max: number,
  windowSec: number
): Promise<RateLimitResult> {
  try {
    const redis = getRedis();
    const redisKey = `rl:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSec);
    }
    if (count > max) {
      const ttl = await redis.ttl(redisKey);
      return { ok: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSec };
    }
    return { ok: true, remaining: Math.max(0, max - count), retryAfter: 0 };
  } catch (err) {
    // Fail-open if Redis unavailable.
    return { ok: true, remaining: max, retryAfter: 0 };
  }
}

export async function idempotencyGet<T = any>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const cached = await redis.get(`idem:${key}`);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  } catch {
    return null;
  }
}

export async function idempotencySet(
  key: string,
  value: any,
  ttlSec = 300
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(`idem:${key}`, JSON.stringify(value), "EX", ttlSec);
  } catch {
    /* ignore */
  }
}

export function clientIp(req: Request): string {
  const h = (req as any).headers;
  if (!h) return "unknown";
  const xff = h.get?.("x-forwarded-for") || h.get?.("X-Forwarded-For");
  if (xff) return String(xff).split(",")[0].trim();
  const real = h.get?.("x-real-ip");
  if (real) return String(real);
  return "unknown";
}
