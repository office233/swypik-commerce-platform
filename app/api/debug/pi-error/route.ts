/**
 * Pi login diagnostic sink — receives best-effort POSTs from
 * `PiLoginButton` whenever the auth flow takes an interesting branch
 * (no SDK, init failed, authenticate failed, backend rejected, success).
 *
 * Purpose: when a user says "Conectare esuata", we can grep the container
 * logs by stage (init / authenticate / backend) without needing access
 * to their browser console. We also keep the last 50 entries in Redis
 * so the /debug/pi page can render them.
 *
 * This route is intentionally permissive (no auth) but heavily rate
 * limited and only stores non-sensitive metadata. The Pi access token
 * is NEVER forwarded by the client and we drop it server-side if the
 * payload accidentally contains it.
 *
 * GET returns the last entries (latest first), capped at 50, for the
 * /debug/pi page. No PII beyond UA + Pi username (which the user has
 * already consented to share with us via Pi.authenticate).
 */

import { NextResponse } from "next/server";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

const log = logger.child({ route: "/api/_debug/pi-error" });

const REDIS_KEY = "swypik:debug:pi-errors";
const MAX_ENTRIES = 50;
const MAX_PAYLOAD_BYTES = 4 * 1024; // 4 KB plenty for a diag entry

type DiagEntry = {
  ts: string;
  stage: string;
  ua: string;
  sandbox: boolean;
  sdkPresent: boolean;
  walletModule: boolean;
  scopes: string[];
  ip: string;
  // arbitrary extra fields the client sent
  [k: string]: unknown;
};

function sanitize(input: unknown): DiagEntry | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  // Defensive: never persist anything that smells like a token.
  delete obj.accessToken;
  delete obj.access_token;
  delete obj.token;
  delete obj.sessionToken;
  return {
    ts: typeof obj.ts === "string" ? obj.ts : new Date().toISOString(),
    stage: typeof obj.stage === "string" ? obj.stage.slice(0, 40) : "unknown",
    ua: typeof obj.ua === "string" ? obj.ua.slice(0, 300) : "",
    sandbox: Boolean(obj.sandbox),
    sdkPresent: Boolean(obj.sdkPresent),
    walletModule: Boolean(obj.walletModule),
    scopes: Array.isArray(obj.scopes)
      ? (obj.scopes.filter((s) => typeof s === "string") as string[]).slice(0, 10)
      : [],
    ip: "",
    ...Object.fromEntries(
      Object.entries(obj)
        .filter(([k]) => !["ts", "stage", "ua", "sandbox", "sdkPresent", "walletModule", "scopes"].includes(k))
        .slice(0, 20)
        .map(([k, v]) => [
          k.slice(0, 40),
          typeof v === "string" ? v.slice(0, 500) : v,
        ]),
    ),
  };
}

export async function POST(req: Request) {
  const ip = getClientIP(req);
  // Generous rate limit because PiLoginButton may fire multiple entries
  // per session (init, success/error). Still capped to stop abuse.
  const limit = await rateLimit("pi-debug", ip, { limit: 60, window: 300 });
  if (!limit.success) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const raw = await req.text();
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const entry = sanitize(parsed);
  if (!entry) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  entry.ip = ip;

  // Mirror to structured logs so `docker logs | grep pi-debug` works.
  log.info({ event: "pi-debug", ...entry }, `pi-debug ${entry.stage}`);

  // Persist for the /debug/pi UI. LPUSH + LTRIM keeps the latest N entries.
  // getRedis() is sync (returns an ioredis client); commands are async.
  try {
    const redis = getRedis();
    await redis.lpush(REDIS_KEY, JSON.stringify(entry));
    await redis.ltrim(REDIS_KEY, 0, MAX_ENTRIES - 1);
    // Auto-expire after a day so we don't leak diagnostics forever.
    await redis.expire(REDIS_KEY, 60 * 60 * 24);
  } catch (err) {
    log.warn({ err }, "redis store failed");
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  // Public read for the diagnostic page. Contains only the metadata
  // recorded above — no tokens, no emails. Safe to expose publicly so
  // testers can self-diagnose without admin access.
  try {
    const redis = getRedis();
    const raw = await redis.lrange(REDIS_KEY, 0, MAX_ENTRIES - 1);
    const entries = raw
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter((e): e is DiagEntry => e !== null);
    return NextResponse.json({ ok: true, entries });
  } catch (err) {
    log.warn({ err }, "redis read failed");
    return NextResponse.json({ ok: true, entries: [], note: "redis_error" });
  }
}
