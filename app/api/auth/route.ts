/**
 * Customer / unified Auth API — backed by `users` + `user_sessions` tables.
 *
 * POST /api/auth   { action: "login",         email }                       → send OTP
 * POST /api/auth   { action: "resend_otp",    email }                       → re-send OTP
 * POST /api/auth   { action: "verify_otp",    email, token, next? }         → verify OTP, create 30-day session
 * POST /api/auth   { action: "signup_password",
 *                    email, password, first_name, last_name,
 *                    username, phone?, avatar_url?, next? }                 → create account with password
 * POST /api/auth   { action: "login_password", email, password, next? }     → login with email + password
 * POST /api/auth   { action: "set_password",   password }                   → set/change password (authed)
 * POST /api/auth   { action: "check_username", username }                   → { available: true|false }
 * POST /api/auth   { action: "update_profile", name, phone, address }       → update extended profile
 * POST /api/auth   { action: "logout" }
 * GET  /api/auth                                                            → verify current session
 * DELETE /api/auth                                                          → logout (alias)
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";

import { dbQuery } from "@/lib/db";
import { sendMagicLink, sendEmail, sendWelcomeEmail } from "@/lib/email/service";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import {
  hashSessionToken,
  resolvePostLoginRedirect,
  type AuthRole,
} from "@/lib/auth/session";
import {
  createAdminSessionAndGetCookie,
  getAdminCookieName,
} from "@/lib/security/admin-auth";
import { CART_COOKIE, mergeAnonCartToUser } from "@/lib/cart/session";

const COOKIE_NAME = "swypik_session";
const SELLER_COOKIE_NAME = "seller_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const isProd = process.env.NODE_ENV === "production";
const SECURE_FLAG = isProd ? "; Secure" : "";
const VERIFICATION_GRACE_DAYS = 7;

/* ────────────────────────────────────────── helpers ──── */

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateUsername(email: string): string {
  const prefix = email.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${prefix || "user"}_${suffix}`;
}

function isValidUsername(value: string): boolean {
  return /^[a-z0-9_.]{3,20}$/.test(value);
}

function isValidPassword(value: string): boolean {
  return typeof value === "string" && value.length >= 8 && value.length <= 200;
}

function isValidEmail(value: string): boolean {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string): boolean {
  // E.164-ish; allow + and 7-15 digits
  return /^\+?[0-9]{7,15}$/.test(value.replace(/\s|-/g, ""));
}

function clearCookieHeader(name: string): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE_FLAG}`;
}

function appendSetCookie(response: NextResponse, cookie: string): void {
  response.headers.append("Set-Cookie", cookie);
}

/**
 * Issue a 30-day session for `userId`, set cookies, attach admin/seller cookies
 * if applicable, and return the JSON response.
 */
