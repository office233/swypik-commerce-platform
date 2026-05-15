/**
 * DELETE /api/admin/reviews/[id] — hard delete
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "ID invalid" }, { status: 400 });
  }

  const r = await dbQuery<{ user_id: string; product_id: string; rating: number }>(
    `SELECT user_id, product_id, rating FROM product_reviews WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (r.rows.length === 0) {
    return NextResponse.json({ error: "Recenzie inexistentă" }, { status: 404 });
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
  return NextResponse.json({ ok: true, action: "delete" });
}
