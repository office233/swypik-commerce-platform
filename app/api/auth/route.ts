/**
 * Customer Auth API — backed by `users` + `user_sessions` tables
 *
 * POST /api/auth   { action: "login",        email }          → send OTP
 * POST /api/auth   { action: "verify_otp",   email, token }   → verify OTP, create 30-day session
 * POST /api/auth   { action: "update_profile", name, phone, address } → update profile
 * POST /api/auth   { action: "logout" }                       → clear session
 * GET  /api/auth                                              → verify current session
 * DELETE /api/auth                                            → logout (alias)
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { dbQuery } from "@/lib/db";
import crypto from "crypto";
import { sendMagicLink } from "@/lib/email/service";

const COOKIE_NAME = "swypik_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds
const isProd = process.env.NODE_ENV === "production";
const SECURE_FLAG = isProd ? "; Secure" : "";

/* ────────────────────────────────────────── helpers ──── */

/** Generate a cryptographically-secure session token (hex). */
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** SHA-256 hash used for storing tokens in `user_sessions.session_token_hash`. */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Generate a unique username from email prefix + random suffix. */
function generateUsername(email: string): string {
  const prefix = email.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${prefix || "user"}_${suffix}`;
}

/* ──────────────────────────────────── POST handler ──── */

export async function POST(req: Request) {
  const body = await req.json();
  const { action, email, token, name, phone, address } = body;
  const cookieStore = await cookies();

  switch (action) {
    /* ═══════════════════ LOGIN ═══════════════════ */
    case "login": {
      if (!email || !email.includes("@")) {
        return NextResponse.json({ success: false, error: "Email invalid." }, { status: 400 });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Find or create user in the `users` table
      let { rows } = await dbQuery<{ id: string }>(
        `SELECT id FROM users WHERE lower(email) = $1 AND status = 'active'`,
        [normalizedEmail],
      );

      if (rows.length === 0) {
        // Auto-create user
        const username = generateUsername(normalizedEmail);
        const { rows: newRows } = await dbQuery<{ id: string }>(
          `INSERT INTO users (username, email, display_name, locale, role, status, metadata)
           VALUES ($1, $2, $3, 'ro', 'shopper', 'active', '{}')
           RETURNING id`,
          [username, normalizedEmail, normalizedEmail.split("@")[0]],
        );
        rows = newRows;
      }

      const userId = rows[0].id;

      // Generate 6-digit OTP
      const otp = crypto.randomInt(100000, 1000000).toString();
      const otpHash = hashToken(`otp:${otp}`);

      // Store OTP in user_sessions (expires in 15 min)
      await dbQuery(
        `INSERT INTO user_sessions (user_id, session_token_hash, expires_at, metadata)
         VALUES ($1, $2, now() + interval '15 minutes', $3::jsonb)`,
        [userId, otpHash, JSON.stringify({ type: "otp" })],
      );

      // Try sending via email — falls back to console logging in dev
      const sent = await sendMagicLink(normalizedEmail, otp);

      // Local development convenience only: never expose OTPs from production deployments.
      const canExposeDevOtp = !isProd && !process.env.RESEND_API_KEY;

      if (!sent && !canExposeDevOtp) {
        return NextResponse.json(
          { success: false, error: "Nu am putut trimite codul de autentificare." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        requiresVerification: true,
        ...(canExposeDevOtp ? { devOtp: otp } : {}),
      });
    }

    /* ═══════════════════ VERIFY OTP ═══════════════════ */
    case "verify_otp": {
      if (!email || !token) {
        return NextResponse.json(
          { success: false, error: "Email și codul sunt obligatorii." },
          { status: 400 },
        );
      }

      const normalizedEmail = email.trim().toLowerCase();
      const otpHash = hashToken(`otp:${token.trim()}`);

      // Validate OTP
      const { rows } = await dbQuery<{ id: string; user_id: string }>(
        `SELECT us.id, us.user_id
         FROM user_sessions us
         JOIN users u ON u.id = us.user_id
         WHERE lower(u.email) = $1
           AND us.session_token_hash = $2
           AND us.expires_at > now()
           AND us.revoked_at IS NULL
           AND us.metadata->>'type' = 'otp'
         LIMIT 1`,
        [normalizedEmail, otpHash],
      );

      if (rows.length === 0) {
        return NextResponse.json(
          { success: false, error: "Cod invalid sau expirat." },
          { status: 400 },
        );
      }

      const otpSessionId = rows[0].id;
      const userId = rows[0].user_id;

      // Revoke OTP so it can't be reused
      await dbQuery(`UPDATE user_sessions SET revoked_at = now() WHERE id = $1`, [otpSessionId]);

      // Create long-lived session token
      const sessionToken = generateToken();
      const sessionHash = hashToken(sessionToken);

      await dbQuery(
        `INSERT INTO user_sessions (user_id, session_token_hash, expires_at, metadata)
         VALUES ($1, $2, now() + interval '30 days', $3::jsonb)`,
        [userId, sessionHash, JSON.stringify({ type: "session" })],
      );

      // Update last_seen_at
      await dbQuery(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [userId]);

      // Fetch user info for the response
      const { rows: userRows } = await dbQuery<{
        id: string;
        email: string;
        display_name: string;
      }>(`SELECT id, email, display_name FROM users WHERE id = $1`, [userId]);

      // Backfill onboarded marker pentru utilizatorii existenți:
      // dacă au deja interese salvate SAU contul a fost creat înainte de
      // deploy-ul gate-ului, nu îi mai forțăm prin /onboarding.
      const { rows: onboardedRows } = await dbQuery<{ onboarded: boolean }>(
        `SELECT (
           EXISTS (SELECT 1 FROM user_interests WHERE user_id = $1)
           OR EXISTS (SELECT 1 FROM users WHERE id = $1 AND created_at < now() - interval '1 hour')
         ) AS onboarded`,
        [userId],
      ).catch(() => ({ rows: [{ onboarded: false }] }));

      const alreadyOnboarded = Boolean(onboardedRows[0]?.onboarded);

      const response = NextResponse.json({
        success: true,
        user: userRows[0] || { id: userId },
        onboarded: alreadyOnboarded,
      });

      response.headers.set(
        "Set-Cookie",
        `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${SECURE_FLAG}`,
      );

      if (alreadyOnboarded) {
        response.cookies.set("swypik_onboarded", "1", {
          path: "/",
          maxAge: 60 * 60 * 24 * 730, // 2 years
          sameSite: "lax",
          secure: isProd,
          httpOnly: false,
        });
      }

      return response;
    }

    /* ═══════════════════ UPDATE PROFILE ═══════════════════ */
    case "update_profile": {
      const sessionToken = cookieStore.get(COOKIE_NAME)?.value;
      if (!sessionToken) {
        return NextResponse.json({ success: false, error: "Not logged in" }, { status: 401 });
      }

      const sessionHash = hashToken(sessionToken);
      const { rows: sessionRows } = await dbQuery<{ user_id: string }>(
        `SELECT user_id FROM user_sessions
         WHERE session_token_hash = $1 AND expires_at > now() AND revoked_at IS NULL`,
        [sessionHash],
      );

      if (sessionRows.length === 0) {
        return NextResponse.json({ success: false }, { status: 401 });
      }

      const userId = sessionRows[0].user_id;

      await dbQuery(
        `UPDATE users SET
           display_name = COALESCE($1, display_name),
           metadata = jsonb_set(
             jsonb_set(metadata, '{phone}', COALESCE($2::jsonb, metadata->'phone')),
             '{address}', COALESCE($3::jsonb, metadata->'address')
           ),
           last_seen_at = now()
         WHERE id = $4`,
        [
          name || null,
          phone ? JSON.stringify(phone) : null,
          address ? JSON.stringify(address) : null,
          userId,
        ],
      );

      return NextResponse.json({ success: true });
    }

    /* ═══════════════════ LOGOUT ═══════════════════ */
    case "logout": {
      const sessionToken = cookieStore.get(COOKIE_NAME)?.value;
      if (sessionToken) {
        const sessionHash = hashToken(sessionToken);
        await dbQuery(
          `UPDATE user_sessions SET revoked_at = now() WHERE session_token_hash = $1`,
          [sessionHash],
        );
      }

      const response = NextResponse.json({ success: true });
      response.headers.set(
        "Set-Cookie",
        `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE_FLAG}`,
      );
      return response;
    }

    default:
      return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  }
}

/* ──────────────────────────────────── GET handler ──── */

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value;

  if (!sessionToken) {
    return NextResponse.json({ authenticated: false });
  }

  const sessionHash = hashToken(sessionToken);

  const { rows } = await dbQuery<{
    user_id: string;
    email: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
    role: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT
       us.user_id,
       u.email,
       u.display_name,
       u.username,
       u.avatar_url,
       u.role,
       u.metadata
     FROM user_sessions us
     JOIN users u ON u.id = us.user_id
     WHERE us.session_token_hash = $1
       AND us.expires_at > now()
       AND us.revoked_at IS NULL
     LIMIT 1`,
    [sessionHash],
  );

  if (rows.length === 0) {
    return NextResponse.json({ authenticated: false });
  }

  const user = rows[0];

  // Update last_seen_at (fire-and-forget)
  dbQuery(`UPDATE user_sessions SET last_seen_at = now() WHERE session_token_hash = $1`, [
    sessionHash,
  ]).catch(() => {});
  dbQuery(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [user.user_id]).catch(() => {});

  // Order count
  const { rows: orderStats } = await dbQuery<{ count: string }>(
    `SELECT COUNT(*) as count FROM commerce_orders
     WHERE buyer_user_id = $1 AND status != 'cancelled'`,
    [user.user_id],
  ).catch(() => ({ rows: [{ count: "0" }] }));

  return NextResponse.json({
    authenticated: true,
    customer: {
      id: user.user_id,
      email: user.email,
      name: user.display_name,
      display_name: user.display_name,
      username: user.username,
      avatar_url: user.avatar_url,
      role: user.role,
      phone: (user.metadata as any)?.phone || null,
    },
    orderCount: parseInt(orderStats[0]?.count || "0"),
  });
}

/* ──────────────────────────────────── DELETE handler ──── */

export async function DELETE() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value;

  if (sessionToken) {
    const sessionHash = hashToken(sessionToken);
    await dbQuery(
      `UPDATE user_sessions SET revoked_at = now() WHERE session_token_hash = $1`,
      [sessionHash],
    );
  }

  const response = NextResponse.json({ success: true });
  response.headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE_FLAG}`,
  );
  return response;
}
