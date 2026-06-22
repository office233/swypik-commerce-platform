/**
 * Pi Network authentication endpoint.
 *
 * POST /api/auth/pi
 *   body: { accessToken: string, user?: { uid: string, username: string } }
 *
 * Verifies the Pi access token against the Pi Platform API (`/v2/me`),
 * upserts the matching `users` row + `oauth_accounts(provider='pi')` link,
 * then issues the standard Swypik session cookie (`swypik_session`).
 *
 * Reference: https://pi-apps.github.io/pi-sdk-docs/quick-start/genai/Authentication
 */

import { NextResponse } from "next/server";
import crypto from "crypto";

import { dbQuery } from "@/lib/db";
import { hashSessionToken } from "@/lib/auth/session";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import { FEATURES } from "@/lib/feature-flags";

const log = logger.child({ route: "/api/auth/pi" });

const COOKIE_NAME = "swypik_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const isProd = process.env.NODE_ENV === "production";
const SECURE_FLAG = isProd ? "; Secure" : "";
const COOKIE_DOMAIN_FLAG = isProd ? "; Domain=swypik.com" : "";

// The /me verification endpoint lives at api.minepi.com/v2/me. We derive the
// host root from PI_API_BASE_URL but strip any trailing "/v2" so we don't end
// up calling /v2/v2/me. PI_API_BASE_URL is shared with the payments client,
// which keeps the "/v2" suffix; auth needs only the host.
const PI_API_BASE = (
  process.env.PI_API_BASE_URL?.replace(/\/+$/, "").replace(/\/v2$/, "") ||
  "https://api.minepi.com"
);

type PiMeResponse = {
  uid?: string;
  username?: string;
  // Pi API may also return credentials / roles fields; we only need uid+username.
};

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function isLikelyUid(value: unknown): value is string {
  return typeof value === "string" && value.length >= 6 && value.length <= 128;
}

function isLikelyUsername(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 64 &&
    /^[A-Za-z0-9._-]+$/.test(value)
  );
}

async function verifyAccessToken(accessToken: string): Promise<PiMeResponse | null> {
  try {
    const res = await fetch(`${PI_API_BASE}/v2/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      log.warn({ status: res.status }, "pi /v2/me returned non-2xx");
      return null;
    }
    const data = (await res.json()) as PiMeResponse;
    if (!isLikelyUid(data?.uid) || !isLikelyUsername(data?.username)) {
      log.warn({ data }, "pi /v2/me payload missing uid/username");
      return null;
    }
    return data;
  } catch (err) {
    log.error({ err }, "pi /v2/me request failed");
    return null;
  }
}

async function upsertPiUser(piUid: string, piUsername: string): Promise<string> {
  // 1. Existing pi link?
  const existing = await dbQuery<{ user_id: string }>(
    `SELECT user_id FROM oauth_accounts
      WHERE provider = 'pi' AND provider_user_id = $1
      LIMIT 1`,
    [piUid],
  );
  if (existing.rows[0]?.user_id) {
    await dbQuery(
      `UPDATE users
          SET pi_username = $2,
              last_seen_at = now()
        WHERE id = $1`,
      [existing.rows[0].user_id, piUsername],
    );
    return existing.rows[0].user_id;
  }

  // 2. Brand new Pi user → create a users row.
  // `users.email` is unique; Pi doesn't expose email, so we synthesise a
  // placeholder that the user can later replace via the normal email flow.
  const synthEmail = `pi_${piUid}@pi.swypik.local`;
  const baseUsername = piUsername.toLowerCase().replace(/[^a-z0-9_.]/g, "_").slice(0, 18);
  const candidateUsername = `${baseUsername || "piuser"}_${piUid.slice(0, 4)}`;

  const inserted = await dbQuery<{ id: string }>(
    `INSERT INTO users (email, username, display_name, pi_username, role, created_at)
     VALUES ($1, $2, $3, $4, 'shopper', now())
     ON CONFLICT (email) DO UPDATE
       SET pi_username = EXCLUDED.pi_username,
           last_seen_at = now()
     RETURNING id`,
    [synthEmail, candidateUsername, piUsername, piUsername],
  );
  const userId = inserted.rows[0].id;

  await dbQuery(
    `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email)
     VALUES ($1, 'pi', $2, NULL)
     ON CONFLICT (provider, provider_user_id) DO NOTHING`,
    [userId, piUid],
  );

  return userId;
}

async function issueSession(userId: string): Promise<string> {
  const token = generateToken();
  await dbQuery(
    `INSERT INTO user_sessions (user_id, session_token_hash, expires_at, metadata)
     VALUES ($1, $2, now() + interval '30 days', $3::jsonb)`,
    [userId, hashSessionToken(token), JSON.stringify({ type: "session", provider: "pi" })],
  );
  await dbQuery(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [userId]);
  return token;
}

export async function POST(req: Request) {
  if (!FEATURES.piAuth) {
    return NextResponse.json(
      { ok: false, error: "feature_disabled" },
      { status: 410 },
    );
  }

  const ip = getClientIP(req);
  const limit = await rateLimit("auth-pi", ip, { limit: 20, window: 300 });
  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }

  let body: { accessToken?: unknown; user?: { uid?: unknown; username?: unknown } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  if (!accessToken || accessToken.length < 8 || accessToken.length > 4096) {
    return NextResponse.json({ ok: false, error: "missing_access_token" }, { status: 400 });
  }

  const me = await verifyAccessToken(accessToken);
  if (!me?.uid || !me?.username) {
    return NextResponse.json({ ok: false, error: "pi_verification_failed" }, { status: 401 });
  }

  let userId: string;
  try {
    userId = await upsertPiUser(me.uid, me.username);
  } catch (err) {
    log.error({ err }, "pi upsert failed");
    return NextResponse.json({ ok: false, error: "user_upsert_failed" }, { status: 500 });
  }

  let sessionToken: string;
  try {
    sessionToken = await issueSession(userId);
  } catch (err) {
    log.error({ err }, "pi session insert failed");
    return NextResponse.json({ ok: false, error: "session_failed" }, { status: 500 });
  }

  const res = NextResponse.json({
    ok: true,
    user: { id: userId, piUid: me.uid, piUsername: me.username },
  });
  res.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${SECURE_FLAG}${COOKIE_DOMAIN_FLAG}`,
  );
  return res;
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "pi-auth", method: "POST" });
}
