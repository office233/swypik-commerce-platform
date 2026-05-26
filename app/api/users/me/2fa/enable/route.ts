import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import { verifyToken, generateBackupCodes, hashBackupCodes } from "@/lib/auth/totp";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await rateLimit("twoFactor", `enable:${session.userId}:${getClientIP(req)}`);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  if (!/^\d{6}$/.test(token)) {
    return NextResponse.json({ error: "Codul trebuie să aibă 6 cifre." }, { status: 400 });
  }

  const { rows } = await dbQuery<{ totp_secret: string | null; totp_enabled_at: string | null }>(
    `SELECT totp_secret, totp_enabled_at FROM users WHERE id = $1`,
    [session.userId],
  );
  if (rows.length === 0 || !rows[0].totp_secret) {
    return NextResponse.json({ error: "Inițializează 2FA mai întâi." }, { status: 400 });
  }
  if (rows[0].totp_enabled_at) {
    return NextResponse.json({ error: "2FA este deja activ." }, { status: 400 });
  }
  if (!verifyToken(rows[0].totp_secret, token)) {
    return NextResponse.json({ error: "Cod invalid. Verifică ora telefonului." }, { status: 400 });
  }

  const codes = generateBackupCodes(10);
  const hashed = await hashBackupCodes(codes);
  await dbQuery(
    `UPDATE users SET totp_enabled_at = now(), totp_backup_codes = $1 WHERE id = $2`,
    [hashed, session.userId],
  );

  return NextResponse.json({ success: true, backup_codes: codes });
}
