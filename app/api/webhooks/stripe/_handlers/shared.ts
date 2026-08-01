import { dbQuery } from "@/lib/db";
import { sendOrderConfirmation } from "@/lib/email/service";
import { refundSwypForUnpaidOrder } from "@/lib/swyp/refund";
import { logger } from "@/lib/logger";

/**
 * SWYP: intent mort (canceled / expired / async payment failed) → găsește
 * comenzile neplătite cu parte SWYP debitată și recreditează integral.
 * Idempotent după (swyp_refund_intent, <obj_id>) în ledger.
 */
export async function reclaimSwypForDeadIntent(objId: string, eventType: string) {
  const { rows } = await dbQuery<{ id: string }>(
    `SELECT id FROM commerce_orders
      WHERE (metadata->>'paymentIntentId' = $1
             OR metadata->>'payment_intent_id' = $1
             OR metadata->>'sessionId' = $1
             OR metadata->>'stripe_session_id' = $1
             OR metadata->>'stripe_payment_intent' = $1)
        AND status IN ('pending', 'cancelled', 'failed')
        AND COALESCE(swyp_paid_cents, 0) > 0
        AND metadata->>'swyp_refunded_at' IS NULL`,
    [objId]
  );
  for (const row of rows) {
    const res = await refundSwypForUnpaidOrder({
      orderId: row.id,
      refType: "swyp_refund_intent",
      refId: objId,
      reason: eventType,
    });
    if (res.credited) {
      logger.info(`[Stripe Webhook] SWYP reclaimed for unpaid order ${row.id} (${eventType}, ${objId})`);
    }
  }
}

export async function maybeSendOrderConfirmation(orderId: string) {
  const { rows: orderRows } = await dbQuery(
    `SELECT id, metadata, total_cents
     FROM commerce_orders
     WHERE id = $1
     LIMIT 1`,
    [orderId]
  );
  if (orderRows.length === 0) return;

  const order = orderRows[0];
  const metadata = order.metadata || {};
  const customerEmail = metadata.customer_email;
  if (!customerEmail || metadata.confirmation_email_sent_at) return;

  const { rows: itemRows } = await dbQuery(
    `SELECT title, quantity, (unit_amount_cents::numeric / 100) AS price
     FROM commerce_order_items
     WHERE order_id = $1`,
    [orderId]
  );

  const sent = await sendOrderConfirmation({
    orderId,
    orderLookupToken: metadata.order_lookup_token,
    customerEmail,
    customerName: metadata.shipping_address?.name || "",
    items: (itemRows as Array<{ title: string; quantity: number; price: string }>).map((r) => ({ title: r.title, quantity: r.quantity, price: Number(r.price) })),
    totalRon: Number(order.total_cents || 0) / 100,
    shippingAddress: metadata.shipping_address || undefined,
  });

  if (sent) {
    await dbQuery(
      `UPDATE commerce_orders
       SET metadata = metadata || jsonb_build_object('confirmation_email_sent_at', now()::text)
       WHERE id = $1`,
      [orderId]
    );
  }
}
