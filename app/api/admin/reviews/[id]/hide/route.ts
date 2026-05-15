/**
 * POST /api/admin/reviews/[id]/hide
 * Body: { reason?: string }
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { dbQuery } from "@/lib/db";

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
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;

  const r = await dbQuery<{ user_id: string; product_id: string; is_hidden: boolean }>(
    `SELECT user_id, product_id, is_hidden FROM product_reviews WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (r.rows.length === 0) {
    return NextResponse.json({ error: "Recenzie inexistentă" }, { status: 404 });
  }

  await dbQuery("BEGIN");
  try {
    await dbQuery(
      `UPDATE product_reviews SET is_hidden = true, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await dbQuery(
      `INSERT INTO moderation_actions (target_user_id, action_type, reason, metadata)
       VALUES ($1, 'hide', $2, $3::jsonb)`,
      [
        r.rows[0].user_id,
        reason || "Recenzie ascunsă de moderator",
        JSON.stringify({ kind: "review", review_id: id, product_id: r.rows[0].product_id }),
      ]
    );
    await dbQuery("COMMIT");
  } catch (e) {
    await dbQuery("ROLLBACK");
    throw e;
  }
  return NextResponse.json({ ok: true, action: "hide" });
}
