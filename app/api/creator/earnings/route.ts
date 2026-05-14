import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { summarizeCreatorEarnings } from "@/lib/creator/earnings";
import { getCreatorUserId } from "@/lib/creator/session";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/**
 * GET /api/creator/earnings
 *
 * Schema references:
 *   videos / creator_videos: creator_id, status
 *   commerce_order_items: creator_id, unit_amount_cents, quantity,
 *                         commissionable_amount_cents, payout_status
 */

export async function GET() {
  try {
    const creatorId = await getCreatorUserId();
    if (!creatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const videosRes = await dbQuery<{ count: string }>(
      `SELECT COUNT(DISTINCT id) AS count
       FROM (
         SELECT id::text AS id FROM videos WHERE creator_id::text = $1 AND status = 'ready'
         UNION ALL
         SELECT id::text AS id FROM creator_videos WHERE creator_id = $1 AND status = 'ready'
       ) ready_videos`,
      [creatorId]
    );
    const totalVideos = parseInt(videosRes.rows[0]?.count || "0", 10);

    const salesRes = await dbQuery<{
      total_sales_cents: string;
      total_orders: string;
      paid_commissionable_cents: string;
      pending_commissionable_cents: string;
      failed_commissionable_cents: string;
      blocked_commissionable_cents: string;
      paid_items: string;
      pending_items: string;
      failed_items: string;
      blocked_items: string;
      this_month_sales_cents: string;
      this_month_orders: string;
    }>(
      `WITH creator_items AS (
         SELECT
           order_id,
           created_at,
           COALESCE(payout_status, 'pending') AS payout_status,
           (unit_amount_cents * quantity) AS gross_cents,
           CASE
             WHEN commissionable_amount_cents > 0 THEN commissionable_amount_cents
             ELSE unit_amount_cents * quantity
           END AS commissionable_cents
         FROM commerce_order_items
         WHERE creator_id::text = $1
       )
       SELECT
         COALESCE(SUM(gross_cents), 0) AS total_sales_cents,
         COUNT(DISTINCT order_id) AS total_orders,
         COALESCE(SUM(commissionable_cents) FILTER (WHERE payout_status = 'paid'), 0) AS paid_commissionable_cents,
         COALESCE(SUM(commissionable_cents) FILTER (WHERE payout_status IN ('pending', 'not_connected')), 0) AS pending_commissionable_cents,
         COALESCE(SUM(commissionable_cents) FILTER (WHERE payout_status = 'failed'), 0) AS failed_commissionable_cents,
         COALESCE(SUM(commissionable_cents) FILTER (WHERE payout_status IN ('no_account', 'restricted')), 0) AS blocked_commissionable_cents,
         COUNT(*) FILTER (WHERE payout_status = 'paid') AS paid_items,
         COUNT(*) FILTER (WHERE payout_status IN ('pending', 'not_connected')) AS pending_items,
         COUNT(*) FILTER (WHERE payout_status = 'failed') AS failed_items,
         COUNT(*) FILTER (WHERE payout_status IN ('no_account', 'restricted')) AS blocked_items,
         COALESCE(SUM(gross_cents) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS this_month_sales_cents,
         COUNT(DISTINCT order_id) FILTER (WHERE created_at >= date_trunc('month', now())) AS this_month_orders
       FROM creator_items`,
      [creatorId]
    );
    const sales = salesRes.rows[0];

    return NextResponse.json(summarizeCreatorEarnings({
      totalVideos,
      totalSalesCents: parseInt(sales?.total_sales_cents || "0", 10),
      totalOrders: parseInt(sales?.total_orders || "0", 10),
      paidCommissionableCents: parseInt(sales?.paid_commissionable_cents || "0", 10),
      pendingCommissionableCents: parseInt(sales?.pending_commissionable_cents || "0", 10),
      failedCommissionableCents: parseInt(sales?.failed_commissionable_cents || "0", 10),
      blockedCommissionableCents: parseInt(sales?.blocked_commissionable_cents || "0", 10),
      paidItems: parseInt(sales?.paid_items || "0", 10),
      pendingItems: parseInt(sales?.pending_items || "0", 10),
      failedItems: parseInt(sales?.failed_items || "0", 10),
      blockedItems: parseInt(sales?.blocked_items || "0", 10),
      thisMonthSalesCents: parseInt(sales?.this_month_sales_cents || "0", 10),
      thisMonthOrders: parseInt(sales?.this_month_orders || "0", 10),
    }));
  } catch (error: any) {
    logger.error({ err: error }, "[Creator Earnings API] GET Error:");
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
