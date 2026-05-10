/**
 * Admin Dashboard — Orders, Revenue, Stats
 * Protected by ADMIN_SECRET query param
 */

import { dbQuery } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getStats() {
  try {
    // Total orders & revenue
    const { rows: totals } = await dbQuery(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_ron), 0) as total_revenue,
        COALESCE(AVG(total_ron), 0) as avg_order_value,
        COUNT(DISTINCT customer_email) as unique_customers
      FROM orders WHERE status != 'cancelled'
    `);

    // Orders today
    const { rows: today } = await dbQuery(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_ron), 0) as revenue
      FROM orders WHERE created_at >= CURRENT_DATE AND status != 'cancelled'
    `);

    // Orders last 7 days
    const { rows: week } = await dbQuery(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_ron), 0) as revenue
      FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' AND status != 'cancelled'
    `);

    // Orders last 30 days
    const { rows: month } = await dbQuery(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_ron), 0) as revenue
      FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' AND status != 'cancelled'
    `);

    // Orders by status
    const { rows: byStatus } = await dbQuery(`
      SELECT status, COUNT(*) as count 
      FROM orders GROUP BY status ORDER BY count DESC
    `);

    // Fulfillment status
    const { rows: byFulfillment } = await dbQuery(`
      SELECT fulfillment_status, COUNT(*) as count 
      FROM orders GROUP BY fulfillment_status ORDER BY count DESC
    `);

    // Top countries
    const { rows: countries } = await dbQuery(`
      SELECT 
        shipping_address->>'country' as country,
        COUNT(*) as count,
        SUM(total_ron) as revenue
      FROM orders 
      WHERE shipping_address IS NOT NULL AND shipping_address->>'country' IS NOT NULL
      GROUP BY shipping_address->>'country'
      ORDER BY count DESC
      LIMIT 10
    `);

    // Recent orders
    const { rows: recent } = await dbQuery(`
      SELECT id, stripe_session_id, customer_email, customer_phone,
             total_ron, status, fulfillment_status, items,
             shipping_address, created_at
      FROM orders 
      ORDER BY created_at DESC
      LIMIT 25
    `);

    // Daily revenue chart (last 14 days)
    const { rows: dailyRevenue } = await dbQuery(`
      SELECT 
        DATE(created_at) as day,
        COUNT(*) as orders,
        COALESCE(SUM(total_ron), 0) as revenue
      FROM orders 
      WHERE created_at >= CURRENT_DATE - INTERVAL '14 days' AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    // Product catalog stats
    const { rows: catalog } = await dbQuery(`
      SELECT COUNT(*) as total_products,
             COUNT(*) FILTER (WHERE images IS NOT NULL AND array_length(images, 1) > 0) as with_images,
             COUNT(*) FILTER (WHERE has_video = true) as with_video,
             ROUND(AVG(price)::numeric, 2) as avg_price
      FROM ae_products
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
  } catch (e: any) {
    console.error("[Admin] Stats error:", e);
    return null;
  }
}

