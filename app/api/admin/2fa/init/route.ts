/**
 * POST /api/admin/2fa/init
 *
 * Generates a new TOTP secret (NOT yet activated) + provisioning URI for
 * QR code rendering, and stores the secret encrypted in admin_credentials.
 *
 * Activation happens via POST /api/admin/2fa/enable after the admin proves
 * they can read the secret (by sending back a valid code).
 *
 * Auth: requires an existing admin session (caller is already-logged-in
 * admin). Re-running init resets the secret — the previous one is
 * overwritten, which is fine because nothing depends on it until enable
 * is called.
 */

import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { dbQuery } from "@/lib/db";
import {
  encryptSecret,
  generateSecret,
  getOtpAuthUrl,
} from "@/lib/auth/totp";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = logger.child({ route: "/api/admin/2fa/init" });

export async function POST(req: Request) {
  // Rate limit: 5 inits / 5 min / IP. Even though the caller is already
  // authed (admin session required), we cap it so a compromised admin
  // session can't be used to thrash the table or flood logs.
  const ip = getClientIP(req);
  const { success } = await rateLimit("adminTotpInit", ip);
  if (!success) {
    log.warn({ ip }, "admin_totp_init_rate_limited");
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = generateSecret();
  const encrypted = encryptSecret(secret);

  await dbQuery(
    `UPDATE admin_credentials
        SET totp_secret = $1,
            totp_enabled_at = NULL,
            updated_at = now()
      WHERE id = '00000000-0000-0000-0000-000000000001'`,
    [encrypted],
  );

  // The label shown inside the authenticator app — use a fixed string,
  // since the admin has no email/identity associated with the credentials.
  const otpauthUrl = getOtpAuthUrl(secret, "admin@swypik");

  // Return the raw secret so the UI can build a QR / show fallback text.
  // This is the ONLY time the secret leaves the server in plaintext;
  // after enable, decryptSecret() is called server-side only.
  return NextResponse.json({
    success: true,
    secret,
    otpauthUrl,
  });
}
