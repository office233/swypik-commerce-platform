/**
 * Seller Refund API
 * POST /api/seller/orders/[id]/refund
 *
 * Allows a seller to approve a return request and execute a full Stripe refund
 * only when that seller owns every item in the order. Multi-seller refunds are
 * blocked for admin handling because Stripe PaymentIntent refunds are order-wide.
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { getStripe } from "@/lib/stripe/checkout";
import { evaluateSellerRefundRequest } from "@/lib/seller/refund-policy";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";

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
      return NextResponse.json(
        {
          success: false,
          error: `Eroare Stripe la restituire: ${stripeError.message || "Eroare necunoscuta"}`,
        },
        { status: 502 }
      );
    }

    await dbQuery(
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

    await dbQuery(
      `UPDATE commerce_order_items
       SET payout_status = 'refunded',
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'refund_id', $3::text,
             'refund_status', $4::text
           )
       WHERE order_id = $1::uuid
         AND metadata->>'seller_id' = $2`,
      [orderId, sellerId, refundId, refundStatus]
    );

    await dbQuery(
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

    console.log(`[Seller Refund] Order ${orderId} marked as refunded by seller ${sellerId}`);

    return NextResponse.json({ success: true, refundId, refundStatus });
  } catch (error: any) {
    logger.error({ err: error }, "[Seller Refund] Unexpected error:");
    return NextResponse.json(
      { success: false, error: "Eroare interna. Incearca din nou." },
      { status: 500 }
    );
  }
}
