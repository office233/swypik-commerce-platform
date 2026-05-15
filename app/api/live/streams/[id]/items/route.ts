import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

async function isOwner(streamId: string, userId: string): Promise<boolean> {
  const { rows } = await dbQuery<{ creator_id: string }>(
    `SELECT creator_id FROM live_streams WHERE id = $1`,
    [streamId],
  );
  return rows[0]?.creator_id === userId;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isOwner(params.id, session.userId)) && session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const product_id = String(body.product_id || "").trim();
  if (!product_id) return NextResponse.json({ error: "product_id_required" }, { status: 400 });
  const display_order = Number(body.display_order || 0);
  const is_pinned = !!body.is_pinned;
  const flash_price_cents = body.flash_price_cents != null ? Number(body.flash_price_cents) : null;
  const flash_until = body.flash_until ? new Date(body.flash_until).toISOString() : null;

  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO live_shop_items (stream_id, product_id, display_order, is_pinned, flash_price_cents, flash_until)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [params.id, product_id, display_order, is_pinned, flash_price_cents, flash_until],
  );
  return NextResponse.json({ id: rows[0].id });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { rows } = await dbQuery(
    `SELECT lsi.*, p.title, p.image_url, p.price_cents, p.currency
       FROM live_shop_items lsi
       LEFT JOIN marketplace_products p ON p.id::text = lsi.product_id
      WHERE lsi.stream_id = $1
      ORDER BY lsi.is_pinned DESC, lsi.display_order ASC, lsi.created_at ASC`,
    [params.id],
  );
  return NextResponse.json({ items: rows });
}
