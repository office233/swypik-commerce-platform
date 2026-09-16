import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const { id: adId } = await params;

    const { rows: current } = await dbQuery(
      `SELECT id, status FROM seller_ads WHERE id = $1 AND seller_id = $2`,
      [adId, sellerId]
    );

    if (!current.length) {
      return NextResponse.json({ success: false, error: "Campania nu a fost găsită." }, { status: 404 });
    }

    const newStatus = current[0].status === "active" ? "paused" : "active";

    const { rows: updated } = await dbQuery(
      `UPDATE seller_ads
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND seller_id = $3
       RETURNING id, status`,
      [newStatus, adId, sellerId]
    );

    return NextResponse.json({
      success: true,
      campaign: updated[0],
      message: newStatus === "active" ? "Campania a fost reluată." : "Campania a fost pusă pe pauză.",
    });
  } catch (error: any) {
    console.error("[Seller Ads Toggle] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
