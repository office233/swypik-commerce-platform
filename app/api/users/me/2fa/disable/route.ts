import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const password = String(body.password || "");
  if (!password) return NextResponse.json({ error: "Parola este obligatorie." }, { status: 400 });

  const { rows } = await dbQuery<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [session.userId],
  );
  if (rows.length === 0 || !rows[0].password_hash) {
    return NextResponse.json({ error: "Nu ai parolă setată." }, { status: 400 });
  }
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return NextResponse.json({ error: "Parolă incorectă." }, { status: 401 });

  await dbQuery(
    `UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_backup_codes = NULL WHERE id = $1`,
    [session.userId],
  );
  return NextResponse.json({ success: true });
}
