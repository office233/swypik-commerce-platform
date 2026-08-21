import type Stripe from "stripe";
import { dbQuery } from "@/lib/db";
import { sendRefundEmail } from "@/lib/email/service";
import { refundSwypForRefundedCharge } from "@/lib/swyp/refund";
import { logger } from "@/lib/logger";
import { onPaymentRefunded } from "@/lib/swyp/hooks";
import { reclaimSwypForDeadIntent } from "./shared";

export async function handleChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (pi) {
    await dbQuery(
      "UPDATE commerce_orders SET status = 'refunded' WHERE metadata->>'paymentIntentId' = $1 OR metadata->>'payment_intent_id' = $1 OR metadata->>'stripe_payment_intent' = $1",
      [pi]
    );

    // Anulează itemele nelivrate la refund. ('pending_dropship' rămâne
    // în filtru doar pentru rânduri istorice — fluxul dropship a fost eliminat.)
    await dbQuery(
      `UPDATE commerce_order_items coi
       SET
         source_status = CASE
           WHEN coi.source_status IN ('pending', 'pending_dropship', 'pending_seller_action')
             THEN 'cancelled'
           ELSE coi.source_status
         END,
         metadata = coi.metadata || jsonb_build_object(
           'refund_event_id', $2::text,
           'refunded_at', now()::text,
           'refund_amount_cents', $3::int
         )
       FROM commerce_orders co
       WHERE coi.order_id = co.id
         AND (co.metadata->>'paymentIntentId' = $1
              OR co.metadata->>'payment_intent_id' = $1
              OR co.metadata->>'stripe_payment_intent' = $1)`,
      [pi, event.id, charge.amount_refunded || 0]
    );

    // SWYP: revocă recompensele acordate pentru plata refundată.
    await onPaymentRefunded(pi);

    // SWYP: recreditează partea plătită efectiv în SWYP la comenzile
    // hibride, proporțional cu partea de card refundată. Idempotent
    // după ref (swyp_refund_charge:<charge_id>:<amount_refunded>);
    // aruncă la eroare → Stripe reîncearcă eventul.
    {
      const { rows: swypOrders } = await dbQuery<{ id: string; swyp_paid_cents: number }>(
        `SELECT id, COALESCE(swyp_paid_cents, 0)::int AS swyp_paid_cents
           FROM commerce_orders
          WHERE (metadata->>'paymentIntentId' = $1
                 OR metadata->>'payment_intent_id' = $1
                 OR metadata->>'stripe_payment_intent' = $1)
            AND COALESCE(swyp_paid_cents, 0) > 0`,
        [pi]
      );
      for (const so of swypOrders) {
        const res = await refundSwypForRefundedCharge({
          orderId: so.id,
          chargeId: charge.id,
          amountRefunded: charge.amount_refunded || 0,
          amountTotal: charge.amount || 0,
        });
        if (res.credited) {
          logger.info(
            `[Stripe Webhook] SWYP refunded for hybrid order ${so.id}: ${res.units} units / ${res.cents} cents (charge ${charge.id})`
          );
        }
      }
    }

    try {
      const { rows: oRows } = await dbQuery<{ id: string; currency: string; total_cents: number; customer_email: string | null; user_email: string | null }>(
        `SELECT co.id, co.currency, co.total_cents,
                (co.metadata->>'customer_email') AS customer_email,
                u.email AS user_email
           FROM commerce_orders co
           LEFT JOIN users u ON u.id = co.buyer_user_id
          WHERE co.metadata->>'paymentIntentId' = $1
             OR co.metadata->>'payment_intent_id' = $1
             OR co.metadata->>'stripe_payment_intent' = $1
          LIMIT 1`,
        [pi]
      );
      const order = oRows[0];
      if (order) {
        const toEmail = order.customer_email || order.user_email;
        const amountCents = typeof charge.amount_refunded === "number" && charge.amount_refunded > 0
          ? charge.amount_refunded
          : (order.total_cents || 0);
        if (toEmail) {
          await sendRefundEmail(toEmail, order.id, amountCents, order.currency || "RON").catch((err) =>
            console.warn("[refund-email]", err?.message || err)
          );
        }
      }
    } catch (err) {
      console.warn("[refund-email] lookup failed:", (err as Error).message);
    }
  }
}

export async function handleIntentDead(event: Stripe.Event) {
  // `event.data.object` e o uniune peste toate obiectele Stripe. Toate au `id`,
  // dar TypeScript nu poate demonstra asta pe o uniune atât de largă. Îngustăm
  // la exact ce citim, în loc să dezactivăm verificarea cu `as any`.
  const objId = (event.data.object as { id: string }).id;
  await dbQuery(
    "UPDATE commerce_orders SET status='cancelled', metadata = metadata || jsonb_build_object('cancelled_at', NOW()::text, 'cancelled_event', $2::text) WHERE metadata->>'paymentIntentId' = $1 OR metadata->>'payment_intent_id' = $1 OR metadata->>'sessionId' = $1 OR metadata->>'stripe_session_id' = $1 OR metadata->>'stripe_payment_intent' = $1",
    [objId, event.type]
  );
  // Anulează itemele încă neprocesate ale comenzii anulate.
  await dbQuery(
    `UPDATE commerce_order_items coi
     SET source_status = 'cancelled',
         metadata = coi.metadata || jsonb_build_object('cancelled_event', $2::text, 'cancelled_at', NOW()::text)
     FROM commerce_orders co
     WHERE coi.order_id = co.id
       AND coi.source_status IN ('pending', 'pending_dropship', 'pending_seller_action')
       AND (co.metadata->>'paymentIntentId' = $1
            OR co.metadata->>'payment_intent_id' = $1
            OR co.metadata->>'sessionId' = $1
            OR co.metadata->>'stripe_session_id' = $1
            OR co.metadata->>'stripe_payment_intent' = $1)`,
    [objId, event.type]
  );
  // SWYP: intentul nu se mai poate plăti niciodată → recreditează
  // integral partea debitată la create-intent. Idempotent după
  // (swyp_refund_intent, <obj_id>).
  await reclaimSwypForDeadIntent(objId, event.type);
}
