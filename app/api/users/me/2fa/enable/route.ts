import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import { verifyToken, generateBackupCodes, hashBackupCodes } from "@/lib/auth/totp";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { TwoFactorTokenSchema, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await rateLimit("twoFactor", `enable:${session.userId}:${getClientIP(req)}`);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const rawBody = await req.json().catch(() => null);
  const parsed = parseBody(TwoFactorTokenSchema, rawBody);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { token } = parsed.data;

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
