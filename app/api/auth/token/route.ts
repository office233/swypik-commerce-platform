/**
 * Bearer token auth pentru clienți PWA/mobile.
 *
 * POST /api/auth/token   { email, password }
 *   → { success, access_token, expires_at, user: { id, role, email } }
 *
 * Token opac (32 bytes hex), stocat sha256 în user_sessions cu kind='bearer'.
 * NU e JWT — același model ca sesiunile cookie. Valabil 30 de zile;
 * refresh prin /api/auth/token/refresh, revocare prin /api/auth/token/revoke.
 */
import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { dbQuery } from "@/lib/db";
import { hashSessionToken } from "@/lib/auth/session";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TokenLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  try {
    const ip = getClientIP(req);
    const rl = await rateLimit("auth-token-ip", ip, { limit: 10, window: 300 });
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "rate_limited" },
        { status: 429 },
      );
    }

    const raw = await req.json().catch(() => null);
    const parsed = TokenLoginSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "invalid_input" },
        { status: 400 },
      );
    }
    const email = parsed.data.email.toLowerCase();

    const { rows } = await dbQuery<{
      id: string;
      password_hash: string | null;
      status: string;
      role: string | null;
    }>(
      `SELECT id, password_hash, status, role
         FROM users WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );

    const user = rows[0];
    if (!user?.password_hash) {
      return NextResponse.json(
        { success: false, error: "invalid_credentials" },
        { status: 401 },
      );
    }
    if (user.status === "suspended" || user.status === "deleted") {
      return NextResponse.json(
        { success: false, error: "account_suspended" },
        { status: 403 },
      );
    }

    const ok = await bcrypt.compare(parsed.data.password, user.password_hash);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "invalid_credentials" },
        { status: 401 },
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const userAgent = req.headers.get("user-agent")?.slice(0, 512) ?? null;

    const { rows: sess } = await dbQuery<{ expires_at: string }>(
      `INSERT INTO user_sessions
         (user_id, session_token_hash, kind, user_agent, expires_at, metadata)
       VALUES ($1, $2, 'bearer', $3, now() + interval '30 days', $4::jsonb)
       RETURNING expires_at`,
      [user.id, hashSessionToken(token), userAgent, JSON.stringify({ via: "token_login", ip })],
    );

    logger.info("auth.token.issued", { userId: user.id });

    return NextResponse.json({
      success: true,
      access_token: token,
      expires_at: sess[0].expires_at,
      user: { id: user.id, role: user.role ?? "shopper", email },
    });
  } catch (err) {
    logger.error("auth.token.error", { error: (err as Error).message });
    return NextResponse.json(
      { success: false, error: "internal_error" },
      { status: 500 },
    );
  }
}
