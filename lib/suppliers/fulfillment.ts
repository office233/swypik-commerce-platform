/**
 * Swypik Fulfillment Engine
 * Processes paid orders → places them with suppliers (AliExpress / manual)
 * Updates order status and tracking information
 */

import { dbQuery } from "@/lib/db";
import { sendShippingNotification } from "@/lib/email/service";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "fulfillment" });

export interface FulfillmentResult {
  success: boolean;
  orderId: string;
  supplierOrderId?: string;
  supplierOrders?: { id: string; supplier: string; supplierOrderId?: string; status: string }[];
  trackingNumber?: string;
  trackingUrl?: string;
  error?: string;
}

type SupplierRecord = {
  id: string;
  supplier: string;
  supplier_order_id?: string | null;
  status: string;
};

type EnrichedItem = {
  id: string;
  title: string;
  quantity: number;
  item_metadata?: Record<string, unknown> | null;
  aeProductId: string | null;
  supplier: "aliexpress" | "unknown";
  externalVariantId?: string | null;
  supplierError?: string | null;
};

/**
 * Determine which supplier to use for a given product
 * Based on ae_product_id prefix or source metadata
 */
function detectSupplier(aeProductId: string, metadata?: Record<string, unknown> | null): "aliexpress" | "unknown" {
  if (metadata?.source === "aliexpress") return "aliexpress";
  // AliExpress IDs are long numeric
  if (/^\d{10,}$/.test(aeProductId)) return "aliexpress";
  return "unknown";
}

