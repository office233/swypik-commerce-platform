import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

import { requireAuth } from "@/lib/auth/getAuthUser";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const __auth = await requireAuth(req, ["admin"]);
  if (__auth instanceof NextResponse) return __auth;

  try {
    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") || 100);
    const rawOffset = Number(url.searchParams.get("offset") || 0);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500) : 100;
    const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;
    const { rows } = await dbQuery(`
      SELECT
        id,
        title,
        slug,
        brand,
        category,
        status,
        source_type,
        inventory_status,
        product_url,
        image_url,
        currency,
        price_cents,
        created_at,
        updated_at,
        (metadata->>'orders_count')::int AS orders,
        (metadata->>'has_video')::boolean AS has_video
      FROM marketplace_products
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return NextResponse.json({ products: rows, limit, offset, hasMore: rows.length === limit });
  } catch (error: any) {
    logger.error({ err: error }, "Admin marketplace fetch error:");
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
