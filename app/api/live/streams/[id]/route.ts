import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await dbQuery(
    `SELECT ls.*, u.username, u.display_name, u.avatar_url
       FROM live_streams ls
       LEFT JOIN users u ON u.id::text = ls.creator_id
      WHERE ls.id = $1 LIMIT 1`,
    [id],
  );
  if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const stream = rows[0] as any;

  // Hide stream_key unless owner
  const session = await getAuthSession();
  if (!session || session.userId !== stream.creator_id) {
    delete stream.stream_key;
    delete stream.rtmp_url;
  }

  const { rows: items } = await dbQuery(
    `SELECT lsi.id, lsi.product_id, lsi.display_order, lsi.is_pinned,
            lsi.flash_price_cents, lsi.flash_until,
            p.title, p.image_url, p.price_cents, p.currency
       FROM live_shop_items lsi
       LEFT JOIN marketplace_products p ON p.id::text = lsi.product_id
      WHERE lsi.stream_id = $1
      ORDER BY lsi.is_pinned DESC, lsi.display_order ASC, lsi.created_at ASC`,
    [id],
  );

  return NextResponse.json({ stream, items });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rows: ownRows } = await dbQuery<{ creator_id: string }>(
    `SELECT creator_id FROM live_streams WHERE id = $1`,
    [id],
  );
  if (!ownRows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ownRows[0].creator_id !== session.userId && session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;
  if (typeof body.title === "string") { fields.push(`title = $${idx++}`); values.push(body.title); }
  if (typeof body.description === "string") { fields.push(`description = $${idx++}`); values.push(body.description); }
  if (body.status === "ended") {
    fields.push(`status = $${idx++}`); values.push("ended");
    fields.push(`ended_at = now()`);
  }
  if (!fields.length) return NextResponse.json({ ok: true });
  values.push(id);
  await dbQuery(`UPDATE live_streams SET ${fields.join(", ")} WHERE id = $${idx}`, values);
  return NextResponse.json({ ok: true });
}
