/**
 * Admin Dashboard â€” Orders, Revenue, Stats
 */

import { dbQuery } from "@/lib/db";
import { hasAdminSession, isAdminConfigured } from "@/lib/security/admin-auth";
import Link from "next/link";
import OpsAlertsBar from "./OpsAlertsBar";

export const dynamic = "force-dynamic";

async function getStats() {
  try {
    const orderView = `
      SELECT
        ord.id,
        sess.provider_session_id AS stripe_session_id,
        ord.metadata->>'customer_email' AS customer_email,
        ord.metadata->>'customer_phone' AS customer_phone,
        (ord.total_cents::numeric / 100) AS total_ron,
        ord.status,
        COALESCE(ord.metadata->>'fulfillment_status', 'pending') AS fulfillment_status,
        ord.metadata->'items' AS items,
        ord.metadata->'shipping_address' AS shipping_address,
        ord.created_at
      FROM commerce_orders ord
      LEFT JOIN checkout_sessions sess ON sess.order_id = ord.id AND sess.provider = 'stripe'
    `;

    const { rows: totals } = await dbQuery(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total_ron), 0) as total_revenue,
        COALESCE(AVG(total_ron), 0) as avg_order_value,
        COUNT(DISTINCT customer_email) as unique_customers
      FROM (${orderView}) orders WHERE status != 'cancelled'
    `);

    const { rows: today } = await dbQuery(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_ron), 0) as revenue
      FROM (${orderView}) orders WHERE created_at >= CURRENT_DATE AND status != 'cancelled'
    `);

    const { rows: week } = await dbQuery(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_ron), 0) as revenue
      FROM (${orderView}) orders WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' AND status != 'cancelled'
    `);

    const { rows: month } = await dbQuery(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_ron), 0) as revenue
      FROM (${orderView}) orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' AND status != 'cancelled'
    `);

    const { rows: byStatus } = await dbQuery(`
      SELECT status, COUNT(*) as count
      FROM (${orderView}) orders GROUP BY status ORDER BY count DESC
    `);

    const { rows: byFulfillment } = await dbQuery(`
      SELECT fulfillment_status, COUNT(*) as count
      FROM (${orderView}) orders GROUP BY fulfillment_status ORDER BY count DESC
    `);

    const { rows: countries } = await dbQuery(`
      SELECT
        shipping_address->>'country' as country,
        COUNT(*) as count,
        SUM(total_ron) as revenue
      FROM (${orderView}) orders
      WHERE shipping_address IS NOT NULL AND shipping_address->>'country' IS NOT NULL
      GROUP BY shipping_address->>'country'
      ORDER BY count DESC
      LIMIT 10
    `);

    const { rows: recent } = await dbQuery(`
      SELECT id, stripe_session_id, customer_email, customer_phone,
             total_ron, status, fulfillment_status, items,
             shipping_address, created_at
      FROM (${orderView}) orders
      ORDER BY created_at DESC
      LIMIT 25
    `);

    const { rows: dailyRevenue } = await dbQuery(`
      SELECT
        DATE(created_at) as day,
        COUNT(*) as orders,
        COALESCE(SUM(total_ron), 0) as revenue
      FROM (${orderView}) orders
      WHERE created_at >= CURRENT_DATE - INTERVAL '14 days' AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    const { rows: catalog } = await dbQuery(`
      SELECT COUNT(*) as total_products,
             COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url <> '') as with_images,
             (SELECT COUNT(DISTINCT p.id)
                FROM marketplace_products p
                JOIN videos v ON v.product_refs ? p.id::text
                WHERE v.status = 'published') as with_video,
             ROUND(AVG(price_cents)::numeric / 100, 2) as avg_price
      FROM marketplace_products
      WHERE status NOT IN ('archived', 'disabled')
    `);

    return {
      totals: totals[0],
      today: today[0],
      week: week[0],
      month: month[0],
      byStatus,
      byFulfillment,
      countries,
      recent,
      dailyRevenue,
      catalog: catalog[0],
    };
  } catch (error: any) {
    console.error("[Admin] Stats error:", error);
    return null;
  }
}

const COUNTRY_FLAGS: Record<string, string> = {
  RO: "RO",
  GB: "GB",
  DE: "DE",
  FR: "FR",
  IT: "IT",
  ES: "ES",
  NL: "NL",
  BE: "BE",
  AT: "AT",
  PL: "PL",
  HU: "HU",
  BG: "BG",
  US: "US",
  CA: "CA",
  AU: "AU",
  SE: "SE",
  DK: "DK",
  FI: "FI",
};

export default async function AdminDashboard() {
  // SECURITY: gate înainte de orice fetch DB. Layout-ul oricum afișează
  // login form dacă nu e admin, dar fără gate aici getStats() rulează și
  // datele ajung în payload-ul RSC pentru utilizatori neautentificați.
  if (!isAdminConfigured() || !(await hasAdminSession())) {
    return null;
  }
  const stats = await getStats();

  if (!stats) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-[#0D0D0D]">Error loading stats</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...stats.dailyRevenue.map((day: any) => Number(day.revenue)), 1);

  return (
    <div className="min-h-screen bg-white text-[#0D0D0D]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="border-b border-[#E5E5E7] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0D0D0D] text-sm font-black text-white">AI</span>
            <div>
              <h1 className="text-lg font-black">Swypik Admin</h1>
              <p className="text-xs text-[#6E6E80]">Dashboard • Live Data</p>
            </div>
          </div>
          <div className="flex gap-3">
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener"
              className="rounded-xl bg-[#635BFF] px-4 py-2 text-xs font-bold text-white hover:bg-[#7A73FF] transition-colors"
            >
              Stripe Dashboard
            </a>
            <a
              href="/api/health"
              target="_blank"
              rel="noopener"
              className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#0D0D0D] border border-[#E5E5E7] hover:border-[#0D0D0D] transition-colors"
            >
              Server Health
            </a>
            <Link
              href="/"
              className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#0D0D0D] border border-[#E5E5E7] hover:border-[#0D0D0D] transition-colors"
            >
              Storefront
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <OpsAlertsBar />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label="Total orders" value={stats.totals.total_orders} icon="ORD" />
          <KPICard label="Revenue" value={`${Number(stats.totals.total_revenue).toLocaleString()} lei`} icon="REV" />
          <KPICard label="Average order" value={`${Number(stats.totals.avg_order_value).toFixed(0)} lei`} icon="AOV" />
          <KPICard label="Unique customers" value={stats.totals.unique_customers} icon="CUS" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PeriodCard label="Today" orders={stats.today.count} revenue={stats.today.revenue} color="#0D0D0D" />
          <PeriodCard label="Last 7 days" orders={stats.week.count} revenue={stats.week.revenue} color="#F59E0B" />
          <PeriodCard label="Last 30 days" orders={stats.month.count} revenue={stats.month.revenue} color="#635BFF" />
        </div>

        <div className="rounded-2xl bg-white border border-[#E5E5E7] p-6 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">Revenue • Last 14 days</h2>
          <div className="flex items-end gap-1 h-40">
            {stats.dailyRevenue.map((day: any, index: number) => {
              const height = maxRevenue > 0 ? (Number(day.revenue) / maxRevenue) * 100 : 0;
              const label = new Date(day.day).toLocaleDateString("ro-RO", { weekday: "short", day: "numeric" });
              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${label}: ${Number(day.revenue).toFixed(0)} lei (${day.orders} orders)`}
                >
                  <span className="text-[9px] text-[#6E6E80]">
                    {Number(day.revenue) > 0 ? `${Number(day.revenue).toFixed(0)}` : ""}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-[#0D0D0D] hover:bg-[#12B88A] transition-colors cursor-default"
                    style={{ height: `${Math.max(height, 2)}%`, minHeight: "2px" }}
                  />
                  <span className="text-[8px] text-[#6E6E80]">{label}</span>
                </div>
              );
            })}
            {stats.dailyRevenue.length === 0 ? (
              <p className="text-sm text-[#6E6E80] w-full text-center py-10">No orders in the last 14 days.</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-2xl bg-white border border-[#E5E5E7] p-6 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">Order status</h2>
            <div className="space-y-2">
              {stats.byStatus.map((status: any) => (
                <div key={status.status} className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-sm">
                    <StatusBadge status={status.status} />
                    {status.status}
                  </span>
                  <span className="text-sm font-bold">{status.count}</span>
                </div>
              ))}
              {stats.byStatus.length === 0 ? <p className="text-sm text-[#6E6E80]">No orders</p> : null}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-[#E5E5E7] p-6 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">Fulfillment</h2>
            <div className="space-y-2">
              {stats.byFulfillment.map((fulfillment: any) => (
                <div key={fulfillment.fulfillment_status} className="flex justify-between items-center">
                  <span className="text-sm">{fulfillment.fulfillment_status || "N/A"}</span>
                  <span className="text-sm font-bold">{fulfillment.count}</span>
                </div>
              ))}
              {stats.byFulfillment.length === 0 ? <p className="text-sm text-[#6E6E80]">N/A</p> : null}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-[#E5E5E7] p-6 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">Customer locations</h2>
            <div className="space-y-2">
              {stats.countries.map((country: any) => (
                <div key={country.country} className="flex justify-between items-center">
                  <span className="text-sm">
                    {COUNTRY_FLAGS[country.country] || "?"} {country.country}
                  </span>
                  <span className="text-sm">
                    <span className="font-bold">{country.count}</span>
                    <span className="text-[#6E6E80] ml-2">{Number(country.revenue).toFixed(0)} lei</span>
                  </span>
                </div>
              ))}
              {stats.countries.length === 0 ? <p className="text-sm text-[#6E6E80]">No customer locations yet</p> : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-[#E5E5E7] p-6 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">Catalog snapshot</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MiniStat label="Total products" value={Number(stats.catalog.total_products).toLocaleString()} />
            <MiniStat label="With images" value={Number(stats.catalog.with_images).toLocaleString()} />
            <MiniStat label="With video" value={Number(stats.catalog.with_video).toLocaleString()} />
            <MiniStat label="Average price" value={`${stats.catalog.avg_price} lei`} />
          </div>
        </div>

        {/* ─── Quick nav: Video Manager ─── */}
        <Link
          href="/admin/videos"
          className="block rounded-2xl bg-white border border-[#E5E5E7] p-6 hover:border-[#0D0D0D] hover:shadow-md transition-all group shadow-sm"
        >
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#0D0D0D]/10 text-xl group-hover:bg-[#0D0D0D]/20 transition-colors">
              🎬
            </span>
            <div>
              <h3 className="text-base font-black group-hover:text-[#0D0D0D] transition-colors">
                Video Manager
              </h3>
              <p className="text-xs text-[#6E6E80] mt-0.5">
                Review, approve, and manage creator video assets
              </p>
            </div>
            <span className="ml-auto text-[#6E6E80] group-hover:text-[#0D0D0D] transition-colors text-lg">
              →
            </span>
          </div>
        </Link>

        <div className="rounded-2xl bg-white border border-[#E5E5E7] p-6 overflow-hidden shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">Recent orders</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E5E7] text-[#6E6E80] text-xs uppercase">
                  <th className="text-left py-3 pr-3">Order</th>
                  <th className="text-left py-3 pr-3">Customer</th>
                  <th className="text-left py-3 pr-3">Items</th>
                  <th className="text-right py-3 pr-3">Total</th>
                  <th className="text-center py-3 pr-3">Status</th>
                  <th className="text-center py-3 pr-3">Fulfillment</th>
                  <th className="text-left py-3 pr-3">Location</th>
                  <th className="text-left py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((order: any) => {
                  const items = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
                  const shipping = order.shipping_address
                    ? typeof order.shipping_address === "string"
                      ? JSON.parse(order.shipping_address)
                      : order.shipping_address
                    : null;
                  const itemCount = items?.reduce?.((sum: number, item: any) => sum + (item.quantity || 1), 0) || 0;

                  return (
                    <tr key={order.id} className="border-b border-[#F0F0F2] hover:bg-[#F7F7F8] transition-colors">
                      <td className="py-3 pr-3 font-bold text-[#0D0D0D]">#{order.id}</td>
                      <td className="py-3 pr-3">
                        <p className="font-medium truncate max-w-[180px]">{order.customer_email || "-"}</p>
                        {order.customer_phone ? <p className="text-[10px] text-[#6E6E80]">{order.customer_phone}</p> : null}
                      </td>
                      <td className="py-3 pr-3">
                        <span className="text-[#6E6E80]">{itemCount} items</span>
                      </td>
                      <td className="py-3 pr-3 text-right font-black text-[#0D0D0D]">
                        {Number(order.total_ron).toFixed(0)} lei
                      </td>
                      <td className="py-3 pr-3 text-center">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="py-3 pr-3 text-center">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            order.fulfillment_status === "shipped"
                              ? "bg-[#0D0D0D]/15 text-[#0D0D0D]"
                              : order.fulfillment_status === "processing"
                                ? "bg-[#F59E0B]/15 text-[#B45309]"
                                : "bg-[#F0F0F2] text-[#6E6E80]"
                          }`}
                        >
                          {order.fulfillment_status || "pending"}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-xs text-[#6E6E80]">
                        {shipping ? `${COUNTRY_FLAGS[shipping.country] || ""} ${shipping.city || shipping.country || "-"}` : "-"}
                      </td>
                      <td className="py-3 text-xs text-[#6E6E80]">
                        {new Date(order.created_at).toLocaleDateString("ro-RO", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  );
                })}
                {stats.recent.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[#6E6E80]">
                      No orders yet. The first order will appear here.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#E5E5E7] px-6 py-4 text-center text-xs text-[#6E6E80]">
        Swypik Admin • Powered by PostgreSQL + Stripe + Hetzner
      </footer>
    </div>
  );
}

function KPICard({ label, value, icon }: { label: string; value: any; icon: string }) {
  return (
    <div className="rounded-2xl bg-white border border-[#E5E5E7] p-5 hover:border-[#0D0D0D] hover:shadow-md transition-all shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-[#6E6E80] mb-1">
        {icon} {label}
      </p>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}

function PeriodCard({ label, orders, revenue, color }: { label: string; orders: any; revenue: any; color: string }) {
  return (
    <div
      className="rounded-2xl bg-white border border-[#E5E5E7] p-5 shadow-sm"
      style={{ borderLeftColor: color, borderLeftWidth: "3px" }}
    >
      <p className="text-xs font-bold uppercase tracking-widest text-[#6E6E80] mb-2">{label}</p>
      <div className="flex justify-between items-end">
        <div>
          <p className="text-2xl font-black">{orders}</p>
          <p className="text-xs text-[#6E6E80]">orders</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black" style={{ color }}>
            {Number(revenue).toFixed(0)} lei
          </p>
          <p className="text-xs text-[#6E6E80]">revenue</p>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xl font-black">{value}</p>
      <p className="text-xs text-[#6E6E80]">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-[#0D0D0D]/20 text-[#0D0D0D]",
    fulfilled: "bg-[#0D0D0D]/20 text-[#0D0D0D]",
    shipped: "bg-[#3B82F6]/20 text-[#3B82F6]",
    delivered: "bg-[#0D0D0D]/20 text-[#0D0D0D]",
    refunded: "bg-[#EF4444]/20 text-[#EF4444]",
    cancelled: "bg-[#6E6E80]/20 text-[#6E6E80]",
    pending: "bg-[#F59E0B]/20 text-[#F59E0B]",
  };

  return (
    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}