async function upsertSupplierOrder(params: {
  commerceOrderId: string;
  supplier: "aliexpress" | "manual" | "other";
  source: "aliexpress" | "unknown";
  supplierOrderId?: string | null;
  status: "pending" | "submitted" | "failed";
  metadata: Record<string, unknown>;
}): Promise<SupplierRecord> {
  if (params.supplierOrderId) {
    const { rows } = await dbQuery(
      `INSERT INTO supplier_orders (
        commerce_order_id, supplier, supplier_order_id, status, metadata, submitted_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, CASE WHEN $4 = 'submitted' THEN now() ELSE NULL END)
      ON CONFLICT (supplier, supplier_order_id) WHERE supplier_order_id IS NOT NULL
      DO UPDATE SET
        commerce_order_id = EXCLUDED.commerce_order_id,
        status = EXCLUDED.status,
        metadata = supplier_orders.metadata || EXCLUDED.metadata,
        submitted_at = COALESCE(supplier_orders.submitted_at, EXCLUDED.submitted_at),
        updated_at = now()
      RETURNING id, supplier, supplier_order_id, status`,
      [
        params.commerceOrderId,
        params.supplier,
        params.supplierOrderId,
        params.status,
        JSON.stringify({ ...params.metadata, source: params.source }),
      ]
    );
    return rows[0];
  }

  const { rows: existing } = await dbQuery(
    `SELECT id, supplier, supplier_order_id, status
     FROM supplier_orders
     WHERE commerce_order_id = $1
       AND supplier = $2
       AND supplier_order_id IS NULL
       AND metadata->>'source' = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [params.commerceOrderId, params.supplier, params.source]
  );

  if (existing.length > 0) {
    const { rows } = await dbQuery(
      `UPDATE supplier_orders
       SET status = $1,
           metadata = metadata || $2::jsonb,
           updated_at = now()
       WHERE id = $3
       RETURNING id, supplier, supplier_order_id, status`,
      [
        params.status,
        JSON.stringify({ ...params.metadata, source: params.source }),
        existing[0].id,
      ]
    );
    return rows[0];
  }

  const { rows } = await dbQuery(
    `INSERT INTO supplier_orders (commerce_order_id, supplier, status, metadata)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, supplier, supplier_order_id, status`,
    [
      params.commerceOrderId,
      params.supplier,
      params.status,
      JSON.stringify({ ...params.metadata, source: params.source }),
    ]
  );
  return rows[0];
}

async function persistSupplierOrderItems(supplierOrderDbId: string, items: EnrichedItem[]) {
  for (const item of items) {
    await dbQuery(
      `INSERT INTO supplier_order_items (
        supplier_order_id, commerce_order_item_id, external_product_id,
        external_variant_id, title, quantity, metadata
      )
      SELECT $1, $2, $3, $4, $5, $6, $7::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM supplier_order_items
        WHERE supplier_order_id = $1 AND commerce_order_item_id = $2
      )`,
      [
        supplierOrderDbId,
        item.id,
        item.aeProductId,
        item.externalVariantId || null,
        item.title,
        item.quantity,
        JSON.stringify({
          source_supplier: item.supplier,
          fulfillment_error: item.supplierError || null,
          item_metadata: item.item_metadata || {},
        }),
      ]
    );
  }
}

/**
 * Fulfill a single order
 * 1. Loads order + items from DB
 * 2. Resolves supplier for each item
 * 3. Places order with supplier API
 * 4. Updates order status in DB
 */
export async function fulfillOrder(orderId: string): Promise<FulfillmentResult> {
  log.info({ order_id: orderId }, "starting fulfillment");

  // 1. Load order
  const { rows: orderRows } = await dbQuery(
    `SELECT id, status, metadata FROM commerce_orders WHERE id = $1`,
    [orderId]
  );

  if (orderRows.length === 0) {
    return { success: false, orderId, error: "Order not found" };
  }

  const order = orderRows[0];
  if (order.status !== "paid") {
    return { success: false, orderId, error: `Order status is '${order.status}', expected 'paid'` };
  }

  const meta = order.metadata || {};
  const shipping = meta.shipping_address || {};
  if (!shipping.line1 || !shipping.city) {
    return { success: false, orderId, error: "Missing shipping address" };
  }

  // 2. Mark as processing
  await dbQuery(
    `UPDATE commerce_orders SET metadata = metadata || '{"fulfillment_status": "processing"}'::jsonb WHERE id = $1`,
    [orderId]
  );

  // 3. Load item details from DB to get ae_product_id
  const { rows: orderItems } = await dbQuery(
    `SELECT oi.id, oi.title, oi.quantity, oi.metadata as item_metadata
     FROM commerce_order_items oi WHERE oi.order_id = $1`,
    [orderId]
  );

  // Resolve ae_product_id for each item
  const enrichedItems: EnrichedItem[] = [];
  for (const item of orderItems) {
    const pgId = item.item_metadata?.pg_id || null;
    let aeProductId = item.item_metadata?.ae_product_id || null;

    // Look up ae_product_id from the products table if not in metadata
    if (!aeProductId && pgId) {
      const { rows } = await dbQuery(
        `SELECT ae_product_id FROM ae_products WHERE id = $1`,
        [pgId]
      );
      if (rows.length > 0) aeProductId = rows[0].ae_product_id;
    }

    // Also try matching by title if no IDs
    if (!aeProductId && !pgId) {
      const { rows } = await dbQuery(
        `SELECT id, ae_product_id FROM ae_products WHERE title ILIKE $1 LIMIT 1`,
        [`%${item.title.substring(0, 40)}%`]
      );
      if (rows.length > 0) aeProductId = rows[0].ae_product_id;
    }

    enrichedItems.push({
      ...item,
      aeProductId: aeProductId ? String(aeProductId) : null,
      supplier: aeProductId ? detectSupplier(String(aeProductId), item.item_metadata) : "unknown",
    });
  }

  // 4. Group items by supplier
  const aeItems = enrichedItems.filter(i => i.supplier === "aliexpress");
  const unknownItems = enrichedItems.filter(i => i.supplier === "unknown");

  let supplierOrderId: string | undefined;
  let supplierError: string | undefined;
  const supplierOrders: SupplierRecord[] = [];

  // 5. AliExpress items → manual fulfillment note
  // AliExpress doesn't have a direct order API via RapidAPI,
  // so we log them for manual processing
  if (aeItems.length > 0) {
    const aeLinks = aeItems
      .filter(i => i.aeProductId)
      .map(i => `https://www.aliexpress.com/item/${i.aeProductId}.html`);

    const supplierOrder = await upsertSupplierOrder({
      commerceOrderId: orderId,
      supplier: "aliexpress",
      source: "aliexpress",
      status: "pending",
      metadata: {
        aliexpress_links: aeLinks,
        fulfillment_note: `Manual AliExpress order needed for ${aeItems.length} item(s)`,
      },
    });
    await persistSupplierOrderItems(supplierOrder.id, aeItems);
    supplierOrders.push(supplierOrder);

    await dbQuery(
      `UPDATE commerce_orders SET metadata = metadata || $1::jsonb WHERE id = $2`,
      [JSON.stringify({
        aliexpress_links: aeLinks,
        fulfillment_note: `Manual AliExpress order needed for ${aeItems.length} item(s)`,
      }), orderId]
    );
  }

  if (unknownItems.length > 0) {
    const supplierOrder = await upsertSupplierOrder({
      commerceOrderId: orderId,
      supplier: "manual",
      source: "unknown",
      status: "pending",
      metadata: {
        fulfillment_note: `Manual supplier resolution needed for ${unknownItems.length} item(s)`,
      },
    });
    await persistSupplierOrderItems(supplierOrder.id, unknownItems);
    supplierOrders.push(supplierOrder);
  }

  // 7. Keep commerce order paid until tracking exists.
  const hasManualItems = aeItems.length > 0 || unknownItems.length > 0;
  const hasSubmittedItems = supplierOrders.some(o => o.status === "submitted");
  const fulfillmentStatus = hasManualItems ? "manual_required" : hasSubmittedItems ? "submitted" : "processing";

  await dbQuery(
    `UPDATE commerce_orders 
     SET metadata = metadata || $1::jsonb
     WHERE id = $2`,
    [
      JSON.stringify({
        fulfillment_status: fulfillmentStatus,
        supplier_order_id: supplierOrderId || null,
        fulfillment_error: supplierError || null,
        supplier_orders: supplierOrders.map(o => ({
          id: o.id,
          supplier: o.supplier,
          supplier_order_id: o.supplier_order_id || null,
          status: o.status,
        })),
      }),
      orderId,
    ]
  );

  if (supplierError) {
    log.error({ order_id: orderId, supplier_error: supplierError }, "order supplier error");
  }

  return {
    success: !!supplierOrderId || unknownItems.length > 0 || aeItems.length > 0,
    orderId,
    supplierOrderId,
    supplierOrders: supplierOrders.map(o => ({
      id: o.id,
      supplier: o.supplier,
      supplierOrderId: o.supplier_order_id || undefined,
      status: o.status,
    })),
    error: supplierError,
  };
}

