import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { deriveOrderStatus } from "@/lib/commerce/order-status";
import { getSellerSessionId } from "@/lib/security/seller-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const salesRes = await dbQuery(
      `SELECT COALESCE(SUM(unit_amount_cents * quantity), 0) as total_sales
       FROM commerce_order_items
       WHERE metadata->>'seller_id' = $1`,
      [sellerId]
    );
    const totalSalesCents = salesRes.rows[0]?.total_sales || 0;
    const totalSalesLei = Math.round(Number(totalSalesCents) / 100);

    const pendingRes = await dbQuery(
      `SELECT COUNT(DISTINCT order_id) as pending_count
       FROM commerce_order_items
       WHERE metadata->>'seller_id' = $1
         AND source_status = 'pending_seller_action'`,
      [sellerId]
    );
    const pendingOrders = parseInt(pendingRes.rows[0]?.pending_count || "0", 10);

    const productsRes = await dbQuery(
      `SELECT COUNT(*) as products_count
       FROM marketplace_products
       WHERE seller_id = $1
         AND status = 'active'`,
      [sellerId]
    );
    const activeProducts = parseInt(productsRes.rows[0]?.products_count || "0", 10);

    const sellerRes = await dbQuery(
      `SELECT stripe_account_id, metadata FROM sellers WHERE id = $1`,
      [sellerId]
    );
    const sellerMetadata = sellerRes.rows[0]?.metadata || {};
    const stripeConnected = !!(sellerRes.rows[0]?.stripe_account_id || sellerMetadata.stripe_account_id);

    const recentRes = await dbQuery(
      `SELECT
         co.id as order_id,
         co.status as order_status,
         co.metadata as order_meta,
         co.created_at,
         SUM(coi.quantity * coi.unit_amount_cents) as total_cents,
         json_agg(
           json_build_object(
             'item_id', coi.id,
             'title', coi.title,
             'quantity', coi.quantity,
             'source_status', coi.source_status
           )
           ORDER BY coi.created_at
         ) as items
       FROM commerce_orders co
       JOIN commerce_order_items coi ON co.id = coi.order_id
       WHERE coi.metadata->>'seller_id' = $1
       GROUP BY co.id, co.status, co.metadata, co.created_at
       ORDER BY co.created_at DESC
       LIMIT 5`,
      [sellerId]
    );

    const recentOrders = recentRes.rows.map((row: any) => {
      const items = row.items || [];
      const allFulfilled = items.length > 0 && items.every((item: any) => item.source_status === "fulfilled");
      const localFulfillmentStatus =
        row.order_status === "return_requested" || row.order_status === "refunded"
          ? row.order_status
          : allFulfilled
            ? "fulfilled"
            : "pending_seller_action";
      const statusInfo = deriveOrderStatus({
        status: row.order_status,
        fulfillmentStatus: localFulfillmentStatus,
        metadata: row.order_meta,
      });

      return {
        orderId: row.order_id,
        totalCents: Number(row.total_cents || 0),
        createdAt: row.created_at,
        items,
        status: statusInfo.key,
        statusLabel: statusInfo.label,
        trackingNumber: row.order_meta?.tracking_number || row.order_meta?.latest_tracking_number || null,
      };
    });

    return NextResponse.json({
      success: true,
      totalSalesLei,
      pendingOrders,
      activeProducts,
      stripeConnected,
      recentOrders,
    });
  } catch (error: any) {
    console.error("[Seller Dashboard API] GET Error:", error);
    return NextResponse.json({ success: false, error: "Eroare la preluarea dashboard-ului." }, { status: 500 });
  }
}
