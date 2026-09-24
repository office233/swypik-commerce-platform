/**
 * DELETE /api/admin/reviews/[id] — hard delete
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { dbQuery } from "@/lib/db";
import { logAdminAction } from "@/lib/security/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
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

  const r = await dbQuery<{ user_id: string; product_id: string; rating: number }>(
    `SELECT user_id, product_id, rating FROM product_reviews WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (r.rows.length === 0) {
    return NextResponse.json({ error: "review_not_found" }, { status: 404 });
  }

  await dbQuery("BEGIN");
  try {
    await dbQuery(
      `INSERT INTO moderation_actions (target_user_id, action_type, reason, metadata)
       VALUES ($1, 'delete', 'Recenzie ștearsă de moderator', $2::jsonb)`,
      [
        r.rows[0].user_id,
        JSON.stringify({
          kind: "review",
          review_id: id,
          product_id: r.rows[0].product_id,
          rating: r.rows[0].rating,
        }),
      ]
    );
    await dbQuery(`DELETE FROM product_reviews WHERE id = $1`, [id]);
    await dbQuery("COMMIT");
  } catch (e) {
    await dbQuery("ROLLBACK");
    throw e;
  }
  await logAdminAction({
    action: "review.delete",
    targetType: "product_review",
    targetId: id,
    details: { productId: r.rows[0].product_id, rating: r.rows[0].rating },
    req,
  });
  return NextResponse.json({ ok: true, action: "delete" });
}
