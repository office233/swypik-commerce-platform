/**
 * AliExpress OAuth Callback
 * - Requires admin session.
 * - Verifies anti-CSRF state token (Redis, single-use).
 * - Exchanges code for token, persists in DB.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Pool } from "pg";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth/getAuthUser";

const APP_KEY = process.env.ALIEXPRESS_APP_KEY || "";
const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET || "";

let pool: Pool | null = null;
function db(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function GET(req: NextRequest) {
  // Admin auth required
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  if (!APP_KEY || !APP_SECRET) {
    logger.error("[AliExpress OAuth] missing env ALIEXPRESS_APP_KEY/SECRET");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 });
  }
  if (!state || !/^[a-f0-9]{64}$/.test(state)) {
    return NextResponse.json({ error: "Missing or invalid state" }, { status: 403 });
  }

  // Verify + consume state
  try {
    const key = `ae:oauth:state:${state}`;
    const stored = await getRedis().get(key);
    if (!stored) {
      return NextResponse.json({ error: "State expired or invalid" }, { status: 403 });
    }
    // optionally verify userId match
    try {
      const parsed = JSON.parse(stored) as { userId: string | null };
      if (parsed.userId && auth.userId && parsed.userId !== auth.userId) {
        return NextResponse.json({ error: "State user mismatch" }, { status: 403 });
      }
    } catch {}
    await getRedis().del(key);
  } catch (e) {
    logger.warn({ err: (e as Error)?.message }, "[AliExpress OAuth] state check error");
    return NextResponse.json({ error: "State verification failed" }, { status: 403 });
  }

  try {
    const params: Record<string, string> = {
      app_key: APP_KEY,
      method: "aliexpress.oauth.token.create",
      sign_method: "sha256",
      timestamp: Date.now().toString(),
      format: "json",
      v: "2.0",
      code,
      grant_type: "authorization_code",
    };
    const sorted = Object.keys(params).sort();
    const signStr = sorted.map((k) => k + params[k]).join("");
    params.sign = crypto.createHmac("sha256", APP_SECRET).update(signStr).digest("hex").toUpperCase();
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const resp = await fetch("https://api-sg.aliexpress.com/sync?" + qs);
    const data = await resp.json();

    if (data.error_response) {
      logger.warn({ code: data.error_response?.code }, "[AliExpress OAuth] token exchange failed");
      return NextResponse.json({ ok: false, error: "Token exchange failed" }, { status: 400 });
    }

    const tokenData = data.aliexpress_oauth_token_create_response || data;
    const accessToken: string | undefined = tokenData.access_token;
    const refreshToken: string | undefined = tokenData.refresh_token;
    const expireTime = tokenData.expire_time ? new Date(parseInt(tokenData.expire_time)) : null;

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "No token in response" }, { status: 502 });
    }

    await db().query(
      `INSERT INTO ae_oauth_tokens(app_key, access_token, refresh_token, expires_at, obtained_at, raw)
       VALUES ($1,$2,$3,$4, now(), $5)
       ON CONFLICT(app_key) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, ae_oauth_tokens.refresh_token),
         expires_at = EXCLUDED.expires_at,
         obtained_at = now(),
         raw = EXCLUDED.raw`,
      [APP_KEY, accessToken, refreshToken || null, expireTime, tokenData]
    );

    logger.info({ app_key: APP_KEY, expires_at: expireTime }, "[AliExpress OAuth] token persisted");
    return NextResponse.redirect(new URL("/admin/integrations?ae=ok", req.url));
  } catch (err: any) {
    logger.error({ err: err?.message }, "[AliExpress OAuth] error");
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
