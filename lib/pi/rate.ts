/**
 * Live Pi -> RON exchange rate.
 *
 * The merchant priced everything in RON; to charge in Pi we need the real,
 * current market value of Pi. We pull it from CoinGecko (free, no key) and
 * cache it in Redis for a few minutes so we don't hammer the API and so all
 * app instances agree on the same rate within the window.
 *
 * Fallback chain:
 *   1. Redis cache (fresh < TTL)
 *   2. CoinGecko live
 *   3. Redis cache (stale, any age) — better a slightly old real rate than none
 *   4. PI_TO_RON env override (manual floor)
 *
 * If everything fails we throw, because charging at a guessed rate would
 * mis-price real money.
 */

import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "pi-rate" });

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=pi-network&vs_currencies=ron";
const CACHE_KEY = "pi:rate:ron";
const STALE_KEY = "pi:rate:ron:stale";
const TTL_SECONDS = 300; // 5 min fresh window
const STALE_TTL_SECONDS = 86_400; // keep a stale value up to a day as fallback
const FETCH_TIMEOUT_MS = 6_000;

function envOverride(): number | null {
  const raw = Number(process.env.PI_TO_RON);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

async function fetchLive(): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(COINGECKO_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      log.warn({ status: res.status }, "coingecko non-2xx");
      return null;
    }
    const json = (await res.json()) as { "pi-network"?: { ron?: number } };
    const ron = json?.["pi-network"]?.ron;
    if (typeof ron === "number" && ron > 0) return ron;
    return null;
  } catch (err) {
    log.warn({ err: String(err) }, "coingecko fetch failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns RON per 1 Pi (e.g. 0.62 means 1 Pi = 0.62 RON).
 */
export async function getPiToRonRate(): Promise<number> {
  let redis: ReturnType<typeof getRedis> | null = null;
  try {
    redis = getRedis();
  } catch {
    redis = null;
  }

  // 1) fresh cache
  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        const v = Number(cached);
        if (Number.isFinite(v) && v > 0) return v;
      }
    } catch {
      /* ignore */
    }
  }

  // 2) live
  const live = await fetchLive();
  if (live) {
    if (redis) {
      try {
        await redis.set(CACHE_KEY, String(live), "EX", TTL_SECONDS);
        await redis.set(STALE_KEY, String(live), "EX", STALE_TTL_SECONDS);
      } catch {
        /* ignore */
      }
    }
    return live;
  }

  // 3) stale cache
  if (redis) {
    try {
      const stale = await redis.get(STALE_KEY);
      if (stale) {
        const v = Number(stale);
        if (Number.isFinite(v) && v > 0) {
          log.warn({ rate: v }, "using stale pi rate");
          return v;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 4) env override
  const override = envOverride();
  if (override) {
    log.warn({ rate: override }, "using PI_TO_RON env override");
    return override;
  }

  throw new Error("Pi/RON rate unavailable");
}
