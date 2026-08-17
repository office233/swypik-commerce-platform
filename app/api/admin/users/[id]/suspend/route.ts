/**
 * POST /api/admin/users/[id]/suspend — body {days, reason}
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";

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
      await client.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
      // 2026-08-15 (audit, CRITIC): aici era `.catch(()=>{})`. Dacă ștergerea
      // sesiunilor de vânzător eșua, eroarea era înghițită — dar Postgres
      // marchează tranzacția ca „aborted", deci COMMIT-ul următor eșua oricum.
      // Rezultatul era o suspendare parțială raportată ca succes: utilizator
      // „suspendat" în UI, dar cu sesiunea de vânzător încă activă.
      // Revocarea sesiunilor face parte din actul de suspendare — dacă pică,
      // întreaga operație trebuie anulată.
      await client.query(`DELETE FROM seller_sessions WHERE seller_id IN (SELECT s.id FROM sellers s JOIN users u ON lower(u.email) = lower(s.email) WHERE u.id = $1)`, [id]);
      await client.query("COMMIT");
    } catch (e) {
      // ROLLBACK-ul e best-effort: dacă și el eșuează (conexiune pierdută),
      // nu vrem să mascăm eroarea originală, care e cea relevantă.
      try { await client.query("ROLLBACK"); } catch { /* eroarea originală se propagă mai jos */ }
      throw e;
    }
  } catch (e) {
    logger.error({ err: e, userId: id }, "[admin/users/suspend] suspendare eșuată — tranzacție anulată");
    return NextResponse.json(
      { error: "Suspendarea nu a putut fi finalizată. Nicio modificare nu a fost aplicată." },
      { status: 500 },
    );
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, days, reason });
}
