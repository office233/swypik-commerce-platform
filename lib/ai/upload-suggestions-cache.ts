import { Redis } from "@upstash/redis";
import type { GeminiBundle } from "./gemini";

const CACHE_TTL_SECONDS = 60 * 60;

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

function cacheKey(videoId: string) {
  return `ai:upload-suggestions:${videoId}`;
}

export async function getCachedSuggestions(videoId?: string | null): Promise<GeminiBundle | null> {
  if (!videoId) return null;
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get<GeminiBundle | string>(cacheKey(videoId));
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as GeminiBundle) : raw;
  } catch {
    return null;
  }
}

export async function setCachedSuggestions(videoId: string, bundle: GeminiBundle) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(cacheKey(videoId), JSON.stringify(bundle), { ex: CACHE_TTL_SECONDS });
  } catch (e) {
    console.warn("[upload-suggestions] cache set failed:", (e as Error).message);
  }
}

export async function dropCache(videoId: string) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(cacheKey(videoId));
  } catch {
    /* noop */
  }
}
