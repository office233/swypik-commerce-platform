/**
 * POST /api/admin/2fa/enable   { code }
 *
 * Activates the previously-initialized TOTP secret after verifying that
 * the admin can produce a current code. Generates and returns 10 backup
 * codes (8 hex chars each). These are shown once — bcrypt-hashed before
 * being stored.
 *
 * After this completes, /api/admin/login starts requiring TOTP on every
 * sign-in (the grace path no longer applies).
 */

import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { dbQuery } from "@/lib/db";
import {
  decryptSecret,
  verifyToken,
  generateBackupCodes,
  hashBackupCodes,
} from "@/lib/auth/totp";
import { logger } from "@/lib/logger";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = logger.child({ route: "/api/admin/2fa/enable" });

export async function POST(req: Request) {
  // Brute-force guard on the TOTP code field. 10 verify attempts / 5 min / IP
  // is well above any legitimate retry (re-syncing a clock, fat-fingering
  // the keypad once or twice) but blocks 1M+/sec automated guessing.
  // 6-digit space = 1M codes × window=±1 ≈ 3 valid windows = 3M effective
  // tries needed in the worst case; 10/5min keeps it astronomical.
  const ip = getClientIP(req);
  const { success } = await rateLimit("adminTotpEnable", ip);
  if (!success) {
    log.warn({ ip }, "admin_totp_enable_rate_limited");
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code || "").trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code format." }, { status: 400 });
  }

  const { rows } = await dbQuery<{ totp_secret: string | null; totp_enabled_at: Date | null }>(
    `SELECT totp_secret, totp_enabled_at FROM admin_credentials
      WHERE id = '00000000-0000-0000-0000-000000000001'`,
  );
  const cred = rows[0];
  if (!cred || !cred.totp_secret) {
    return NextResponse.json(
      { error: "Run /api/admin/2fa/init first." },
      { status: 400 },
    );
  }

  const plain = decryptSecret(cred.totp_secret);
  if (!verifyToken(plain, code)) {
    log.warn({}, "totp_enable_failed_bad_code");
    return NextResponse.json({ error: "Invalid code. Try again." }, { status: 401 });
  }

  // Generate 10 single-use backup codes. We return them in cleartext now
  // (the admin must store them somewhere safe) but persist only bcrypt
  // hashes — so even a future DB leak can't yield usable codes.
  const codes = generateBackupCodes(10);
  const hashed = await hashBackupCodes(codes);

  await dbQuery(
    `UPDATE admin_credentials
        SET totp_enabled_at = now(),
            totp_backup_codes = $1,
            updated_at = now()
      WHERE id = '00000000-0000-0000-0000-000000000001'`,
    [hashed],
  );

  log.info({}, "admin_totp_enabled");

  return NextResponse.json({
    success: true,
    backupCodes: codes,
    notice:
      "Save these backup codes somewhere safe. Each can be used ONCE if you lose " +
      "access to your authenticator. They will never be shown again.",
  });
}
