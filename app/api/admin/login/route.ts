/**
 * POST /api/admin/login
 *
 * Two-step login with mandatory TOTP once enabled.
 *
 *   Step 1: { password }                       → ADMIN_SECRET match
 *     - If admin_credentials.totp_enabled_at is NULL (TOTP not yet set up)
 *         → issue session immediately + return needsTotpSetup: true so the
 *           UI sends the user to /admin/setup-2fa right away. This is a
 *           one-time grace path; the first admin needs SOME way in to
 *           configure TOTP.
 *     - If TOTP enabled → return { needsTotp: true, tempToken }; the
 *       caller must POST step 2 with the code. tempToken lives 5 min in
 *       Redis to bind the two requests together.
 *
 *   Step 2: { tempToken, totpCode }            → TOTP / backup verification
 *     - 6-digit code: HMAC-SHA1 verify against decrypted secret (window ±1).
 *     - 8-hex code:  consume one backup code (bcrypt-compare in helper).
 *     - On success, issue the admin session cookie.
 *
 * Rate limit 5/5min/IP applies to BOTH steps (separate buckets). After the
 * limit is hit we return 429 without any hint about which step failed —
 * makes username enumeration attacks pointless.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  createAdminSessionAndGetCookie,
  isAdminConfigured,
  isAdminToken,
} from "@/lib/security/admin-auth";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import { dbQuery } from "@/lib/db";
import {
  decryptSecret,
  verifyToken,
  consumeBackupCode,
} from "@/lib/auth/totp";

const log = logger.child({ route: "/api/admin/login" });
const TEMP_TTL_SECONDS = 300; // 5 minutes between step 1 and step 2

type AdminCred = {
  totp_secret: string | null;
  totp_enabled_at: Date | null;
  totp_backup_codes: string[] | null;
};

async function loadCred(): Promise<AdminCred | null> {
  const { rows } = await dbQuery<AdminCred>(
    `SELECT totp_secret, totp_enabled_at, totp_backup_codes
       FROM admin_credentials
      WHERE id = '00000000-0000-0000-0000-000000000001'`,
  );
  return rows[0] || null;
}

function genTempToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export async function POST(req: Request) {
  try {
    if (!isAdminConfigured()) {
      return NextResponse.json(
        { success: false, error: "ADMIN_SECRET is not configured." },
        { status: 503 },
      );
    }

    const ip = getClientIP(req);
    // Same bucket for both steps — a determined attacker can't bypass the
    // limit by interleaving step-1 and step-2 calls.
    const { success: allowed } = await rateLimit("admin-login", ip, { limit: 5, window: 300 });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Too many login attempts. Please wait." },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { password, tempToken, totpCode } = body as {
      password?: string;
      tempToken?: string;
      totpCode?: string;
    };

    /* ────────────────────────── STEP 2 ────────────────────────── */
    if (tempToken && totpCode) {
      const code = String(totpCode).trim();
      const cred = await loadCred();
      if (!cred || !cred.totp_secret || !cred.totp_enabled_at) {
        return NextResponse.json(
          { success: false, error: "TOTP not configured." },
          { status: 400 },
        );
      }

      let redis;
      try {
        const mod = await import("@/lib/redis");
        redis = mod.getRedis();
      } catch (err) {
        log.error({ err: String(err) }, "redis_import_failed");
        return NextResponse.json(
          { success: false, error: "Server error." },
          { status: 500 },
        );
      }
      const raw = await redis.get(`admin:2fa:pending:${tempToken}`);
      if (!raw) {
        return NextResponse.json(
          { success: false, error: "2FA session expired. Please log in again." },
          { status: 401 },
        );
      }

      const decryptedSecret = decryptSecret(cred.totp_secret);
      let valid = /^\d{6}$/.test(code) && verifyToken(decryptedSecret, code);

      // Backup-code fallback (8 hex chars, single-use).
      if (!valid && /^[0-9a-fA-F]{8}$/.test(code) && cred.totp_backup_codes) {
        const result = await consumeBackupCode(cred.totp_backup_codes, code);
        if (result.matched) {
          await dbQuery(
            `UPDATE admin_credentials SET totp_backup_codes = $1, updated_at = now()
              WHERE id = '00000000-0000-0000-0000-000000000001'`,
            [result.remaining],
          );
          valid = true;
        }
      }

      if (!valid) {
        log.warn({ ip }, "admin_totp_invalid");
        return NextResponse.json(
          { success: false, error: "Invalid TOTP code." },
          { status: 401 },
        );
      }

      await redis.del(`admin:2fa:pending:${tempToken}`);
      const cookieHeader = await createAdminSessionAndGetCookie();
      const response = NextResponse.json({ success: true });
      response.headers.set("Set-Cookie", cookieHeader);
      log.info({ ip }, "admin_login_ok");
      return response;
    }

    /* ────────────────────────── STEP 1 ────────────────────────── */
    if (!password) {
      return NextResponse.json(
        { success: false, error: "Admin password is required." },
        { status: 400 },
      );
    }
    if (!isAdminToken(password)) {
      log.warn({ ip }, "admin_password_invalid");
      return NextResponse.json(
        { success: false, error: "Incorrect admin password." },
        { status: 401 },
      );
    }

    const cred = await loadCred();
    const totpEnabled = !!(cred && cred.totp_enabled_at && cred.totp_secret);

    // First-time setup path: no TOTP yet, allow direct login but flag the
    // UI to redirect to setup. This is unavoidable — somebody has to be
    // able to enroll the first secret.
    if (!totpEnabled) {
      log.warn({ ip }, "admin_login_without_totp_grace");
      const cookieHeader = await createAdminSessionAndGetCookie();
      const response = NextResponse.json({
        success: true,
        needsTotpSetup: true,
        message:
          "TOTP not configured. Please enroll 2FA at /admin/setup-2fa immediately. " +
          "This grace login is allowed only because no admin TOTP secret exists yet.",
      });
      response.headers.set("Set-Cookie", cookieHeader);
      return response;
    }

    // TOTP gate: issue a pending token; UI will collect the 6-digit code
    // and POST it back as step 2.
    let redis;
    try {
      const mod = await import("@/lib/redis");
      redis = mod.getRedis();
    } catch (err) {
      log.error({ err: String(err) }, "redis_import_failed");
      return NextResponse.json(
        { success: false, error: "Server error." },
        { status: 500 },
      );
    }
    const tt = genTempToken();
    await redis.set(`admin:2fa:pending:${tt}`, "1", "EX", TEMP_TTL_SECONDS);

    return NextResponse.json({
      success: true,
      needsTotp: true,
      tempToken: tt,
      ttlSeconds: TEMP_TTL_SECONDS,
    });
  } catch (error: any) {
    log.error({ err: error?.message }, "admin_login_error");
    return NextResponse.json(
      { success: false, error: "Login failed." },
      { status: 500 },
    );
  }
}
