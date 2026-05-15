import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const { rows } = await dbQuery<{ user_id: string }>(
      `SELECT user_id FROM product_reviews WHERE id = $1 LIMIT 1`,
      [id]
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (row.user_id !== session.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (body?.rating !== undefined) {
      const r = Number(body.rating);
      if (!Number.isInteger(r) || r < 1 || r > 5) {
        return NextResponse.json({ error: "invalid_rating" }, { status: 400 });
      }
      updates.push(`rating = $${i++}`);
      values.push(r);
    }
    if (typeof body?.title === "string") {
      updates.push(`title = $${i++}`);
      values.push(body.title.slice(0, 200));
    }
    if (typeof body?.body === "string") {
      updates.push(`body = $${i++}`);
      values.push(body.body.slice(0, 4000));
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "no_changes" }, { status: 400 });
    }
    updates.push(`updated_at = now()`);
    values.push(id);

    await dbQuery(
      `UPDATE product_reviews SET ${updates.join(", ")} WHERE id = $${i}`,
      values
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Reviews PATCH]");
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await params;

    const { rows } = await dbQuery<{ user_id: string }>(
      `SELECT user_id FROM product_reviews WHERE id = $1 LIMIT 1`,
      [id]
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (row.user_id !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    await dbQuery(`DELETE FROM product_reviews WHERE id = $1`, [id]);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Reviews DELETE]");
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
