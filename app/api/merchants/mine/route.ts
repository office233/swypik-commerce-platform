/**
 * GET /api/merchants/mine — comercianții sellerului logat (pentru panou).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { withErrorHandling } from "@/lib/api-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function GET_impl(): Promise<Response> {
  const sellerId = await getSellerSessionId();
  if (!sellerId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { rows } = await dbQuery(
    `SELECT id, kind, name, slug, status, is_open_override, opening_hours,
            location_city, delivery_fee_cents, min_order_cents, avg_prep_minutes, image_url
       FROM local_merchants
      WHERE seller_id = $1
      ORDER BY created_at ASC`,
    [sellerId],
  );
  return NextResponse.json({ success: true, merchants: rows });
}

export const GET = withErrorHandling(GET_impl);