async function issueSessionResponse(
  userId: string,
  normalizedEmail: string,
  nextPath: string | null,
) {
  const sessionToken = generateToken();
  const sessionHash = hashSessionToken(sessionToken);

  await dbQuery(
    `INSERT INTO user_sessions (user_id, session_token_hash, expires_at, metadata)
     VALUES ($1, $2, now() + interval '30 days', $3::jsonb)`,
    [userId, sessionHash, JSON.stringify({ type: "session" })],
  );
  // Merge anonymous cart (if any) into this user's cart.
  try {
    const cookieStore = await cookies();
    const anonToken = cookieStore.get(CART_COOKIE)?.value || null;
    if (anonToken) await mergeAnonCartToUser(anonToken, userId);
  } catch (err) {
    console.warn("[auth] cart merge failed:", (err as Error).message);
  }
  await dbQuery(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [userId]);

  const { rows: userRows } = await dbQuery<{
    id: string;
    email: string;
    display_name: string;
    username: string;
    role: string;
    email_verified_at: string | null;
  }>(
    `SELECT id, email, display_name, username, role, email_verified_at
     FROM users WHERE id = $1`,
    [userId],
  );
  const user = userRows[0];

  let role: AuthRole =
    user?.role === "admin"
      ? "admin"
      : user?.role === "creator"
        ? "creator"
        : "shopper";
  let sellerId: string | null = null;

  if (role !== "admin") {
    try {
      const { rows: sellerRows } = await dbQuery<{ id: string }>(
        `SELECT id FROM sellers
         WHERE lower(email) = $1
           AND status IN ('active', 'approved')
         LIMIT 1`,
        [normalizedEmail],
      );
      if (sellerRows[0]?.id) {
        role = "seller";
        sellerId = sellerRows[0].id;
      }
    } catch {
      /* sellers table missing in some envs — ignore */
    }
  }

  const { rows: onboardedRows } = await dbQuery<{ onboarded: boolean }>(
    `SELECT (
       EXISTS (SELECT 1 FROM user_interests WHERE user_id = $1)
       OR EXISTS (SELECT 1 FROM users WHERE id = $1 AND created_at < now() - interval '1 hour')
     ) AS onboarded`,
    [userId],
  ).catch(() => ({ rows: [{ onboarded: false }] }));
  const alreadyOnboarded = Boolean(onboardedRows[0]?.onboarded);

  const redirectTo = resolvePostLoginRedirect(role, nextPath);

  const response = NextResponse.json({
    success: true,
    user: user || { id: userId },
    role,
    sellerId,
    redirectTo,
    onboarded: alreadyOnboarded,
    emailVerified: Boolean(user?.email_verified_at),
  });

  appendSetCookie(
    response,
    `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${SECURE_FLAG}`,
  );

  if (role === "admin") {
    try {
      const adminCookie = await createAdminSessionAndGetCookie();
      appendSetCookie(response, adminCookie);
    } catch (err) {
      console.warn("[auth] could not create admin cookie:", (err as Error).message);
    }
  }

  if (role === "seller" && sellerId) {
    try {
      const sellerToken = generateToken();
      const sellerHash = hashToken(sellerToken);
      await dbQuery(
        `INSERT INTO seller_sessions (seller_id, token, expires_at, created_at)
         VALUES ($1, $2, now() + interval '30 days', now())`,
        [sellerId, sellerHash],
      );
      appendSetCookie(
        response,
        `${SELLER_COOKIE_NAME}=${sellerToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${SECURE_FLAG}`,
      );
    } catch (err) {
      console.warn("[auth] could not create seller cookie:", (err as Error).message);
    }
  }

  if (alreadyOnboarded) {
    response.cookies.set("swypik_onboarded", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 730,
      sameSite: "lax",
      secure: isProd,
      httpOnly: true,
    });
  }

  return response;
}

