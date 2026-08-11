/**
 * Seller Refund API
 * POST /api/seller/orders/[id]/refund
 *
 * Allows a seller to approve a return request and execute a full Stripe refund
 * only when that seller owns every item in the order. Multi-seller refunds are
 * blocked for admin handling because Stripe PaymentIntent refunds are order-wide.
 */

import { NextResponse } from "next/server";
import { dbQuery, withTransaction } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { getStripe } from "@/lib/stripe/checkout";
import { evaluateSellerRefundRequest } from "@/lib/seller/refund-policy";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/security/rate-limit";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

function statusForPolicyCode(code: string): number {
  switch (code) {
    case "order_not_owned":
      return 404;
    case "invalid_status":
      return 422;
    case "multi_seller_requires_admin":
    case "missing_payment_intent":
      return 409;
    default:
      return 400;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isEnabled("returns")) return frozenResponse("returns");
  const { id } = await params;
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json(
        { success: false, error: "Neautorizat. Conecteaza-te ca seller." },
        { status: 401 }
      );
    }

    const rl = await rateLimit("sellerRefund", sellerId);
    if (!rl.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

    const orderId = id;
    const { rows: orderRows } = await dbQuery(
      `SELECT
         co.id,
         co.status,
         co.metadata,
         COUNT(coi.id)::int AS total_items,
         COUNT(coi.id) FILTER (WHERE coi.metadata->>'seller_id' = $2)::int AS seller_items
       FROM commerce_orders co
       JOIN commerce_order_items coi ON co.id = coi.order_id
       WHERE co.id = $1::uuid
       GROUP BY co.id, co.status, co.metadata
       LIMIT 1`,
      [orderId, sellerId]
    );

    if (orderRows.length === 0 || Number(orderRows[0].seller_items || 0) < 1) {
      return NextResponse.json(
        { success: false, error: "Comanda nu a fost gasita sau nu iti apartine." },
        { status: 404 }
      );
    }

    const order = orderRows[0];
    const paymentIntentId = order.metadata?.stripe_payment_intent;
    const existingRefundId = order.metadata?.refund_id || null;
    const policy = evaluateSellerRefundRequest({
      orderStatus: order.status,
      totalItems: Number(order.total_items || 0),
      sellerItems: Number(order.seller_items || 0),
      paymentIntentId,
      existingRefundId,
    });

    if (!policy.allowed) {
      if (policy.code === "already_refunded") {
        return NextResponse.json({ success: true, alreadyRefunded: true, refundId: existingRefundId });
      }

      return NextResponse.json(
        { success: false, error: policy.message, code: policy.code },
        { status: statusForPolicyCode(policy.code) }
      );
    }

    let refundId = "";
    let refundStatus = "pending";
    let refundAmountCents = 0;
    let refundCurrency = "RON";

    try {
      const stripe = getStripe();
      const refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          metadata: {
            order_id: orderId,
            seller_id: sellerId,
            reason: "seller_approved_return",
          },
        },
        {
          idempotencyKey: `seller-refund-${orderId}`,
        }
      );

      refundId = refund.id;
      refundStatus = refund.status || "pending";
      refundAmountCents = refund.amount || 0;
      refundCurrency = String(refund.currency || "ron").toUpperCase();
    } catch (stripeError: any) {
      logger.error({ err: stripeError }, "[Seller Refund] Stripe refund error:");
      // 2026-08-11 (audit P1): nu expunem mesajul brut Stripe la client —
      // poate conține detalii interne (ID-uri, chei, structura contului).
      // Trimitem doar un cod sigur; detaliile complete rămân în loguri.
      const safeCode =
        typeof stripeError?.code === "string" ? stripeError.code : "stripe_error";
      return NextResponse.json(
        {
          success: false,
          error: "Restituirea nu a putut fi procesată. Încearcă din nou sau contactează suportul.",
          code: safeCode,
        },
        { status: 502 }
      );
    }

    // Banii au plecat deja de la Stripe. Toate consecințele în DB trebuie să
    // fie atomice: dacă una eșuează la jumătate, comanda rămâne într-o stare
    // hibridă (refundată la Stripe, dar plătibilă în continuare de cronul de
    // payout). Un singur BEGIN/COMMIT pentru tot.
    const { sellerClawback, creatorClawback } = await withTransaction(async (q) => {
      await q(
        `UPDATE commerce_orders
       SET status = 'refunded',
           metadata = metadata || jsonb_build_object(
             'refunded_at', NOW()::text,
             'refunded_by_seller', $2::text,
             'refund_id', $3::text,
             'refund_status', $4::text,
             'return_status', 'refunded'
           )
       WHERE id = $1::uuid`,
        [orderId, sellerId, refundId, refundStatus]
      );

      // Stamp refund metadata on every item belonging to this seller (informational).
      await q(
        `UPDATE commerce_order_items
         SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'refund_id', $3::text,
               'refund_status', $4::text
             )
       WHERE order_id = $1::uuid
         AND metadata->>'seller_id' = $2`,
        [orderId, sellerId, refundId, refundStatus]
      );

      // SELLER payout state lives in metadata->>'seller_payout_status'.
      // Items already 'paid' must NOT be flipped to 'refunded' (the Stripe transfer
      // already moved money). Flag them for manual clawback and emit a structured
      // log line so ops can pick it up from `docker logs`.
      const { rows: sellerClawback } = await q<{
        id: string;
        amount_cents: number | null;
        transfer_id: string | null;
      }>(
        `UPDATE commerce_order_items
         SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'refunded_after_seller_payout', true,
               'refunded_after_seller_payout_at', NOW()::text,
               'refund_id', $3::text
             )
       WHERE order_id = $1::uuid
         AND metadata->>'seller_id' = $2
         AND metadata->>'seller_payout_status' = 'paid'
       RETURNING id,
                 NULLIF(metadata->>'seller_payout_cents','')::int AS amount_cents,
                 metadata->>'seller_transfer_id' AS transfer_id`,
        [orderId, sellerId, refundId]
      );
      // Items not yet paid out to the seller: safe to mark as refunded so the
      // payout cron skips them even before the order-status guard kicks in.
      await q(
        `UPDATE commerce_order_items
         SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'seller_payout_status', 'refunded',
               'seller_payout_refunded_at', NOW()::text
             )
       WHERE order_id = $1::uuid
         AND metadata->>'seller_id' = $2
         AND (
           metadata->>'seller_payout_status' IS NULL
           OR metadata->>'seller_payout_status' IN ('pending','no_account','restricted','failed')
         )`,
        [orderId, sellerId]
      );

      // CREATOR payout state lives in the dedicated `payout_status` column
      // (see migration 20260514_0003_order_item_payout_status_check.sql).
      // Same rule: don't overwrite 'paid' - flag for manual clawback.
      const { rows: creatorClawback } = await q<{
        id: string;
        amount_cents: number | null;
        transfer_id: string | null;
        creator_id: string | null;
      }>(
        `UPDATE commerce_order_items
         SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'refunded_after_creator_payout', true,
               'refunded_after_creator_payout_at', NOW()::text
             )
       WHERE order_id = $1::uuid
         AND metadata->>'seller_id' = $2
         AND payout_status = 'paid'
         AND creator_id IS NOT NULL
       RETURNING id,
                 commissionable_amount_cents AS amount_cents,
                 metadata->>'creator_transfer_id' AS transfer_id,
                 creator_id::text AS creator_id`,
        [orderId, sellerId]
      );
      // Creator items not yet paid: flip column to 'refunded' so payout cron
      // skips them (cron filters payout_status IN (NULL,'pending')).
      await q(
        `UPDATE commerce_order_items
         SET payout_status = 'refunded'
       WHERE order_id = $1::uuid
         AND metadata->>'seller_id' = $2
         AND (payout_status IS NULL
              OR payout_status IN ('pending','not_connected','no_account','restricted','failed'))`,
        [orderId, sellerId]
      );

      await q(
        `INSERT INTO payment_transactions (
        order_id, provider, provider_payment_id, transaction_type,
        status, currency, amount_cents, processed_at, metadata
      ) VALUES ($1, 'stripe', $2, 'refund', $3, $4, $5, now(), $6::jsonb)
      ON CONFLICT (provider, provider_payment_id, transaction_type)
      DO UPDATE SET
        status = EXCLUDED.status,
        processed_at = EXCLUDED.processed_at,
        metadata = payment_transactions.metadata || EXCLUDED.metadata`,
        [
          orderId,
          refundId,
          refundStatus === "succeeded" ? "succeeded" : "pending",
          refundCurrency,
          refundAmountCents,
          JSON.stringify({ payment_intent: paymentIntentId, seller_id: sellerId }),
        ]
      );

      return { sellerClawback, creatorClawback };
    });

    // Alerte de reconciliere manuală — după commit, ca logarea să nu țină
    // tranzacția deschisă și să nu se emită dacă aceasta face rollback.
    for (const row of sellerClawback) {
      logger.error(
        {
          order_id: orderId,
          item_id: row.id,
          seller_id: sellerId,
          amount_cents: row.amount_cents,
          transfer_id: row.transfer_id,
          refund_id: refundId,
        },
        "[refund-after-payout] seller payout already settled - manual Stripe clawback required",
      );
    }
    for (const row of creatorClawback) {
      logger.error(
        {
          order_id: orderId,
          item_id: row.id,
          creator_id: row.creator_id,
          amount_cents: row.amount_cents,
          transfer_id: row.transfer_id,
          refund_id: refundId,
        },
        "[refund-after-payout] creator payout already settled - manual Stripe clawback required",
      );
    }

    logger.info({ order_id: orderId, seller_id: sellerId }, "[Seller Refund] order marked as refunded");

    return NextResponse.json({ success: true, refundId, refundStatus });
  } catch (error: any) {
    logger.error({ err: error }, "[Seller Refund] Unexpected error:");
    return NextResponse.json(
      { success: false, error: "Eroare interna. Incearca din nou." },
      { status: 500 }
    );
  }
}
