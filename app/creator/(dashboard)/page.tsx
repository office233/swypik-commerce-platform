/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { dbQuery } from "@/lib/db";
import { summarizeCreatorEarnings } from "@/lib/creator/earnings";
import { getCreatorUserId } from "@/lib/creator/session";
import StripeConnectCard from "@/components/stripe/StripeConnectCard";
import Link from "next/link";

async function getCreatorDashboardSummary(creatorId: string) {
  try {
    const videosRes = await dbQuery<{ count: string; views: string }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(view_count), 0)::text AS views
       FROM videos
       WHERE creator_id::text = $1 AND status = 'ready'`,
      [creatorId]
    );

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
         COALESCE(SUM(gross_cents), 0)::text AS total_sales_cents,
         COUNT(DISTINCT order_id)::text AS total_orders,
         COALESCE(SUM(commissionable_cents) FILTER (WHERE payout_status = 'paid'), 0)::text AS paid_commissionable_cents,
         COALESCE(SUM(commissionable_cents) FILTER (WHERE payout_status IN ('pending', 'not_connected')), 0)::text AS pending_commissionable_cents,
         COALESCE(SUM(commissionable_cents) FILTER (WHERE payout_status = 'failed'), 0)::text AS failed_commissionable_cents,
         COALESCE(SUM(commissionable_cents) FILTER (WHERE payout_status IN ('no_account', 'restricted')), 0)::text AS blocked_commissionable_cents,
         COUNT(*) FILTER (WHERE payout_status = 'paid')::text AS paid_items,
         COUNT(*) FILTER (WHERE payout_status IN ('pending', 'not_connected'))::text AS pending_items,
         COUNT(*) FILTER (WHERE payout_status = 'failed')::text AS failed_items,
         COUNT(*) FILTER (WHERE payout_status IN ('no_account', 'restricted'))::text AS blocked_items,
         COALESCE(SUM(gross_cents) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::text AS this_month_sales_cents,
         COUNT(DISTINCT order_id) FILTER (WHERE created_at >= date_trunc('month', now()))::text AS this_month_orders
       FROM creator_items`,
      [creatorId]
    );

    const sales = salesRes.rows[0];
    const summary = summarizeCreatorEarnings({
      totalVideos: Number(videosRes.rows[0]?.count || 0),
      totalSalesCents: Number(sales?.total_sales_cents || 0),
      totalOrders: Number(sales?.total_orders || 0),
      paidCommissionableCents: Number(sales?.paid_commissionable_cents || 0),
      pendingCommissionableCents: Number(sales?.pending_commissionable_cents || 0),
      failedCommissionableCents: Number(sales?.failed_commissionable_cents || 0),
      blockedCommissionableCents: Number(sales?.blocked_commissionable_cents || 0),
      paidItems: Number(sales?.paid_items || 0),
      pendingItems: Number(sales?.pending_items || 0),
      failedItems: Number(sales?.failed_items || 0),
      blockedItems: Number(sales?.blocked_items || 0),
      thisMonthSalesCents: Number(sales?.this_month_sales_cents || 0),
      thisMonthOrders: Number(sales?.this_month_orders || 0),
    });

    return {
      clicks: Number(videosRes.rows[0]?.views || 0),
      earningsRon: summary.earningsCents / 100,
      totalOrders: summary.totalOrders,
    };
  } catch (error) {
    console.error("[Creator Dashboard] Summary error:", error);
    return { clicks: 0, earningsRon: 0, totalOrders: 0 };
  }
}

export default async function CreatorDashboard() {
  const creatorId = await getCreatorUserId();

  // Protect the main page
  if (!creatorId) {
    redirect("/");
  }
  const summary = await getCreatorDashboardSummary(creatorId);

  return (
    <div className="space-y-6 animate-fadeIn mobile-page-bottom">
      <div>
        <h1 className="text-3xl font-black text-[#0D0D0D]">Dashboard Creator</h1>
        <p className="text-[#6E6E80] mt-2">Bine ai venit! Aici poți urmări performanța linkurilor tale.</p>
      </div>

      {/* Stripe Connect onboarding */}
      <StripeConnectCard variant="creator" />

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow">
          <p className="text-sm font-bold text-[#6E6E80]">Click-uri Generate</p>
          <p className="text-3xl sm:text-4xl font-black text-[#0D0D0D] mt-2">{summary.clicks.toLocaleString("ro-RO")}</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow">
          <p className="text-sm font-bold text-[#6E6E80]">Comisioane Câștigate</p>
          <p className="text-3xl sm:text-4xl font-black text-[#0D0D0D] mt-2">{summary.earningsRon.toLocaleString("ro-RO", { maximumFractionDigits: 0 })} lei</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow">
          <p className="text-sm font-bold text-[#6E6E80]">Vânzări</p>
          <p className="text-3xl sm:text-4xl font-black text-[#0D0D0D] mt-2">{summary.totalOrders.toLocaleString("ro-RO")}</p>
        </div>
      </div>

      {/* Recommended Products — wired to DB recommendations later */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-[#0D0D0D] mb-4 sm:mb-6">Produse Recomandate</h2>
        <div className="bg-white rounded-2xl border border-[#E5E5E5] p-8 text-center">
          <p className="text-[#6E6E80] text-sm">Recomandările apar aici după ce postezi primul video.</p>
          <Link href="/creator/upload" className="inline-block mt-4 px-5 py-2.5 bg-[#0D0D0D] text-white rounded-xl text-sm font-bold hover:bg-[#1a1a1a] transition-colors">Încarcă primul video</Link>
        </div>
      </div>
    </div>
  );
}