/** Send-OTP flow (used by both `login` and `resend_otp`). */
async function handleSendOtp(req: Request, rawEmail: unknown) {
  if (typeof rawEmail !== "string" || !rawEmail.includes("@")) {
    return NextResponse.json(
      { success: false, error: "Email invalid." },
      { status: 400 },
    );
  }

  const normalizedEmail = rawEmail.trim().toLowerCase();

  const ip = getClientIP(req);
  const ipLimit = await rateLimit("auth-otp-ip", ip, { limit: 10, window: 300 });
  if (!ipLimit.success) {
    return NextResponse.json(
      { success: false, error: "Prea multe cereri. Reîncearcă în câteva minute." },
      { status: 429 },
    );
  }
  const emailLimit = await rateLimit("auth-otp-email", normalizedEmail, {
    limit: 5,
    window: 300,
  });
  if (!emailLimit.success) {
    return NextResponse.json(
      { success: false, error: "Ai cerut prea multe coduri. Reîncearcă în câteva minute." },
      { status: 429 },
    );
  }

  let { rows } = await dbQuery<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = $1 AND status IN ('active', 'pending_verification')`,
    [normalizedEmail],
  );

  if (rows.length === 0) {
    const username = generateUsername(normalizedEmail);
    const { rows: newRows } = await dbQuery<{ id: string }>(
      `INSERT INTO users (username, email, display_name, locale, role, status, metadata, auth_providers)
       VALUES ($1, $2, $3, 'ro', 'shopper', 'active', '{}', ARRAY['email_otp']::text[])
       RETURNING id`,
      [username, normalizedEmail, normalizedEmail.split("@")[0]],
    );
    rows = newRows;
  }

  const userId = rows[0].id;

  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = hashToken(`otp:${otp}`);

  await dbQuery(
    `INSERT INTO user_sessions (user_id, session_token_hash, expires_at, metadata)
     VALUES ($1, $2, now() + interval '15 minutes', $3::jsonb)`,
    [userId, otpHash, JSON.stringify({ type: "otp" })],
  );

  const sent = await sendMagicLink(normalizedEmail, otp);
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

/* ──────────────────────────────────── POST handler ──── */

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    action,
    email,
    token,
    name,
    phone,
    address,
    next,
    password,
    first_name,
    last_name,
    username,
    avatar_url,
  } = body || {};
  const cookieStore = await cookies();

  switch (action) {
    /* ═══════════════════ CHECK USERNAME ═══════════════════ */
    case "check_username": {
      if (typeof username !== "string" || !isValidUsername(username.trim().toLowerCase())) {
        return NextResponse.json({
          available: false,
          valid: false,
          error: "Username invalid (3-20 caractere, litere mici/cifre/_/.)",
        });
      }
      const handle = username.trim().toLowerCase();
      const { rows } = await dbQuery<{ id: string }>(
        `SELECT id FROM users WHERE lower(username) = $1 LIMIT 1`,
        [handle],
      );
      return NextResponse.json({ available: rows.length === 0, valid: true });
    }

    /* ═══════════════════ SIGNUP WITH PASSWORD ═══════════════════ */
    case "signup_password": {
      // Validări sincrone
      if (!isValidEmail(email)) {
        return NextResponse.json(
          { success: false, error: "Email invalid." },
          { status: 400 },
        );
      }
      if (!isValidPassword(password)) {
        return NextResponse.json(
          { success: false, error: "Parola trebuie să aibă cel puțin 8 caractere." },
          { status: 400 },
        );
      }
      if (typeof first_name !== "string" || first_name.trim().length < 1) {
        return NextResponse.json(
          { success: false, error: "Prenumele este obligatoriu." },
          { status: 400 },
        );
      }
      if (typeof last_name !== "string" || last_name.trim().length < 1) {
        return NextResponse.json(
          { success: false, error: "Numele este obligatoriu." },
          { status: 400 },
        );
      }
      const cleanUsername =
        typeof username === "string" ? username.trim().toLowerCase() : "";
      if (!isValidUsername(cleanUsername)) {
        return NextResponse.json(
          { success: false, error: "Username invalid (3-20 caractere, a-z 0-9 _ .)" },
          { status: 400 },
        );
      }
      const phoneTrimmed = typeof phone === "string" ? phone.trim() : "";
      if (phoneTrimmed && !isValidPhone(phoneTrimmed)) {
        return NextResponse.json(
          { success: false, error: "Număr de telefon invalid." },
          { status: 400 },
        );
      }

      const normalizedEmail = String(email).trim().toLowerCase();

      // Rate limit per IP
      const ip = getClientIP(req);
      const signupLimit = await rateLimit("auth-signup-ip", ip, { limit: 5, window: 600 });
      if (!signupLimit.success) {
        return NextResponse.json(
          { success: false, error: "Prea multe cereri. Așteaptă câteva minute." },
          { status: 429 },
        );
      }

      // Verifică unicitate email + username + phone (ignoră anonimi cu email NULL)
      // [auth/signup_password] attempt (PII redacted)
      const { rows: existingEmailRows } = await dbQuery<{ id: string; status: string }>(
        `SELECT id, status FROM users WHERE email IS NOT NULL AND lower(email) = $1 LIMIT 1`,
        [normalizedEmail],
      );
      if (existingEmailRows.length > 0) {
        console.log(`[auth/signup_password] EMAIL_TAKEN user_id=${existingEmailRows[0].id} status=${existingEmailRows[0].status}`);
        return NextResponse.json(
          { success: false, field: "email", code: "email_taken", error: "Există deja un cont cu acest email. Încearcă să te autentifici." },
          { status: 409 },
        );
      }

      const { rows: existingUserRows } = await dbQuery<{ id: string }>(
        `SELECT id FROM users WHERE username IS NOT NULL AND lower(username) = $1 LIMIT 1`,
        [cleanUsername],
      );
      if (existingUserRows.length > 0) {
        console.log(`[auth/signup_password] USERNAME_TAKEN`);
        return NextResponse.json(
          { success: false, field: "username", code: "username_taken", error: `Username-ul "${cleanUsername}" este deja folosit. Alege altul.` },
          { status: 409 },
        );
      }

      if (phoneTrimmed) {
        const { rows: existingPhoneRows } = await dbQuery<{ id: string }>(
          `SELECT id FROM users WHERE phone IS NOT NULL AND phone = $1 LIMIT 1`,
          [phoneTrimmed],
        );
        if (existingPhoneRows.length > 0) {
          console.log(`[auth/signup_password] PHONE_TAKEN`);
          return NextResponse.json(
            { success: false, field: "phone", code: "phone_taken", error: "Există deja un cont cu acest telefon." },
            { status: 409 },
          );
        }
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const displayName = `${first_name.trim()} ${last_name.trim()}`.trim();

      const { rows: insertRows } = await dbQuery<{ id: string }>(
        `INSERT INTO users (
           username, email, display_name, first_name, last_name,
           phone, avatar_url, password_hash, password_set_at,
           locale, role, status, suspend_grace_until, auth_providers, metadata
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, now(),
           'ro', 'shopper', 'active',
           NULL,
           ARRAY['email_password']::text[],
           '{}'::jsonb
         )
         RETURNING id`,
        [
          cleanUsername,
          normalizedEmail,
          displayName,
          first_name.trim(),
          last_name.trim(),
          phoneTrimmed || null,
          typeof avatar_url === "string" ? avatar_url : null,
          passwordHash,
        ],
      );

      const userId = insertRows[0].id;

      // Default rows pentru noi useri (idempotent — ON CONFLICT DO NOTHING)
      try {
        await dbQuery(
          `INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
          [userId],
        );
        await dbQuery(
          `INSERT INTO swyp_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
          [userId],
        );
      } catch (err) {
        console.warn('[auth/signup_password] default rows insert failed:', (err as Error).message);
      }

      // Trimite OTP de verificare email asincron (fire-and-forget pentru UX rapid)
      try {
        const otp = crypto.randomInt(100000, 1000000).toString();
        const otpHash = hashToken(`otp:${otp}`);
        await dbQuery(
          `INSERT INTO user_sessions (user_id, session_token_hash, expires_at, metadata)
           VALUES ($1, $2, now() + interval '15 minutes', $3::jsonb)`,
          [userId, otpHash, JSON.stringify({ type: "otp" })],
        );
        sendMagicLink(normalizedEmail, otp).catch((err) =>
          console.warn("[auth/signup_password] verification email failed:", err?.message),
        );
      } catch (err) {
        console.warn("[auth/signup_password] could not stage verification OTP:", (err as Error).message);
      }

      // Welcome email (transactional, best-effort)
      sendWelcomeEmail(normalizedEmail, cleanUsername).catch((err) =>
        console.warn("[welcome-email]", err?.message || err),
      );

      return issueSessionResponse(
        userId,
        normalizedEmail,
        typeof next === "string" ? next : null,
      );
    }

    /* ═══════════════════ LOGIN WITH PASSWORD ═══════════════════ */
    case "login_password": {
      if (!isValidEmail(email) || typeof password !== "string") {
        return NextResponse.json(
          { success: false, error: "Email sau parolă invalidă." },
          { status: 400 },
        );
      }
      const ip = getClientIP(req);
      const limit = await rateLimit("auth-login-pw-ip", ip, { limit: 10, window: 300 });
      if (!limit.success) {
        return NextResponse.json(
          { success: false, error: "Prea multe încercări. Așteaptă câteva minute." },
          { status: 429 },
        );
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const { rows } = await dbQuery<{ id: string; password_hash: string | null; status: string; totp_enabled_at: string | null }>(
        `SELECT id, password_hash, status, totp_enabled_at
         FROM users WHERE lower(email) = $1 LIMIT 1`,
        [normalizedEmail],
      );

      if (rows.length === 0 || !rows[0].password_hash) {
        return NextResponse.json(
          { success: false, error: "Email sau parolă incorectă." },
          { status: 401 },
        );
      }

      const user = rows[0];
      if (!user.password_hash) {
        return NextResponse.json(
          { success: false, error: "Email sau parolă incorectă." },
          { status: 401 },
        );
      }
      if (user.status === "suspended" || user.status === "deleted") {
        return NextResponse.json(
          { success: false, error: "Contul este suspendat. Verifică emailul." },
          { status: 403 },
        );
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Email sau parolă incorectă." },
          { status: 401 },
        );
      }

      // 2FA gate
      if (user.totp_enabled_at) {
        try {
          const { getRedis } = await import("@/lib/redis");
          const tempToken = generateToken();
          await getRedis().set(
            `2fa:pending:${tempToken}`,
            JSON.stringify({ userId: user.id, email: normalizedEmail, next: typeof next === "string" ? next : null }),
            "EX",
            300,
          );
          return NextResponse.json({ success: true, requires2FA: true, tempToken });
        } catch (e) {
          console.warn("[auth] 2FA redis failed:", (e as Error).message);
          return NextResponse.json(
            { success: false, error: "Eroare temporară. Încearcă din nou." },
            { status: 500 },
          );
        }
      }

      return issueSessionResponse(
        user.id,
        normalizedEmail,
        typeof next === "string" ? next : null,
      );
    }

    /* ═══════════════════ VERIFY 2FA ═══════════════════ */
    case "verify_2fa": {
      const tempToken = String(body.tempToken || "");
      const code = String(body.code || "").trim();
      if (!tempToken || !code) {
        return NextResponse.json({ success: false, error: "Date invalide." }, { status: 400 });
      }
      try {
        const { getRedis } = await import("@/lib/redis");
        const { verifyToken } = await import("@/lib/auth/totp");
        const raw = await getRedis().get(`2fa:pending:${tempToken}`);
        if (!raw) {
          return NextResponse.json({ success: false, error: "Sesiune 2FA expirată. Loghează-te din nou." }, { status: 401 });
        }
        const payload = JSON.parse(raw) as { userId: string; email: string; next: string | null };
        const { rows: urows } = await dbQuery<{ totp_secret: string | null; totp_backup_codes: string[] | null }>(
          `SELECT totp_secret, totp_backup_codes FROM users WHERE id = $1`,
          [payload.userId],
        );
        if (urows.length === 0 || !urows[0].totp_secret) {
          return NextResponse.json({ success: false, error: "2FA inactiv." }, { status: 400 });
        }
        let valid = /^\d{6}$/.test(code) && verifyToken(urows[0].totp_secret, code);

        // Try backup codes (8 hex chars) if TOTP fails
        if (!valid && /^[0-9a-fA-F]{8}$/.test(code) && urows[0].totp_backup_codes) {
          const { consumeBackupCode } = await import("@/lib/auth/totp");
          const result = await consumeBackupCode(urows[0].totp_backup_codes, code);
          if (result.matched) {
            await dbQuery(`UPDATE users SET totp_backup_codes = $1 WHERE id = $2`, [result.remaining, payload.userId]);
            valid = true;
          }
        }

        if (!valid) {
          return NextResponse.json({ success: false, error: "Cod invalid." }, { status: 401 });
        }

        await getRedis().del(`2fa:pending:${tempToken}`);
        return issueSessionResponse(payload.userId, payload.email, payload.next);
      } catch (e) {
        console.warn("[auth] verify_2fa failed:", (e as Error).message);
        return NextResponse.json({ success: false, error: "Eroare la verificare." }, { status: 500 });
      }
    }

    /* ═══════════════════ SET / CHANGE PASSWORD (authed) ═══════════════════ */
    case "set_password": {
      const sessionToken = cookieStore.get(COOKIE_NAME)?.value;
      if (!sessionToken) {
        return NextResponse.json({ success: false, error: "Not logged in" }, { status: 401 });
      }
      if (!isValidPassword(password)) {
        return NextResponse.json(
          { success: false, error: "Parola trebuie să aibă cel puțin 8 caractere." },
          { status: 400 },
        );
      }
      const sessionHash = hashSessionToken(sessionToken);
      const { rows } = await dbQuery<{ user_id: string }>(
        `SELECT user_id FROM user_sessions
         WHERE session_token_hash = $1 AND expires_at > now() AND revoked_at IS NULL`,
        [sessionHash],
      );
      if (rows.length === 0) {
        return NextResponse.json({ success: false }, { status: 401 });
      }
      const userId = rows[0].user_id;
      const passwordHash = await bcrypt.hash(password, 12);
      await dbQuery(
        `UPDATE users SET
           password_hash = $1,
           password_set_at = now(),
           auth_providers = (
             SELECT array(SELECT DISTINCT unnest(coalesce(auth_providers, ARRAY[]::text[]) || ARRAY['email_password']::text[]))
             FROM users WHERE id = $2
           )
         WHERE id = $2`,
        [passwordHash, userId],
      );
      return NextResponse.json({ success: true });
    }

    /* ═══════════════════ LOGIN / RESEND OTP ═══════════════════ */
    case "login":
    case "resend_otp": {
      return handleSendOtp(req, email);
    }

    /* ═══════════════════ VERIFY OTP ═══════════════════ */
    case "verify_otp": {
      if (!email || !token) {
        return NextResponse.json(
          { success: false, error: "Email și codul sunt obligatorii." },
          { status: 400 },
        );
      }

      const ip = getClientIP(req);
      const verifyLimit = await rateLimit("auth-otp-verify", ip, {
        limit: 15,
        window: 300,
      });
      if (!verifyLimit.success) {
        return NextResponse.json(
          { success: false, error: "Prea multe încercări. Așteaptă câteva minute." },
          { status: 429 },
        );
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const otpHash = hashToken(`otp:${String(token).trim()}`);

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

      await dbQuery(`UPDATE user_sessions SET revoked_at = now() WHERE id = $1`, [otpSessionId]);

      // Marchează emailul ca verificat + curăță suspend_grace
      await dbQuery(
        `UPDATE users SET
           email_verified_at = COALESCE(email_verified_at, now()),
           suspend_grace_until = NULL,
           status = CASE WHEN status = 'pending_verification' THEN 'active' ELSE status END
         WHERE id = $1`,
        [userId],
      );

      return issueSessionResponse(
        userId,
        normalizedEmail,
        typeof next === "string" ? next : null,
      );
    }

    /* ═══════════════════ UPDATE PROFILE ═══════════════════ */
    case "update_profile": {
      const sessionToken = cookieStore.get(COOKIE_NAME)?.value;
      if (!sessionToken) {
        return NextResponse.json({ success: false, error: "Not logged in" }, { status: 401 });
      }

      const sessionHash = hashSessionToken(sessionToken);
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
        await dbQuery(
          `UPDATE user_sessions SET revoked_at = now() WHERE session_token_hash = $1`,
          [hashSessionToken(sessionToken)],
        );
      }

      const sellerToken = cookieStore.get(SELLER_COOKIE_NAME)?.value;
      if (sellerToken) {
        await dbQuery(`DELETE FROM seller_sessions WHERE token = $1`, [
          hashToken(sellerToken),
        ]).catch(() => {});
      }

      const adminToken = cookieStore.get(getAdminCookieName())?.value;
      if (adminToken) {
        await dbQuery(`DELETE FROM admin_sessions WHERE token = $1`, [
          hashToken(adminToken),
        ]).catch(() => {});
      }

      const response = NextResponse.json({ success: true });
      appendSetCookie(response, clearCookieHeader(COOKIE_NAME));
      appendSetCookie(response, clearCookieHeader(SELLER_COOKIE_NAME));
      appendSetCookie(response, clearCookieHeader(getAdminCookieName()));
      return response;
    }

    /* ═══════════════════ FORGOT PASSWORD ═══════════════════ */
    case "forgot_password": {
      if (!isValidEmail(email)) {
        return NextResponse.json(
          { success: true, message: "Dacă există un cont, am trimis un email cu instrucțiuni." },
        );
      }
      const normalizedEmail = String(email).trim().toLowerCase();
      const ip = getClientIP(req);

      const emailLimit = await rateLimit("auth-forgot-email", normalizedEmail, { limit: 3, window: 3600 });
      const ipLimit = await rateLimit("auth-forgot-ip", ip, { limit: 5, window: 3600 });
      if (!emailLimit.success || !ipLimit.success) {
        return NextResponse.json(
          { success: true, message: "Dacă există un cont, am trimis un email cu instrucțiuni." },
        );
      }

      const { rows: userRows } = await dbQuery<{ id: string; email: string; first_name: string | null }>(
        `SELECT id, email, first_name FROM users WHERE lower(email) = $1 LIMIT 1`,
        [normalizedEmail],
      );

      if (userRows.length > 0) {
        const userId = userRows[0].id;
        const rawToken = generateToken();
        const tokenHash = hashToken(rawToken);
        await dbQuery(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, now() + interval '1 hour')`,
          [userId, tokenHash],
        );
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://swypik.com";
        const resetUrl = `${baseUrl}/auth/reset?token=${rawToken}`;
        const firstName = userRows[0].first_name || "";
        const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
          <h2 style="color:#7C3AED;">Resetare parolă Swypik</h2>
          <p>Salut${firstName ? " " + firstName : ""},</p>
          <p>Am primit o cerere de resetare a parolei pentru contul tău.</p>
          <p style="text-align:center;margin:28px 0;">
            <a href="${resetUrl}" style="background:#7C3AED;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Resetează parola</a>
          </p>
          <p style="color:#666;font-size:13px;">Sau copiază link-ul: <br/><span style="word-break:break-all;">${resetUrl}</span></p>
          <p style="color:#666;font-size:12px;margin-top:24px;">Link-ul expiră în 1 oră. Dacă nu ai cerut resetarea, ignoră acest mesaj.</p>
        </div>`;
        sendEmail({ to: normalizedEmail, subject: "Resetare parolă Swypik", html }).catch((err) =>
          console.error("[forgot_password] email error:", err),
        );
      }

      return NextResponse.json({
        success: true,
        message: "Dacă există un cont, am trimis un email cu instrucțiuni.",
      });
    }

    /* ═══════════════════ RESET PASSWORD ═══════════════════ */
    case "reset_password": {
      const newPassword: unknown = body?.newPassword ?? body?.password;
      const resetToken: unknown = body?.token;
      if (typeof resetToken !== "string" || resetToken.length < 32) {
        return NextResponse.json(
          { success: false, error: "Token invalid." },
          { status: 400 },
        );
      }
      if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 200) {
        return NextResponse.json(
          { success: false, error: "Parola trebuie să aibă minim 8 caractere." },
          { status: 400 },
        );
      }
      if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return NextResponse.json(
          { success: false, error: "Parola trebuie să conțină litere și cifre." },
          { status: 400 },
        );
      }

      const ip = getClientIP(req);
      const rl = await rateLimit("auth-reset", ip, { limit: 10, window: 600 });
      if (!rl.success) {
        return NextResponse.json(
          { success: false, error: "Prea multe încercări. Așteaptă câteva minute." },
          { status: 429 },
        );
      }

      const tokenHashLookup = hashToken(resetToken);
      const { rows: trows } = await dbQuery<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM password_reset_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         LIMIT 1`,
        [tokenHashLookup],
      );
      if (trows.length === 0) {
        return NextResponse.json(
          { success: false, error: "Token invalid sau expirat." },
          { status: 400 },
        );
      }
      const tokenId = trows[0].id;
      const userId = trows[0].user_id;
      const passwordHash = await bcrypt.hash(newPassword, 10);

      await dbQuery("BEGIN");
      try {
        await dbQuery(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [tokenId]);
        await dbQuery(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [passwordHash, userId]);
        await dbQuery(`UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
        await dbQuery("COMMIT");
      } catch (e) {
        await dbQuery("ROLLBACK");
        console.error("[reset_password] tx error", e);
        return NextResponse.json(
          { success: false, error: "Nu am putut reseta parola." },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, message: "Parola a fost resetată. Te poți autentifica." });
    }

    default:
      return NextResponse.json(
        { success: false, error: "Unknown action" },
        { status: 400 },
      );
  }
}

/* ──────────────────────────────────── GET handler ──── */

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value;

  if (!sessionToken) {
    return NextResponse.json({ authenticated: false });
  }

  const sessionHash = hashSessionToken(sessionToken);

  const { rows } = await dbQuery<{
    user_id: string;
    email: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
    role: string;
    metadata: Record<string, unknown>;
    email_verified_at: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    suspend_grace_until: string | null;
  }>(
    `SELECT
       us.user_id,
       u.email,
       u.display_name,
       u.username,
       u.avatar_url,
       u.role,
       u.metadata,
       u.email_verified_at,
       u.phone,
       u.first_name,
       u.last_name,
       u.suspend_grace_until
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

  dbQuery(`UPDATE user_sessions SET last_seen_at = now() WHERE session_token_hash = $1`, [
    sessionHash,
  ]).catch(() => {});
  dbQuery(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [user.user_id]).catch(
    () => {},
  );

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
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      avatar_url: user.avatar_url,
      role: user.role,
      phone: user.phone || (user.metadata as { phone?: unknown })?.phone || null,
      emailVerified: Boolean(user.email_verified_at),
      suspendGraceUntil: user.suspend_grace_until,
    },
    orderCount: parseInt(orderStats[0]?.count || "0"),
  });
}

/* ──────────────────────────────────── DELETE handler ──── */

export async function DELETE() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value;

  if (sessionToken) {
    await dbQuery(
      `UPDATE user_sessions SET revoked_at = now() WHERE session_token_hash = $1`,
      [hashSessionToken(sessionToken)],
    );
  }

  const sellerToken = cookieStore.get(SELLER_COOKIE_NAME)?.value;
  if (sellerToken) {
    await dbQuery(`DELETE FROM seller_sessions WHERE token = $1`, [
      hashToken(sellerToken),
    ]).catch(() => {});
  }
  const adminToken = cookieStore.get(getAdminCookieName())?.value;
  if (adminToken) {
    await dbQuery(`DELETE FROM admin_sessions WHERE token = $1`, [
      hashToken(adminToken),
    ]).catch(() => {});
  }

  const response = NextResponse.json({ success: true });
  appendSetCookie(response, clearCookieHeader(COOKIE_NAME));
  appendSetCookie(response, clearCookieHeader(SELLER_COOKIE_NAME));
  appendSetCookie(response, clearCookieHeader(getAdminCookieName()));
  return response;
}
