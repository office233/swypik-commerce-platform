import { dbQuery } from "@/lib/db";
import { sendSellerNewOrderAlert } from "@/lib/email/service";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "order-router" });

export type OrderItem = {
  productId: string;
  skuId?: string;
  title: string;
  quantity: number;
  price: number;
  image?: string;
  metadata?: any;
};

export type FulfillmentPlan = {
  aliexpress: OrderItem[];
  localSellers: Record<string, OrderItem[]>;
};

/**
 * routeOrder routes the items from a completed order to the correct suppliers.
 * Separates items into "aliexpress" (dropshipping) and "localSellers" (by seller_id).
 */
export async function routeOrder(orderId: string, items: OrderItem[]): Promise<FulfillmentPlan> {
  const plan: FulfillmentPlan = {
    aliexpress: [],
    localSellers: {},
  };

  const updates: Promise<any>[] = [];

  for (const item of items) {
    const sellerId = item.metadata?.seller_id;
    const source = item.metadata?.source || "aliexpress";

    if (sellerId) {
      if (!plan.localSellers[sellerId]) plan.localSellers[sellerId] = [];
      plan.localSellers[sellerId].push(item);
    } else {
      plan.aliexpress.push(item);
    }

    const sourceStatus = sellerId ? 'pending_seller_action' : 'pending_dropship';

    // Build a unique key matching the row inserted by persistOrderItems()
    // in webhooks/stripe/route.ts: external_line_item_id = "${pgId}:${skuId || 'default'}".
    // The previous implementation matched on (li.id OR title) — li.id never matched
    // and title-fallback updated all rows sharing the same product title.
    const pgId = item.metadata?.pgId
      || item.metadata?.pg_id
      || item.metadata?.product_id
      || item.productId;
    const sku = item.skuId || item.metadata?.skuId || item.metadata?.sku_id || "default";
    const externalLineItemId = pgId ? `${pgId}:${sku}` : null;
    const stripeLineItemId = (item as any).id || item.metadata?.stripe_line_item_id || null;

    if (!externalLineItemId && !stripeLineItemId) {
      console.warn(`[Order Router] item missing both external_line_item_id key and stripe_line_item_id — skipping update`, { orderId, title: item.title });
      continue;
    }

    let query: string;
    let params: any[];

    if (source === "local" || sourceStatus === 'pending_seller_action') {
      const unit_amount_cents = Math.round(item.price * 100);
      const gross_amount_cents = unit_amount_cents * item.quantity;
      const swypik_commission_cents = Math.round(gross_amount_cents * 0.10);
      const seller_payout_cents = gross_amount_cents - swypik_commission_cents;

      if (!item.metadata) item.metadata = {};
      item.metadata.swypik_commission_cents = swypik_commission_cents;
      item.metadata.seller_payout_cents = seller_payout_cents;

      query = `UPDATE commerce_order_items
         SET source_status = $1,
             metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
         WHERE order_id = $2
           AND (
             external_line_item_id = $3
             OR metadata->>'stripe_line_item_id' = $5
           )`;
      params = [
        sourceStatus,
        orderId,
        externalLineItemId,
        JSON.stringify({ swypik_commission_cents, seller_payout_cents }),
        stripeLineItemId,
      ];
    } else {
      query = `UPDATE commerce_order_items
         SET source_status = $1
         WHERE order_id = $2
           AND (
             external_line_item_id = $3
             OR metadata->>'stripe_line_item_id' = $4
           )`;
      params = [sourceStatus, orderId, externalLineItemId, stripeLineItemId];
    }

    updates.push(dbQuery(query, params));
  }

  try {
    await Promise.all(updates);
  } catch (dbErr) {
    console.error(`[Order Router] Error updating source_status for items`, dbErr);
  }

  let customerName = 'X';
  try {
    const { rows: orderRows } = await dbQuery(
      `SELECT metadata->'shipping_address'->>'name' AS customer_name FROM commerce_orders WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    if (orderRows.length > 0 && orderRows[0].customer_name) {
      customerName = orderRows[0].customer_name;
    }
  } catch (err) {
    console.error(`[Order Router] Error fetching customer name`, err);
  }

  for (const [sellerId, sellerItems] of Object.entries(plan.localSellers)) {
    try {
      const { rows } = await dbQuery(`SELECT email FROM sellers WHERE id = $1 LIMIT 1`, [sellerId]);
      if (rows.length > 0 && rows[0].email) {
        const sellerEmail = rows[0].email;
        log.info({ seller_id: sellerId, order_id: orderId, items_count: sellerItems.length }, "sending new order alert to seller");
        await sendSellerNewOrderAlert(sellerEmail, sellerItems, customerName);
      } else {
        console.warn(`[Order Router] Seller ${sellerId} not found or has no email.`);
      }
    } catch (err) {
      console.error(`[Order Router] Failed to send seller alert for ${sellerId}:`, err);
    }
  }

  return plan;
}
