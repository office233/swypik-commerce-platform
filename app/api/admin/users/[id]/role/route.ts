/**
 * POST /api/admin/users/[id]/role — body {role: 'admin'|'user'|'creator'|'seller'|'shopper'}
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { logAdminAction } from "@/lib/security/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["admin", "user", "shopper", "creator", "seller"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const role = typeof body?.role === "string" ? body.role : "";
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  const client = await getDb().connect();
  try {
    const exists = await client.query(`SELECT id, role FROM users WHERE id = $1`, [id]);
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    const oldRole = exists.rows[0].role;

    // Guardrail: never let a role change lock every admin out of the panel.
    if (oldRole === "admin" && role !== "admin") {
      // (a) Block an admin from demoting their own account — self-service
      // demotion has no recovery path if it was their only route to /admin.
      let actingUserId: string | null = null;
      try {
        const actor = await getAuthUser();
        actingUserId = actor.isAdmin ? actor.userId : null;
      } catch {
        /* shared-secret admin session without a linked user id — skip self-check */
      }
      if (actingUserId && actingUserId === id) {
        return NextResponse.json({ error: "cannot_demote_self" }, { status: 400 });
      }

      // (b) Block demoting the very last remaining admin account.
      const otherAdmins = await client.query(
        `SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin' AND id <> $1`,
        [id]
      );
      if ((otherAdmins.rows[0]?.c ?? 0) === 0) {
        return NextResponse.json({ error: "last_admin_lockout" }, { status: 400 });
      }
    }

    await client.query("BEGIN");
    try {
      await client.query(`UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1`, [id, role]);
      // Revoke all live sessions when role changes (privilege change → re-login).
      if (oldRole !== role) {
        await client.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
        if (oldRole === "seller") {
          // 2026-08-15 (audit, CRITIC): aici era `.catch(()=>{})`. La
          // retrogradarea unui vânzător, dacă ștergerea sesiunilor eșua,
          // eroarea dispărea — iar utilizatorul rămânea cu o sesiune de
          // vânzător validă deși nu mai avea rolul. Escaladare de privilegii
          // persistentă. Revocarea e parte din schimbarea de rol: dacă pică,
          // rolul NU trebuie schimbat.
          await client.query(`DELETE FROM seller_sessions WHERE seller_id IN (SELECT s.id FROM sellers s JOIN users u ON lower(u.email) = lower(s.email) WHERE u.id = $1)`, [id]);
        }
      }
      await client.query(
        `INSERT INTO moderation_actions (actor_user_id, target_user_id, action_type, reason, metadata)
         VALUES (NULL, $1, 'warn', $2, $3::jsonb)`,
        [
          id,
          `Schimbare rol: ${oldRole} -> ${role}`,
          JSON.stringify({ source: "admin_users_page", old_role: oldRole, new_role: role, kind: "role_change" }),
        ]
      );
      await client.query("COMMIT");
      await logAdminAction({
        action: "user.role_change",
        targetType: "user",
        targetId: id,
        details: { oldRole, newRole: role },
        req,
      });
      return NextResponse.json({ ok: true, role });
    } catch (e) {
      // ROLLBACK best-effort; eroarea originală rămâne cea propagată.
      try { await client.query("ROLLBACK"); } catch { /* vezi catch-ul de mai jos */ }
      throw e;
    }
  } catch (e) {
    logger.error({ err: e, userId: id, role }, "[admin/users/role] schimbare de rol eșuată — tranzacție anulată");
    return NextResponse.json(
      { error: "role_change_failed" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
