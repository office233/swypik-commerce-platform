/**
 * POST /api/admin/users/[id]/unsuspend
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logAdminAction } from "@/lib/security/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query(
        `UPDATE users SET suspended_until = NULL, suspension_reason = NULL, updated_at = NOW() WHERE id = $1`,
        [id]
      );
      await client.query(
        `INSERT INTO moderation_actions (actor_user_id, target_user_id, action_type, reason, metadata)
         VALUES (NULL, $1, 'restore', $2, $3::jsonb)`,
        [id, "Suspendare ridicata de admin", JSON.stringify({ source: "admin_users_page" })]
      );
      await client.query("COMMIT");
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch { /* original error propagates below */ }
      throw e;
    }
  } catch (e) {
    logger.error({ err: e, userId: id }, "[admin/users/unsuspend] failed");
    return NextResponse.json({ error: "unsuspend_failed" }, { status: 500 });
  } finally {
    client.release();
  }

  await logAdminAction({
    action: "user.unsuspend",
    targetType: "user",
    targetId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}
