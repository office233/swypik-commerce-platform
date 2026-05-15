/**
 * POST /api/admin/users/[id]/suspend — body {days, reason}
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "ID invalid" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const days = Number(body?.days);
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!Number.isFinite(days) || days < 1 || days > 36500) {
    return NextResponse.json({ error: "Zile invalide" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Motiv obligatoriu" }, { status: 400 });
  }

  const client = await getDb().connect();
  try {
    const exists = await client.query(`SELECT id, role FROM users WHERE id = $1`, [id]);
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: "Utilizator inexistent" }, { status: 404 });
    }
    if (exists.rows[0].role === "admin") {
      return NextResponse.json({ error: "Nu poti suspenda un alt admin. Retrogradeaza-l intai." }, { status: 400 });
    }

    await client.query("BEGIN");
    try {
      await client.query(
        `UPDATE users
         SET suspended_until = NOW() + ($2::int || ' days')::interval,
             suspension_reason = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [id, days, reason]
      );
      await client.query(
        `INSERT INTO moderation_actions (actor_user_id, target_user_id, action_type, reason, ends_at, metadata)
         VALUES (NULL, $1, $2, $3, NOW() + ($4::int || ' days')::interval, $5::jsonb)`,
        [
          id,
          days >= 36500 ? "ban_user" : "suspend_user",
          reason,
          days,
          JSON.stringify({ source: "admin_users_page", days }),
        ]
      );
      await client.query("COMMIT");
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      throw e;
    }
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, days, reason });
}
