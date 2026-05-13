import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { isAdminRequest } from "@/lib/security/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
      LIMIT 5000
    `);
    return NextResponse.json({ products: rows });
  } catch (error: any) {
    console.error("Admin marketplace fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
