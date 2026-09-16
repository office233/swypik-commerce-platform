import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const body = await req.json();
    const { items, paymentMethod, totalAmount } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "Coșul POS este gol." }, { status: 400 });
    }

    // Decrement stock atomically for each item
    for (const item of items) {
      if (!item.id || !item.quantity || item.quantity <= 0) continue;

      // Update marketplace_products stock in metadata and status
      await dbQuery(
        `UPDATE marketplace_products
         SET metadata = jsonb_set(
               metadata,
               '{available_stock}',
               to_jsonb(GREATEST(0, COALESCE((metadata->>'available_stock')::numeric, 0) - $1))
             ),
             inventory_status = CASE 
               WHEN GREATEST(0, COALESCE((metadata->>'available_stock')::numeric, 0) - $1) <= 0 THEN 'out_of_stock'
               ELSE 'in_stock'
             END,
             updated_at = NOW()
         WHERE id = $2 AND seller_id = $3`,
        [item.quantity, item.id, sellerId]
      );
    }

    const receiptNumber = `POS-${Date.now().toString().slice(-6)}`;

    return NextResponse.json({
      success: true,
      receiptNumber,
      date: new Date().toISOString(),
      totalAmount,
      paymentMethod,
      message: "Vânzarea a fost înregistrată cu succes și stocul a fost actualizat!",
    });
  } catch (error: any) {
    console.error("[POS Sale API] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Eroare la procesarea vânzării." }, { status: 500 });
  }
}
