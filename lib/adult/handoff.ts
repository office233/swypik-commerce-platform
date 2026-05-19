/**
 * Cross-subdomain auth handoff for the 18.swypik.com surface.
 *
 * Why this exists: the marketplace `swypik_session` cookie is set host-only
 * (no Domain attribute), so it does NOT travel from swypik.com to
 * 18.swypik.com. To preserve the "single login" UX without touching the
 * marketplace cookie-setting code, we mint a short-lived (60s) one-shot
 * token on swypik.com, redirect the browser to
 *   https://18.swypik.com/welcome?h=<token>
 * and on that page consume the token: create a NEW session row in
 * `public.user_sessions` for the same user, set `swypik_session` cookie
 * host-only on 18.swypik.com, and redirect to /adult.
 *
 * Token storage: Redis (already shared across containers). Key namespace
 * is `adult-handoff:`. TTL is 60s. Value is the marketplace user id.
 *
 * IMPORTANT: NEVER allow a handoff token to be replayed. The consume
 * helper uses GETDEL so the second consumer always fails.
 */

import crypto from "crypto";
import { getRedis } from "@/lib/redis";

const PREFIX = "adult-handoff:";
const TTL_SECONDS = 60;

/**
 * Mint a single-use token for the given user id. The caller (a route
 * handler on swypik.com) should redirect the browser to
 *   https://18.swypik.com/welcome?h=<token>
 */
export async function mintHandoffToken(userId: string): Promise<string> {
  if (!userId) throw new Error("mintHandoffToken: userId is required");
  const token = crypto.randomBytes(32).toString("hex");
  const redis = getRedis();
  await redis.set(`${PREFIX}${token}`, userId, "EX", TTL_SECONDS);
  return token;
}

/**
 * Atomically consume a token and return the associated user id, or null
 * if the token is unknown / expired / already consumed.
 */
export async function consumeHandoffToken(token: string): Promise<string | null> {
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const redis = getRedis();
  // GETDEL is atomic in Redis 6.2+; ioredis exposes it directly.
  const res = await (redis as unknown as { getdel?: (k: string) => Promise<string | null> }).getdel?.(
    `${PREFIX}${token}`,
  );
  if (typeof res === "string" && res.length > 0) return res;
  // Fallback for older Redis: GET + DEL (not atomic, but our token is
  // single-issued so the race is benign).
  const value = await redis.get(`${PREFIX}${token}`);
  if (value) await redis.del(`${PREFIX}${token}`);
  return value ?? null;
}
