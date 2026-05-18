import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { autoEmbedProduct } from "@/lib/ai/auto-embed";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

const SELLER_PRODUCT_COLS = `
  id, title, slug, price_cents, compare_at_price_cents, currency, category,
  status, inventory_status, image_url, source_type, supplier_product_id,
  metadata, created_at, updated_at
`;

export async function GET(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") || 20);
    const rawOffset = Number(url.searchParams.get("offset") || 0);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 20;
    const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;

    const { rows } = await dbQuery(
      `SELECT ${SELLER_PRODUCT_COLS}
       FROM marketplace_products
       WHERE seller_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [sellerId, limit, offset],
    );

    return NextResponse.json({ success: true, products: rows, limit, offset, hasMore: rows.length === limit });
  } catch (error: any) {
    logger.error({ err: error }, "[Seller Products API] GET Error:");
    return NextResponse.json({ success: false, error: "Eroare la preluarea produselor." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, price, stock, category } = body;
    const numericPrice = Number(price);
    const numericStock = Number(stock);

    if (!title || !Number.isFinite(numericPrice) || numericPrice <= 0 || !Number.isInteger(numericStock) || numericStock < 0) {
      return NextResponse.json({ success: false, error: "Titlul, pretul si stocul sunt obligatorii." }, { status: 400 });
    }

    const priceCents = Math.round(numericPrice * 100);
    const { rows } = await dbQuery(
      `INSERT INTO marketplace_products (
        source_type,
        seller_id,
        title,
        price_cents,
        category,
        currency,
        status,
        inventory_status,
        metadata
      ) VALUES ('seller', $1, $2, $3, $4, 'RON', 'active', $5, $6::jsonb)
      RETURNING ${SELLER_PRODUCT_COLS}`,
      [
        sellerId,
        title,
        priceCents,
        category || "General",
        numericStock > 0 ? "in_stock" : "out_of_stock",
        JSON.stringify({ seller_id: sellerId, available_stock: numericStock }),
      ],
    );

    if (rows[0]?.id) autoEmbedProduct(rows[0].id, rows[0].title, null);
    return NextResponse.json({ success: true, product: rows[0] });
  } catch (error: any) {
    logger.error({ err: error }, "[Seller Products API] POST Error:");
    return NextResponse.json({ success: false, error: "Eroare la adaugarea produsului." }, { status: 500 });
  }
}
