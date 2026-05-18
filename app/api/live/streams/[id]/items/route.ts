import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { isUuid } from "@/lib/validation/uuid";

export const dynamic = "force-dynamic";

async function isOwner(streamId: string, userId: string): Promise<boolean> {
  const { rows } = await dbQuery<{ creator_id: string }>(
    `SELECT creator_id FROM live_streams WHERE id = $1`,
    [streamId],
  );
  return rows[0]?.creator_id === userId;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isOwner(id, session.userId)) && session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const product_id = String(body.product_id || "").trim();
  if (!product_id) return NextResponse.json({ error: "product_id_required" }, { status: 400 });
  const display_order = Number(body.display_order || 0);
  const is_pinned = !!body.is_pinned;
  const flash_price_cents = body.flash_price_cents != null ? Number(body.flash_price_cents) : null;
  const flash_until = body.flash_until ? new Date(body.flash_until).toISOString() : null;

  // Validate product exists + ownership (seller/merchant === user OR stream creator)
  const { rows: prodRows } = await dbQuery<{ price_cents: number | null; seller_id: string | null; merchant_id: string | null }>(
    `SELECT price_cents, seller_id, merchant_id
       FROM marketplace_products
      WHERE id::text = $1
      LIMIT 1`,
    [product_id],
  );
  if (prodRows.length === 0) {
    return NextResponse.json({ error: "product_not_found" }, { status: 400 });
  }
  const prod = prodRows[0];
  const isAuthorized =
    session.role === "admin" ||
    prod.seller_id === session.userId ||
    prod.merchant_id === session.userId ||
    (await isOwner(id, session.userId));
  if (!isAuthorized) {
    logger.warn(
      { userId: session.userId, streamId: id, product_id },
      "[live.items] product_ownership_denied",
    );
    return NextResponse.json({ error: "product_ownership_denied" }, { status: 403 });
  }

  if (flash_price_cents !== null) {
    if (!Number.isFinite(flash_price_cents) || flash_price_cents < 50) {
      return NextResponse.json({ error: "flash_price_too_low" }, { status: 400 });
    }
    if (prod.price_cents != null && flash_price_cents > prod.price_cents) {
      return NextResponse.json({ error: "flash_price_above_original" }, { status: 400 });
    }
    logger.info(
      { userId: session.userId, streamId: id, product_id, flash_price_cents, original_cents: prod.price_cents },
      "[live.items] flash_price_set",
    );
  }

  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO live_shop_items (stream_id, product_id, display_order, is_pinned, flash_price_cents, flash_until)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [id, product_id, display_order, is_pinned, flash_price_cents, flash_until],
  );
  return NextResponse.json({ id: rows[0].id });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const { rows } = await dbQuery(
    `SELECT lsi.*, p.title, p.image_url, p.price_cents, p.currency
       FROM live_shop_items lsi
       LEFT JOIN marketplace_products p ON p.id::text = lsi.product_id
      WHERE lsi.stream_id = $1
      ORDER BY lsi.is_pinned DESC, lsi.display_order ASC, lsi.created_at ASC`,
    [id],
  );
  return NextResponse.json({ items: rows });
}