const COUNTRY_FLAGS: Record<string, string> = {
  RO: "🇷🇴", GB: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸",
  NL: "🇳🇱", BE: "🇧🇪", AT: "🇦🇹", PL: "🇵🇱", HU: "🇭🇺", BG: "🇧🇬",
  US: "🇺🇸", CA: "🇨🇦", AU: "🇦🇺", SE: "🇸🇪", DK: "🇩🇰", FI: "🇫🇮",
};

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: { secret?: string };
}) {
  // Simple auth
  const adminSecret = process.env.ADMIN_SECRET || "aicevrei-admin-2024";
  if (searchParams.secret !== adminSecret) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <div className="text-center">
          <p className="text-6xl mb-4">🔒</p>
          <h1 className="text-2xl font-black text-white">Admin Access Required</h1>
          <p className="mt-2 text-sm text-[#6E6E80]">Add ?secret=YOUR_SECRET to the URL</p>
        </div>
      </div>
    );
  }

  const stats = await getStats();

  if (!stats) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <p className="text-white">Error loading stats</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...stats.dailyRevenue.map((d: any) => Number(d.revenue)), 1);

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-[#1E1E1E] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#10A37F] text-sm font-black">AI</span>
            <div>
              <h1 className="text-lg font-black">AICeVrei Admin</h1>
              <p className="text-xs text-[#6E6E80]">Dashboard • Live Data</p>
            </div>
          </div>
          <div className="flex gap-3">
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener"
              className="rounded-xl bg-[#635BFF] px-4 py-2 text-xs font-bold text-white hover:bg-[#7A73FF] transition-colors">
              💳 Stripe Dashboard
            </a>
            <a href="https://vercel.com/dashboard" target="_blank" rel="noopener"
              className="rounded-xl bg-[#1E1E1E] px-4 py-2 text-xs font-bold text-white border border-[#333] hover:border-[#555] transition-colors">
              ▲ Vercel
            </a>
            <Link href="/"
              className="rounded-xl bg-[#1E1E1E] px-4 py-2 text-xs font-bold text-white border border-[#333] hover:border-[#555] transition-colors">
              🏠 Magazin
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label="Total Comenzi" value={stats.totals.total_orders} icon="📦" />
          <KPICard label="Revenue Total" value={`${Number(stats.totals.total_revenue).toLocaleString()} lei`} icon="💰" />
          <KPICard label="Avg. Comandă" value={`${Number(stats.totals.avg_order_value).toFixed(0)} lei`} icon="📊" />
          <KPICard label="Clienți Unici" value={stats.totals.unique_customers} icon="👥" />
        </div>

        {/* Time Period Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PeriodCard label="Astăzi" orders={stats.today.count} revenue={stats.today.revenue} color="#10A37F" />
          <PeriodCard label="Ultimele 7 zile" orders={stats.week.count} revenue={stats.week.revenue} color="#F59E0B" />
          <PeriodCard label="Ultimele 30 zile" orders={stats.month.count} revenue={stats.month.revenue} color="#635BFF" />
        </div>

        {/* Revenue Chart */}
        <div className="rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] p-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">📈 Revenue — Ultimele 14 zile</h2>
          <div className="flex items-end gap-1 h-40">
            {stats.dailyRevenue.map((d: any, i: number) => {
              const height = maxRevenue > 0 ? (Number(d.revenue) / maxRevenue) * 100 : 0;
              const day = new Date(d.day).toLocaleDateString("ro-RO", { weekday: "short", day: "numeric" });
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${day}: ${Number(d.revenue).toFixed(0)} lei (${d.orders} comenzi)`}>
                  <span className="text-[9px] text-[#6E6E80]">{Number(d.revenue) > 0 ? `${Number(d.revenue).toFixed(0)}` : ""}</span>
                  <div
                    className="w-full rounded-t-md bg-[#10A37F] hover:bg-[#12B88A] transition-colors cursor-default"
                    style={{ height: `${Math.max(height, 2)}%`, minHeight: "2px" }}
                  />
                  <span className="text-[8px] text-[#6E6E80]">{day}</span>
                </div>
              );
            })}
            {stats.dailyRevenue.length === 0 && (
              <p className="text-sm text-[#6E6E80] w-full text-center py-10">Nicio comandă în ultimele 14 zile</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order Status */}
          <div className="rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] p-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">📋 Status Comenzi</h2>
            <div className="space-y-2">
              {stats.byStatus.map((s: any) => (
                <div key={s.status} className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-sm">
                    <StatusBadge status={s.status} />
                    {s.status}
                  </span>
                  <span className="text-sm font-bold">{s.count}</span>
                </div>
              ))}
              {stats.byStatus.length === 0 && <p className="text-sm text-[#6E6E80]">Nicio comandă</p>}
            </div>
          </div>

          {/* Fulfillment Status */}
          <div className="rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] p-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">🚚 Fulfillment</h2>
            <div className="space-y-2">
              {stats.byFulfillment.map((f: any) => (
                <div key={f.fulfillment_status} className="flex justify-between items-center">
                  <span className="text-sm">{f.fulfillment_status || "N/A"}</span>
                  <span className="text-sm font-bold">{f.count}</span>
                </div>
              ))}
              {stats.byFulfillment.length === 0 && <p className="text-sm text-[#6E6E80]">N/A</p>}
            </div>
          </div>

          {/* Countries */}
          <div className="rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] p-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">🌍 Locații Clienți</h2>
            <div className="space-y-2">
              {stats.countries.map((c: any) => (
                <div key={c.country} className="flex justify-between items-center">
                  <span className="text-sm">
                    {COUNTRY_FLAGS[c.country] || "🏳️"} {c.country}
                  </span>
                  <span className="text-sm">
                    <span className="font-bold">{c.count}</span>
                    <span className="text-[#6E6E80] ml-2">{Number(c.revenue).toFixed(0)} lei</span>
                  </span>
                </div>
              ))}
              {stats.countries.length === 0 && <p className="text-sm text-[#6E6E80]">Nicio locație încă</p>}
            </div>
          </div>
        </div>

        {/* Catalog Stats */}
        <div className="rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] p-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">🏪 Catalog Produse</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MiniStat label="Total Produse" value={Number(stats.catalog.total_products).toLocaleString()} />
            <MiniStat label="Cu Imagini" value={Number(stats.catalog.with_images).toLocaleString()} />
            <MiniStat label="Cu Video" value={Number(stats.catalog.with_video).toLocaleString()} />
            <MiniStat label="Preț Mediu" value={`${stats.catalog.avg_price} lei`} />
          </div>
        </div>

        {/* Recent Orders Table */}
        <div className="rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] p-6 overflow-hidden">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-4">🛒 Comenzi Recente</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2A2A2A] text-[#6E6E80] text-xs uppercase">
                  <th className="text-left py-3 pr-3">#</th>
                  <th className="text-left py-3 pr-3">Client</th>
                  <th className="text-left py-3 pr-3">Produse</th>
                  <th className="text-right py-3 pr-3">Total</th>
                  <th className="text-center py-3 pr-3">Status</th>
                  <th className="text-center py-3 pr-3">Fulfillment</th>
                  <th className="text-left py-3 pr-3">Locație</th>
                  <th className="text-left py-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((order: any) => {
                  const items = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
                  const shipping = order.shipping_address
                    ? typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address
                    : null;
                  const itemCount = items?.reduce?.((s: number, i: any) => s + (i.quantity || 1), 0) || 0;
                  return (
                    <tr key={order.id} className="border-b border-[#2A2A2A]/50 hover:bg-[#222] transition-colors">
                      <td className="py-3 pr-3 font-bold text-[#10A37F]">#{order.id}</td>
                      <td className="py-3 pr-3">
                        <p className="font-medium truncate max-w-[180px]">{order.customer_email || "—"}</p>
                        {order.customer_phone && <p className="text-[10px] text-[#6E6E80]">{order.customer_phone}</p>}
                      </td>
                      <td className="py-3 pr-3">
                        <span className="text-[#6E6E80]">{itemCount} produse</span>
                      </td>
                      <td className="py-3 pr-3 text-right font-black text-[#10A37F]">{Number(order.total_ron).toFixed(0)} lei</td>
                      <td className="py-3 pr-3 text-center"><StatusBadge status={order.status} /></td>
                      <td className="py-3 pr-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          order.fulfillment_status === "shipped" ? "bg-[#10A37F]/20 text-[#10A37F]" :
                          order.fulfillment_status === "processing" ? "bg-[#F59E0B]/20 text-[#F59E0B]" :
                          "bg-[#333] text-[#888]"
                        }`}>
                          {order.fulfillment_status || "pending"}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-xs text-[#6E6E80]">
                        {shipping ? `${COUNTRY_FLAGS[shipping.country] || ""} ${shipping.city || shipping.country || "—"}` : "—"}
                      </td>
                      <td className="py-3 text-xs text-[#6E6E80]">
                        {new Date(order.created_at).toLocaleDateString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  );
                })}
                {stats.recent.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-[#6E6E80]">Nicio comandă încă. Prima comandă va apărea aici! 🎉</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#1E1E1E] px-6 py-4 text-center text-xs text-[#6E6E80]">
        AICeVrei.ro Admin • Powered by NeonDB + Stripe + Vercel
      </footer>
    </div>
  );
}

function KPICard({ label, value, icon }: { label: string; value: any; icon: string }) {
  return (
    <div className="rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] p-5 hover:border-[#10A37F]/30 transition-colors">
      <p className="text-xs font-bold uppercase tracking-widest text-[#6E6E80] mb-1">{icon} {label}</p>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}

function PeriodCard({ label, orders, revenue, color }: { label: string; orders: any; revenue: any; color: string }) {
  return (
    <div className="rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] p-5" style={{ borderLeftColor: color, borderLeftWidth: "3px" }}>
      <p className="text-xs font-bold uppercase tracking-widest text-[#6E6E80] mb-2">{label}</p>
      <div className="flex justify-between items-end">
        <div>
          <p className="text-2xl font-black">{orders}</p>
          <p className="text-xs text-[#6E6E80]">comenzi</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black" style={{ color }}>{Number(revenue).toFixed(0)} lei</p>
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
    paid: "bg-[#10A37F]/20 text-[#10A37F]",
    fulfilled: "bg-[#10A37F]/20 text-[#10A37F]",
    shipped: "bg-[#3B82F6]/20 text-[#3B82F6]",
    delivered: "bg-[#10A37F]/20 text-[#10A37F]",
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
