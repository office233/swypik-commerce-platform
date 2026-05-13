import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { rows } = await dbQuery(
      `SELECT * FROM marketplace_products WHERE seller_id = $1 ORDER BY created_at DESC`,
      [sellerId],
    );

    return NextResponse.json({ success: true, products: rows });
  } catch (error: any) {
    console.error("[Seller Products API] GET Error:", error);
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
      RETURNING *`,
      [
        sellerId,
        title,
        priceCents,
        category || "General",
        numericStock > 0 ? "in_stock" : "out_of_stock",
        JSON.stringify({ seller_id: sellerId, available_stock: numericStock }),
      ],
    );

    return NextResponse.json({ success: true, product: rows[0] });
  } catch (error: any) {
    console.error("[Seller Products API] POST Error:", error);
    return NextResponse.json({ success: false, error: "Eroare la adaugarea produsului." }, { status: 500 });
  }
}
