/**
 * Seller Payouts Listing API
 * GET /api/seller/payouts
 *
 * Aggregates payouts from commerce_order_items.metadata (seller_payout_*).
 * commission_payouts is creator-only (no seller_id col).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json(
        { success: false, error: "Neautorizat." },
        { status: 401 }
      );
    }

    const { rows: summaryRows } = await dbQuery(
      `SELECT
         COALESCE(SUM(CASE
           WHEN (coi.metadata->>'seller_payout_status' IS NULL
                 OR coi.metadata->>'seller_payout_status' = 'pending')
             THEN (coi.metadata->>'seller_payout_cents')::int
           ELSE 0 END), 0)::bigint AS pending_cents,
         COALESCE(SUM(CASE
           WHEN coi.metadata->>'seller_payout_status' = 'paid'
                AND (coi.metadata->>'seller_payout_paid_at')::timestamptz
                    > NOW() - INTERVAL '90 days'
             THEN (coi.metadata->>'seller_payout_cents')::int
           ELSE 0 END), 0)::bigint AS paid_90_cents,
         COALESCE(SUM(CASE
           WHEN coi.metadata->>'seller_payout_status' = 'paid'
             THEN (coi.metadata->>'seller_payout_cents')::int
           ELSE 0 END), 0)::bigint AS paid_total_cents
       FROM commerce_order_items coi
       WHERE coi.metadata->>'seller_id' = $1
         AND coi.metadata->>'seller_payout_cents' IS NOT NULL`,
      [sellerId]
    );

    const { rows: transfers } = await dbQuery(
      `SELECT
         coi.id,
         coi.order_id,
         coi.title,
         (coi.metadata->>'seller_payout_cents')::int   AS net_amount_cents,
         coi.currency,
         COALESCE(coi.metadata->>'seller_payout_status', 'pending') AS status,
         coi.metadata->>'seller_payout_transfer_id'   AS stripe_transfer_id,
         (coi.metadata->>'seller_payout_paid_at')::timestamptz AS paid_at,
         coi.created_at
       FROM commerce_order_items coi
       WHERE coi.metadata->>'seller_id' = $1
         AND coi.metadata->>'seller_payout_cents' IS NOT NULL
       ORDER BY coi.created_at DESC
       LIMIT 20`,
      [sellerId]
    );

    return NextResponse.json({
      success: true,
      summary: summaryRows[0],
      transfers,
    });
  } catch (err: any) {
    logger.error({ err }, "[Seller Payouts] GET error");
    return NextResponse.json(
      { success: false, error: "Eroare interna." },
      { status: 500 }
    );
  }
}
