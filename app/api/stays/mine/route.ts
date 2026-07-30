/**
 * GET /api/stays/mine — cazările sellerului logat (pentru panoul de calendar).
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
    `SELECT id, title, currency, status, vertical_attributes
       FROM marketplace_products
      WHERE seller_id = $1
        AND taxonomy_node_slug LIKE 'vacation-rentals%'
      ORDER BY created_at DESC
      LIMIT 100`,
    [sellerId],
  );
  return NextResponse.json({ success: true, stays: rows });
}

export const GET = withErrorHandling(GET_impl);
