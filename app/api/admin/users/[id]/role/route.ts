/**
 * POST /api/admin/users/[id]/role — body {role: 'admin'|'user'|'creator'|'seller'|'shopper'}
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["admin", "user", "shopper", "creator", "seller"]);

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
  const role = typeof body?.role === "string" ? body.role : "";
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "Rol invalid" }, { status: 400 });
  }

  const exists = await dbQuery(`SELECT id, role FROM users WHERE id = $1`, [id]);
  if (exists.rows.length === 0) {
    return NextResponse.json({ error: "Utilizator inexistent" }, { status: 404 });
  }
  const oldRole = exists.rows[0].role;

  await dbQuery("BEGIN");
  try {
    await dbQuery(`UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1`, [id, role]);
    await dbQuery(
      `INSERT INTO moderation_actions (actor_user_id, target_user_id, action_type, reason, metadata)
       VALUES (NULL, $1, 'warn', $2, $3::jsonb)`,
      [
        id,
        `Schimbare rol: ${oldRole} -> ${role}`,
        JSON.stringify({ source: "admin_users_page", old_role: oldRole, new_role: role, kind: "role_change" }),
      ]
    );
    await dbQuery("COMMIT");
  } catch (e) {
    await dbQuery("ROLLBACK");
    throw e;
  }

  return NextResponse.json({ ok: true, role });
}
