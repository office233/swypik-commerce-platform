/**
 * Tranzițiile de comandă declanșate de seller (în afară de expediere, care are
 * propriul formular AWB → /api/seller/orders/[id]/awb):
 *   accept  — seller-ul confirmă că pregătește coletul;
 *   deliver — seller-ul confirmă livrarea (curier fără webhook de tracking);
 *   cancel  — anulare înainte de expediere + refund Stripe + stoc înapoi.
 * Validarea trece prin mașina de stări din lib/seller/fulfilment.ts.
 */
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { nextSellerOrderState, type SellerOrderState } from "./fulfilment";
import { getSellerOrder } from "./orders";
import { applySellerRefund, createSellerStripeRefund } from "./order-refund";

export type DirectSellerAction = "accept" | "deliver" | "cancel";

export type SellerActionResult =
  | { ok: true; state: SellerOrderState; refundId?: string }
  | { ok: false; code: "not_found" | "invalid_transition" | "missing_payment_intent" | "stripe_refund_failed"; stripeCode?: string };

async function accept(orderId: string, sellerId: string): Promise<void> {
  await dbQuery(
    `UPDATE commerce_order_items
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('seller_accepted_at', NOW()::text)
      WHERE order_id = $1::uuid AND metadata->>'seller_id' = $2 AND source_status NOT IN ('fulfilled', 'cancelled')`,
    [orderId, sellerId],
  );
}

async function deliver(orderId: string, sellerId: string): Promise<void> {
  await dbQuery(
    `UPDATE commerce_order_items
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('delivered_at', NOW()::text)
      WHERE order_id = $1::uuid AND metadata->>'seller_id' = $2 AND source_status = 'fulfilled'
        AND NOT (metadata ? 'delivered_at')`,
    [orderId, sellerId],
  );
  // Comanda devine „delivered” doar când toate item-urile (tuturor seller-ilor) au ajuns.
  await dbQuery(
    `UPDATE commerce_orders SET status = 'delivered', updated_at = now()
      WHERE id = $1::uuid AND status = 'fulfilled'
        AND NOT EXISTS (
          SELECT 1 FROM commerce_order_items i
           WHERE i.order_id = $1::uuid AND i.source_status <> 'cancelled' AND NOT (i.metadata ? 'delivered_at'))`,
    [orderId],
  );
}

async function cancel(orderId: string, sellerId: string): Promise<SellerActionResult> {
  const { rows } = await dbQuery<{ pi: string | null; others: string | number; seller_open_cents: string | number }>(
    `SELECT co.metadata->>'stripe_payment_intent' AS pi,
            COUNT(*) FILTER (WHERE i.source_status <> 'cancelled' AND i.metadata->>'seller_id' IS DISTINCT FROM $2)::int AS others,
            COALESCE(SUM(i.quantity * i.unit_amount_cents) FILTER (
              WHERE i.metadata->>'seller_id' = $2 AND i.source_status NOT IN ('fulfilled', 'cancelled')), 0)::int AS seller_open_cents
       FROM commerce_orders co JOIN commerce_order_items i ON i.order_id = co.id
      WHERE co.id = $1::uuid
      GROUP BY co.id`,
    [orderId, sellerId],
  );
  const row = rows[0];
  if (!row) return { ok: false, code: "not_found" };
  if (!row.pi) return { ok: false, code: "missing_payment_intent" };
  // Singurul seller rămas → refund total (inclusiv transportul); altfel doar item-urile lui.
  const amountCents = Number(row.others) === 0 ? null : Number(row.seller_open_cents);
  const refund = await createSellerStripeRefund({ orderId, sellerId, paymentIntentId: row.pi, amountCents, mode: "cancel" });
  if (!refund.ok) return { ok: false, code: "stripe_refund_failed", stripeCode: refund.code };
  await applySellerRefund({ orderId, sellerId, paymentIntentId: row.pi, mode: "cancel", refund });
  return { ok: true, state: "cancelled", refundId: refund.refundId };
}

export async function runSellerOrderAction(
  sellerId: string,
  orderId: string,
  action: DirectSellerAction,
): Promise<SellerActionResult> {
  const order = await getSellerOrder(sellerId, orderId);
  if (!order) return { ok: false, code: "not_found" };
  const transition = nextSellerOrderState(order.state, action);
  if (!transition.ok) return { ok: false, code: "invalid_transition" };

  if (action === "cancel") {
    const res = await cancel(orderId, sellerId);
    logger.info({ orderId, sellerId, ok: res.ok }, "[seller/orders] cancel");
    return res;
  }
  if (action === "accept") await accept(orderId, sellerId);
  else await deliver(orderId, sellerId);
  logger.info({ orderId, sellerId, action }, "[seller/orders] transition");
  return { ok: true, state: transition.next };
}
