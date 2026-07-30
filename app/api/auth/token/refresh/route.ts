/**
 * POST /api/auth/token/refresh
 * Header: Authorization: Bearer <token curent, încă valid>
 * → { success, access_token, expires_at }
 *
 * Rotire token: emite un token bearer nou (30 zile) și revocă imediat
 * tokenul vechi. Dacă tokenul e expirat/revocat → 401 (re-login).
 */
import crypto from "crypto";
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { hashSessionToken } from "@/lib/auth/session";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length >= 32 ? token : null;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIP(req);
    const rl = await rateLimit("auth-token-refresh-ip", ip, { limit: 30, window: 300 });
    if (!rl.success) {
      return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
    }

    const token = readBearer(req);
    if (!token) {
      return NextResponse.json({ success: false, error: "missing_token" }, { status: 401 });
    }

    const oldHash = hashSessionToken(token);
    const { rows } = await dbQuery<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM user_sessions
        WHERE session_token_hash = $1
          AND kind = 'bearer'
          AND revoked_at IS NULL
          AND expires_at > now()
        LIMIT 1`,
      [oldHash],
    );
    const sess = rows[0];
    if (!sess) {
      return NextResponse.json({ success: false, error: "invalid_token" }, { status: 401 });
    }

    const newToken = crypto.randomBytes(32).toString("hex");
    const userAgent = req.headers.get("user-agent")?.slice(0, 512) ?? null;

    const { rows: inserted } = await dbQuery<{ expires_at: string }>(
      `INSERT INTO user_sessions
         (user_id, session_token_hash, kind, user_agent, expires_at, metadata)
       VALUES ($1, $2, 'bearer', $3, now() + interval '30 days', $4::jsonb)
       RETURNING expires_at`,
      [sess.user_id, hashSessionToken(newToken), userAgent, JSON.stringify({ via: "token_refresh", ip })],
    );

    await dbQuery(
      `UPDATE user_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
      [sess.id],
    );

    logger.info({ userId: sess.user_id }, "auth.token.refreshed");

    return NextResponse.json({
      success: true,
      access_token: newToken,
      expires_at: inserted[0].expires_at,
    });
  } catch (err) {
    logger.error({ error: (err as Error).message }, "auth.token.refresh.error");
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