/**
 * Update tracking info for an order
 */
export async function updateOrderTracking(
  orderId: string,
  trackingNumber: string,
  trackingUrl?: string
): Promise<boolean> {
  try {
    const finalTrackingUrl = trackingUrl || `https://track24.net/?code=${trackingNumber}`;
    const { rows: supplierOrderRows } = await dbQuery(
      `SELECT id
       FROM supplier_orders
       WHERE commerce_order_id = $1
         AND status IN ('submitted', 'accepted', 'processing', 'pending')
       ORDER BY CASE status
         WHEN 'submitted' THEN 0
         WHEN 'accepted' THEN 1
         WHEN 'processing' THEN 2
         ELSE 3
       END, submitted_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [orderId]
    );
    const supplierOrderDbId = supplierOrderRows[0]?.id || null;

    const { rows: shipmentRows } = await dbQuery(
      `WITH existing AS (
        SELECT id FROM fulfillment_shipments
        WHERE commerce_order_id = $1 AND tracking_number = $2
        ORDER BY created_at DESC
        LIMIT 1
      ), inserted AS (
        INSERT INTO fulfillment_shipments (
          commerce_order_id, supplier_order_id, tracking_number,
          tracking_url, status, shipped_at, metadata
        )
        SELECT $1, $3, $2, $4, 'in_transit', now(), $5::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        RETURNING id
      )
      SELECT id FROM inserted
      UNION ALL
      SELECT id FROM existing
      LIMIT 1`,
      [
        orderId,
        trackingNumber,
        supplierOrderDbId,
        finalTrackingUrl,
        JSON.stringify({ source: "admin" }),
      ]
    );
    const shipmentId = shipmentRows[0]?.id;

    if (shipmentId) {
      await dbQuery(
        `INSERT INTO tracking_events (shipment_id, status, message, occurred_at, metadata)
         SELECT $1, 'in_transit', 'Tracking number added', now(), $2::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM tracking_events
           WHERE shipment_id = $1 AND status = 'in_transit' AND message = 'Tracking number added'
         )`,
        [shipmentId, JSON.stringify({ tracking_number: trackingNumber, tracking_url: finalTrackingUrl })]
      );
    }

    await dbQuery(
      `UPDATE supplier_orders
       SET status = 'shipped', updated_at = now()
       WHERE commerce_order_id = $1
         AND ($2::uuid IS NULL OR id = $2::uuid)`,
      [orderId, supplierOrderDbId]
    );

    await dbQuery(
      `UPDATE commerce_orders 
       SET metadata = metadata || $1::jsonb,
           status = 'fulfilled',
           fulfilled_at = COALESCE(fulfilled_at, now())
       WHERE id = $2`,
      [
        JSON.stringify({
          tracking_number: trackingNumber,
          tracking_url: finalTrackingUrl,
          fulfillment_status: "shipped",
        }),
        orderId,
      ]
    );
    log.info({ order_id: orderId, tracking_number: trackingNumber }, "tracking updated");

    // Send shipping notification email (non-blocking)
    const { rows: orderRows } = await dbQuery(
      `SELECT metadata, (total_cents::numeric / 100) AS total_ron FROM commerce_orders WHERE id = $1`,
      [orderId]
    );
    if (orderRows.length > 0) {
      const meta = orderRows[0].metadata || {};
      const email = meta.customer_email;
      if (email) {
        const { rows: items } = await dbQuery(
          `SELECT title, quantity, (unit_amount_cents::numeric / 100) AS price FROM commerce_order_items WHERE order_id = $1`,
          [orderId]
        );
        type ShipItemRow = { title: string; quantity: number; price: string | number };
        sendShippingNotification({
          orderId,
          orderLookupToken: meta.order_lookup_token,
          customerEmail: email,
          customerName: meta.shipping_address?.name || "",
          items: (items as ShipItemRow[]).map((r) => ({ title: r.title, quantity: r.quantity, price: Number(r.price) })),
          totalRon: Number(orderRows[0].total_ron),
          trackingNumber,
          trackingUrl: finalTrackingUrl,
        }).catch((err: unknown) => log.error({ err, order_id: orderId }, "shipping email send failed"));
      }
    }

    return true;
  } catch (err) {
    log.error({ err, order_id: orderId }, "tracking update failed");
    return false;
  }
}

/**
 * Cancel an order and issue a Stripe refund
 */
export async function cancelOrder(orderId: string, reason?: string): Promise<boolean> {
  try {
    // 1. Load order to get stripe_payment_intent
    const { rows } = await dbQuery(
      `SELECT metadata FROM commerce_orders WHERE id = $1`,
      [orderId]
    );
    if (rows.length === 0) return false;

    const meta = rows[0].metadata || {};
    const paymentIntentId = meta.stripe_payment_intent;
    let refundId: string | null = null;
    let refundError: string | null = null;
    let refundAmountCents = 0;

    // 2. Attempt Stripe refund if we have a payment intent
    if (paymentIntentId) {
      try {
        const { getStripe } = await import("@/lib/stripe/checkout");
        const stripe = getStripe();
        const refund = await stripe.refunds.create({
          payment_intent: paymentIntentId,
          reason: "requested_by_customer",
        });
        refundId = refund.id;
        refundAmountCents = refund.amount || 0;
        log.info({ refund_id: refundId, amount_cents: refundAmountCents, intent_id: paymentIntentId }, "stripe refund created");
      } catch (stripeErr) {
        refundError = (stripeErr as Error).message;
        log.error({ err: stripeErr, intent_id: paymentIntentId }, "stripe refund failed");
        // We still cancel the order in our DB even if Stripe refund fails
      }
    }

    // 3. Update order in DB
    await dbQuery(
      `UPDATE commerce_orders 
       SET status = 'cancelled', 
           cancelled_at = now(),
           metadata = metadata || $1::jsonb
       WHERE id = $2`,
      [
        JSON.stringify({
          fulfillment_status: "cancelled",
          cancellation_reason: reason || "Admin cancelled",
          cancelled_at: new Date().toISOString(),
          refund_id: refundId,
          refund_error: refundError,
        }),
        orderId,
      ]
    );

    // 4. Record refund transaction if successful
    if (refundId && paymentIntentId) {
      await dbQuery(
        `INSERT INTO payment_transactions (
          order_id, provider, provider_payment_id, transaction_type,
          status, currency, amount_cents, processed_at, metadata
        ) VALUES ($1, 'stripe', $2, 'refund', 'succeeded', 'ron', $3, now(), $4::jsonb)
        ON CONFLICT (provider, provider_payment_id, transaction_type) DO NOTHING`,
        [
          orderId,
          refundId,
          refundAmountCents,
          JSON.stringify({ payment_intent: paymentIntentId, reason: reason || "Admin cancelled" }),
        ]
      );
    }

    return true;
  } catch (err) {
    log.error({ err, order_id: orderId }, "cancel failed");
    return false;
  }
}
