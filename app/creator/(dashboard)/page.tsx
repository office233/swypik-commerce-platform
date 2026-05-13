/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { dbQuery } from "@/lib/db";
import { summarizeCreatorEarnings } from "@/lib/creator/earnings";
import { getCreatorUserId } from "@/lib/creator/session";

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

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow">
          <p className="text-sm font-bold text-[#6E6E80]">Click-uri Generate</p>
          <p className="text-3xl sm:text-4xl font-black text-[#0D0D0D] mt-2">{summary.clicks.toLocaleString("ro-RO")}</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow">
          <p className="text-sm font-bold text-[#6E6E80]">Comisioane Câștigate</p>
          <p className="text-3xl sm:text-4xl font-black text-[#10A37F] mt-2">{summary.earningsRon.toLocaleString("ro-RO", { maximumFractionDigits: 0 })} lei</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow">
          <p className="text-sm font-bold text-[#6E6E80]">Vânzări</p>
          <p className="text-3xl sm:text-4xl font-black text-[#0D0D0D] mt-2">{summary.totalOrders.toLocaleString("ro-RO")}</p>
        </div>
      </div>

      {/* Recommended Products */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-[#0D0D0D] mb-4 sm:mb-6">Produse Recomandate pentru Tine</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
          
          {/* Product 1 */}
          <div className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group">
            <div className="h-40 sm:h-56 bg-[#F7F7F8] relative overflow-hidden">
               <img 
                 src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80" 
                 alt="Căști Wireless" 
                 className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
               />
               <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl text-xs font-black text-[#10A37F] shadow-sm border border-white">
                 Comision 15%
               </div>
            </div>
            <div className="p-5 flex-1 flex flex-col">
              <h3 className="font-bold text-[#0D0D0D] text-lg leading-tight line-clamp-2">Căști Audio Wireless Premium</h3>
              <p className="text-[#10A37F] font-black mt-2 text-xl">149 lei</p>
              
              <div className="mt-auto pt-6">
                <p className="text-xs font-bold text-[#6E6E80] mb-2 uppercase tracking-wide">Link-ul tău de afiliat</p>
                <div className="relative">
                  <input 
                    type="text" 
                    readOnly 
                    value="https://swypik.ro/p/casti-premium?ref=creator123" 
                    className="w-full text-sm font-medium p-3 bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl text-[#0D0D0D] focus:outline-none focus:border-[#10A37F] focus:ring-2 focus:ring-[#10A37F]/20 cursor-text transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Product 2 */}
          <div className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group">
            <div className="h-40 sm:h-56 bg-[#F7F7F8] relative overflow-hidden">
               <img 
                 src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80" 
                 alt="Smartwatch" 
                 className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
               />
               <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl text-xs font-black text-[#10A37F] shadow-sm border border-white">
                 Comision 20%
               </div>
            </div>
            <div className="p-5 flex-1 flex flex-col">
              <h3 className="font-bold text-[#0D0D0D] text-lg leading-tight line-clamp-2">Smartwatch Fitness Tracker</h3>
              <p className="text-[#10A37F] font-black mt-2 text-xl">199 lei</p>
              
              <div className="mt-auto pt-6">
                <p className="text-xs font-bold text-[#6E6E80] mb-2 uppercase tracking-wide">Link-ul tău de afiliat</p>
                <div className="relative">
                  <input 
                    type="text" 
                    readOnly 
                    value="https://swypik.ro/p/smartwatch-fitness?ref=creator123" 
                    className="w-full text-sm font-medium p-3 bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl text-[#0D0D0D] focus:outline-none focus:border-[#10A37F] focus:ring-2 focus:ring-[#10A37F]/20 cursor-text transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Product 3 */}
          <div className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group">
            <div className="h-40 sm:h-56 bg-[#F7F7F8] relative overflow-hidden">
               <img 
                 src="https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&q=80" 
                 alt="Boxă Portabilă" 
                 className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
               />
               <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl text-xs font-black text-[#10A37F] shadow-sm border border-white">
                 Comision 10%
               </div>
            </div>
            <div className="p-5 flex-1 flex flex-col">
              <h3 className="font-bold text-[#0D0D0D] text-lg leading-tight line-clamp-2">Boxă Portabilă Bluetooth</h3>
              <p className="text-[#10A37F] font-black mt-2 text-xl">99 lei</p>
              
              <div className="mt-auto pt-6">
                <p className="text-xs font-bold text-[#6E6E80] mb-2 uppercase tracking-wide">Link-ul tău de afiliat</p>
                <div className="relative">
                  <input 
                    type="text" 
                    readOnly 
                    value="https://swypik.ro/p/boxa-portabila?ref=creator123" 
                    className="w-full text-sm font-medium p-3 bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl text-[#0D0D0D] focus:outline-none focus:border-[#10A37F] focus:ring-2 focus:ring-[#10A37F]/20 cursor-text transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
