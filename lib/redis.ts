/**
 * Redis singleton — ioredis client driven by REDIS_URL.
 *
 * Lazily constructed; safe to import from any server module.
 * Used for DM pub/sub (channels: dm:conv:<id>).
 */

import IORedis, { type Redis } from "ioredis";

let client: Redis | null = null;
let subscriberCache: Redis | null = null;

function buildClient(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is missing");
  }
  return new IORedis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

export function getRedis(): Redis {
  if (!client) {
    client = buildClient();
    client.on("error", (err) => {
      console.error("[redis] client error:", err?.message || err);
    });
  }
  return client;
}

/**
 * Returns a dedicated subscriber connection (cannot be shared with publisher).
 * Caller should call .quit() when done.
 */
export function createSubscriber(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is missing");
  }
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

/**
 * Cached subscriber for general use (avoid in SSE — each stream needs its own).
 */
export function getSharedSubscriber(): Redis {
  if (!subscriberCache) {
    subscriberCache = createSubscriber();
    subscriberCache.on("error", (err) => {
      console.error("[redis] subscriber error:", err?.message || err);
    });
  }
  return subscriberCache;
}

export default getRedis;
