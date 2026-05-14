import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import { generateSecret, getOtpAuthUrl, encryptSecret } from "@/lib/auth/totp";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await dbQuery<{ email: string; totp_enabled_at: string | null }>(
    `SELECT email, totp_enabled_at FROM users WHERE id = $1`,
    [session.userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (rows[0].totp_enabled_at) {
    return NextResponse.json({ error: "2FA este deja activ. Dezactivează-l mai întâi." }, { status: 400 });
  }

  const secret = generateSecret();
  const otpAuthUrl = getOtpAuthUrl(secret, rows[0].email);
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl, { width: 240, margin: 1 });

  // Persist encrypted at rest (AES-256-GCM); requires APP_ENCRYPTION_KEY env
  let stored: string;
  try {
    stored = encryptSecret(secret);
  } catch (e) {
    return NextResponse.json(
      { error: "Server lipsește cheie de criptare. Contactează administratorul." },
      { status: 500 },
    );
  }

  await dbQuery(
    `UPDATE users SET totp_secret = $1, totp_enabled_at = NULL WHERE id = $2`,
    [stored, session.userId],
  );

  return NextResponse.json({ secret, otpAuthUrl, qrCodeDataUrl });
}
