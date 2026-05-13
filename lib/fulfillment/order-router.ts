import { dbQuery } from "@/lib/db";
import { sendSellerNewOrderAlert } from "@/lib/email/service";

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
  localSellers: Record<string, OrderItem[]>; // Key is seller_id
};

/**
 * routeOrder routes the items from a completed order to the correct suppliers.
 * It separates items into "aliexpress" (dropshipping) and "localSellers" (by seller_id).
 */
export async function routeOrder(orderId: string, items: OrderItem[]): Promise<FulfillmentPlan> {
  const plan: FulfillmentPlan = {
    aliexpress: [],
    localSellers: {},
  };

  const updates: Promise<any>[] = [];

  for (const item of items) {
    // If we have a seller_id in metadata, it goes to that seller.
    const sellerId = item.metadata?.seller_id;
    
    // Defaulting to aliexpress if no seller_id is found (since it's a dropshipping legacy system)
    const source = item.metadata?.source || "aliexpress";

    if (sellerId) {
      if (!plan.localSellers[sellerId]) {
        plan.localSellers[sellerId] = [];
      }
      plan.localSellers[sellerId].push(item);
    } else if (source === "aliexpress") {
      plan.aliexpress.push(item);
    } else {
      // Fallback
      plan.aliexpress.push(item);
    }

    // Prepare DB Query to update commerce_order_items with source_status
    const sourceStatus = sellerId ? 'pending_seller_action' : 'pending_dropship';
    
    let query = `UPDATE commerce_order_items 
         SET source_status = $1 
         WHERE order_id = $2 
           AND (external_line_item_id = $3 OR title = $4)`;
    let params: any[] = [sourceStatus, orderId, (item as any).id || null, item.title || (item as any).name];

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
             metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb
         WHERE order_id = $2 
           AND (external_line_item_id = $3 OR title = $4)`;
      params.push(JSON.stringify({ swypik_commission_cents, seller_payout_cents }));
    }

    updates.push(
      dbQuery(query, params)
    );
  }

  // Execute all DB updates concurrently to prevent blocking N+1 query bottleneck
  try {
    await Promise.all(updates);
  } catch (dbErr) {
    console.error(`[Order Router] Error updating source_status for items`, dbErr);
  }

  // Fetch customer name for the email
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

  // 3. Send email to local sellers
  for (const [sellerId, sellerItems] of Object.entries(plan.localSellers)) {
    try {
      const { rows } = await dbQuery(`SELECT email FROM sellers WHERE id = $1 LIMIT 1`, [sellerId]);
      if (rows.length > 0 && rows[0].email) {
        const sellerEmail = rows[0].email;
        if (process.env.NODE_ENV !== 'production') {
           console.log(`[Order Router] 📧 [Dev] Would send new order alert to seller ${sellerEmail} for order ${orderId} (${sellerItems.length} items, client: ${customerName})`);
        }
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
