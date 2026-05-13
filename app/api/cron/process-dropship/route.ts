import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { timingSafeEqual } from "crypto";
import { placeDropshipOrder } from "@/lib/aliexpress/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") || req.headers.get("x-cron-secret");
  const cronSecretHeader = req.headers.get("cron-secret") || req.headers.get("CRON_SECRET");

  const providedSecret = token || cronSecretHeader;
  const expected = process.env.CRON_SECRET;
  if (!expected || !providedSecret ||
      Buffer.byteLength(providedSecret) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { rows: pendingItems } = await dbQuery(
      `SELECT
         coi.id AS item_id,
         coi.order_id,
         coi.title,
         coi.quantity,
         coi.metadata AS item_metadata,
         co.metadata AS order_metadata,
         mp.supplier_product_id AS ae_product_id,
         mpv.sku AS ae_sku_id
       FROM commerce_order_items coi
       JOIN commerce_orders co ON co.id = coi.order_id
       LEFT JOIN marketplace_products mp ON mp.id::text = coi.metadata->>'pg_id'
       LEFT JOIN marketplace_product_variants mpv ON mpv.sku = coi.metadata->>'sku_id'
       WHERE coi.source_status = 'pending_dropship'`
    );

    if (pendingItems.length === 0) {
      return NextResponse.json({ success: true, processedCount: 0 });
    }

    const itemsByOrder: Record<string, typeof pendingItems> = {};
    for (const item of pendingItems) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push(item);
    }

    let processedCount = 0;

    for (const [orderId, items] of Object.entries(itemsByOrder)) {
      const orderMetadata = items[0].order_metadata || {};
      const shippingAddress = orderMetadata.shipping_address;

      if (!shippingAddress) {
        console.error(`[Cron] Order ${orderId} has no shipping address.`);
        continue;
      }

      const aeItems = items.map(item => ({
        ae_product_id: item.ae_product_id,
        ae_sku_attr: item.ae_sku_id, 
        quantity: item.quantity,
      }));

      try {
        console.log(`[Cron] Placing dropship order on AE for order ${orderId} with ${aeItems.length} items...`);
        const result = await placeDropshipOrder(orderId, shippingAddress, aeItems);
        
        const aeOrderId = result?.order_list?.[0] || result?.aliexpress_order_id || null;
        
        await dbQuery(
          `UPDATE commerce_order_items
           SET source_status = 'processing_dropship',
               metadata = metadata || jsonb_build_object('ae_order_id', $2::text)
           WHERE order_id = $1 AND source_status = 'pending_dropship'`,
          [orderId, aeOrderId]
        );
        processedCount += items.length;
      } catch (aeError: any) {
        console.error(`[Cron] AE auto-ordering failed for order ${orderId}:`, aeError);
      }
    }

    return NextResponse.json({
      success: true,
      processedCount
    });
  } catch (error: any) {
    console.error("[Process Dropship Cron Error]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export const POST = GET;
