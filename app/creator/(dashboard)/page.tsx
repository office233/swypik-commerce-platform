/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { getCreatorUserId } from "@/lib/creator/session";
import StripeConnectCard from "@/components/stripe/StripeConnectCard";

export const dynamic = "force-dynamic";

const fmtRON = new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat("ro-RO");

function formatCents(cents: number) {
  return fmtRON.format((cents || 0) / 100);
}

type DailyPoint = { day: string; cents: number };

async function loadKpis(creatorId: string) {
  const [salesRes, commissionsRes, viewsRes, followersRes] = await Promise.all([
    dbQuery<{ total_cents: string; orders: string }>(
      `SELECT COALESCE(SUM(unit_amount_cents * quantity), 0)::text AS total_cents,
              COUNT(DISTINCT order_id)::text AS orders
       FROM commerce_order_items
       WHERE creator_id::text = $1
         AND created_at >= now() - interval '30 days'`,
      [creatorId]
    ),
    dbQuery<{ creator_cents: string }>(
      `SELECT COALESCE(SUM(creator_amount_cents), 0)::text AS creator_cents
       FROM commissions
       WHERE creator_id::text = $1
         AND created_at >= now() - interval '30 days'`,
      [creatorId]
    ),
    dbQuery<{ views: string }>(
      `SELECT COALESCE(SUM(view_count), 0)::text AS views
       FROM videos
       WHERE creator_id::text = $1
         AND status = 'ready'
         AND COALESCE(published_at, created_at) >= now() - interval '30 days'`,
      [creatorId]
    ),
    dbQuery<{ followers: string }>(
      `SELECT COUNT(*)::text AS followers
       FROM follows
       WHERE following_user_id::text = $1
         AND created_at >= now() - interval '30 days'`,
      [creatorId]
    ),
  ]);

  return {
    salesCents: Number(salesRes.rows[0]?.total_cents || 0),
    orders: Number(salesRes.rows[0]?.orders || 0),
    commissionCents: Number(commissionsRes.rows[0]?.creator_cents || 0),
    views: Number(viewsRes.rows[0]?.views || 0),
    newFollowers: Number(followersRes.rows[0]?.followers || 0),
  };
}

async function loadSalesSeries(creatorId: string): Promise<DailyPoint[]> {
  const { rows } = await dbQuery<{ day: string; cents: string }>(
    `WITH days AS (
       SELECT generate_series(
         (now() - interval '29 days')::date,
         now()::date,
         interval '1 day'
       )::date AS day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(oi.unit_amount_cents * oi.quantity), 0)::text AS cents
     FROM days d
     LEFT JOIN commerce_order_items oi
       ON oi.creator_id::text = $1
      AND oi.created_at::date = d.day
     GROUP BY d.day
     ORDER BY d.day`,
    [creatorId]
  );
  return rows.map((r) => ({ day: r.day, cents: Number(r.cents || 0) }));
}

async function loadTopProducts(creatorId: string) {
  const { rows } = await dbQuery<{
    product_id: string | null;
    title: string | null;
    image_url: string | null;
    qty: string;
  }>(
    `SELECT oi.product_id::text AS product_id,
            COALESCE(mp.title, oi.title) AS title,
            mp.image_url AS image_url,
            COALESCE(SUM(oi.quantity), 0)::text AS qty
     FROM commerce_order_items oi
     LEFT JOIN marketplace_products mp ON mp.id = oi.product_id
     WHERE oi.creator_id::text = $1
       AND oi.created_at >= now() - interval '30 days'
     GROUP BY oi.product_id, mp.title, oi.title, mp.image_url
     ORDER BY SUM(oi.quantity) DESC
     LIMIT 5`,
    [creatorId]
  );
  return rows;
}

async function loadTopVideos(creatorId: string) {
  const { rows } = await dbQuery<{
    id: string;
    title: string;
    thumbnail_url: string | null;
    view_count: string;
    like_count: string;
    comment_count: string;
    score: string;
  }>(
    `SELECT id::text, title, thumbnail_url,
            view_count::text, like_count::text, comment_count::text,
            (view_count + like_count * 3 + comment_count * 5)::text AS score
     FROM videos
     WHERE creator_id::text = $1 AND status = 'ready'
     ORDER BY (view_count + like_count * 3 + comment_count * 5) DESC
     LIMIT 5`,
    [creatorId]
  );
  return rows;
}

async function loadPayoutPending(creatorId: string) {
  const [accountRes, pendingRes] = await Promise.all([
    dbQuery<{ payouts_enabled: boolean; account_status: string }>(
      `SELECT payouts_enabled, account_status
       FROM creator_connect_accounts
       WHERE creator_id::text = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [creatorId]
    ),
    dbQuery<{ pending_cents: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0)::text AS pending_cents
       FROM connect_transfers ct
       JOIN creator_connect_accounts cca ON cca.id = ct.connect_account_id
       WHERE cca.creator_id::text = $1
         AND ct.status = 'pending'`,
      [creatorId]
    ),
  ]);
  return {
    hasAccount: !!accountRes.rows[0],
    payoutsEnabled: !!accountRes.rows[0]?.payouts_enabled,
    accountStatus: accountRes.rows[0]?.account_status || null,
    pendingCents: Number(pendingRes.rows[0]?.pending_cents || 0),
  };
}

async function loadFunnel(creatorId: string) {
  try {
    const { rows } = await dbQuery<{
      views: string;
      product_clicks: string;
      cart_adds: string;
      purchases: string;
    }>(
      `WITH evt AS (
         SELECT event_type
         FROM feed_events fe
         JOIN videos v ON v.id = fe.video_id
         WHERE v.creator_id::text = $1
           AND fe.occurred_at >= now() - interval '30 days'
       )
       SELECT
         COUNT(*) FILTER (WHERE event_type IN ('video_view','view'))::text AS views,
         COUNT(*) FILTER (WHERE event_type IN ('product_click','purchase_click'))::text AS product_clicks,
         COUNT(*) FILTER (WHERE event_type IN ('add_to_cart','cart_add'))::text AS cart_adds,
         COUNT(*) FILTER (WHERE event_type IN ('purchase','order_placed'))::text AS purchases
       FROM evt`,
      [creatorId]
    );
    const r = rows[0];
    const views = Number(r?.views || 0);
    const clicks = Number(r?.product_clicks || 0);
    const carts = Number(r?.cart_adds || 0);
    const purchases = Number(r?.purchases || 0);
    if (views + clicks + carts + purchases === 0) return null;
    return { views, clicks, carts, purchases };
  } catch {
    return null;
  }
}

function Sparkline({ data }: { data: DailyPoint[] }) {
  const W = 600, H = 120, pad = 4;
  const max = Math.max(1, ...data.map((d) => d.cents));
  const bw = (W - pad * 2) / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" role="img" aria-label="Vânzări 30 zile">
      <defs>
        <linearGradient id="barGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const h = Math.max(1, ((d.cents / max) * (H - pad * 2)));
        const x = pad + i * bw;
        const y = H - pad - h;
        return (
          <rect
            key={d.day}
            x={x + 1}
            y={y}
            width={Math.max(1, bw - 2)}
            height={h}
            rx={2}
            fill="url(#barGrad)"
          >
            <title>{`${d.day}: ${formatCents(d.cents)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-[#E5E5E5] shadow-sm">
      <p className="text-[12px] font-bold text-[#6E6E80] uppercase tracking-wider">{label}</p>
      <p className="text-2xl sm:text-3xl font-black text-[#0D0D0D] mt-2">{value}</p>
      {hint && <p className="text-[11px] text-[#6E6E80] mt-1">{hint}</p>}
    </div>
  );
}

export default async function CreatorDashboard() {
  const creatorId = await getCreatorUserId();
  if (!creatorId) redirect("/");

  const [kpis, series, topProducts, topVideos, payout, funnel] = await Promise.all([
    loadKpis(creatorId).catch(() => ({ salesCents: 0, orders: 0, commissionCents: 0, views: 0, newFollowers: 0 })),
    loadSalesSeries(creatorId).catch(() => [] as DailyPoint[]),
    loadTopProducts(creatorId).catch(() => []),
    loadTopVideos(creatorId).catch(() => []),
    loadPayoutPending(creatorId).catch(() => ({ hasAccount: false, payoutsEnabled: false, accountStatus: null, pendingCents: 0 })),
    loadFunnel(creatorId),
  ]);

  return (
    <div className="space-y-6 animate-fadeIn mobile-page-bottom max-w-7xl mx-auto pb-[max(24px,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="text-3xl font-black text-[#0D0D0D]">Dashboard Creator</h1>
        <p className="text-[#6E6E80] mt-2">Bine ai venit! Aici poți urmări performanța clipurilor tale în ultimele 30 de zile.</p>
      </div>

      <StripeConnectCard variant="creator" />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Vânzări totale (30z)" value={formatCents(kpis.salesCents)} hint={`${fmtNum.format(kpis.orders)} comenzi`} />
        <KpiCard label="Comision încasat" value={formatCents(kpis.commissionCents)} hint="ultimele 30 zile" />
        <KpiCard label="Vizualizări video (30z)" value={fmtNum.format(kpis.views)} hint="clipuri publicate recent" />
        <KpiCard label="Followeri noi (30z)" value={fmtNum.format(kpis.newFollowers)} />
      </div>

      {/* Sales chart */}
      <section className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-[#0D0D0D]">Vânzări — ultimele 30 zile</h2>
          <span className="text-xs text-[#6E6E80]">Total: {formatCents(kpis.salesCents)}</span>
        </div>
        {series.length > 0 ? (
          <Sparkline data={series} />
        ) : (
          <p className="text-sm text-[#6E6E80]">Nu există date încă.</p>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top products */}
        <section className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
          <h2 className="text-lg font-bold text-[#0D0D0D] mb-3">Top 5 produse vândute</h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-[#6E6E80]">Niciun produs vândut în ultimele 30 de zile.</p>
          ) : (
            <ul className="space-y-3">
              {topProducts.map((p, i) => (
                <li key={`${p.product_id}-${i}`} className="flex items-center gap-3">
                  <span className="w-6 text-sm font-black text-[#7C3AED]">{i + 1}</span>
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-12 h-12 rounded-lg object-cover bg-[#F4F4F5]" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[#F4F4F5]" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0D0D0D] truncate">{p.title || "Produs"}</p>
                    <p className="text-xs text-[#6E6E80]">{fmtNum.format(Number(p.qty))} vândute</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Top videos */}
        <section className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
          <h2 className="text-lg font-bold text-[#0D0D0D] mb-3">Top 5 clipuri după engagement</h2>
          {topVideos.length === 0 ? (
            <p className="text-sm text-[#6E6E80]">Nu ai clipuri publicate încă.</p>
          ) : (
            <ul className="space-y-3">
              {topVideos.map((v, i) => (
                <li key={v.id} className="flex items-center gap-3">
                  <span className="w-6 text-sm font-black text-[#7C3AED]">{i + 1}</span>
                  {v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt="" className="w-12 h-16 rounded-lg object-cover bg-[#F4F4F5]" />
                  ) : (
                    <div className="w-12 h-16 rounded-lg bg-[#F4F4F5]" />
                  )}
                  <div className="flex-1 min-w-0">
                    <Link href={`/video/${v.id}`} className="text-sm font-semibold text-[#0D0D0D] truncate hover:underline block">
                      {v.title || "Clip"}
                    </Link>
                    <p className="text-xs text-[#6E6E80]">
                      {fmtNum.format(Number(v.view_count))} vizualizări · {fmtNum.format(Number(v.like_count))} aprecieri · {fmtNum.format(Number(v.comment_count))} comentarii
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Payout pending */}
      <section className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
        <h2 className="text-lg font-bold text-[#0D0D0D] mb-3">Câștiguri & plăți</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-[#6E6E80] uppercase font-bold tracking-wider">Comision (30z)</p>
            <p className="text-xl font-black text-[#0D0D0D] mt-1">{formatCents(kpis.commissionCents)}</p>
          </div>
          <div>
            <p className="text-xs text-[#6E6E80] uppercase font-bold tracking-wider">Plată în așteptare</p>
            <p className="text-xl font-black text-[#0D0D0D] mt-1">{formatCents(payout.pendingCents)}</p>
          </div>
          <div>
            <p className="text-xs text-[#6E6E80] uppercase font-bold tracking-wider">Stripe Connect</p>
            <p className="text-sm font-semibold text-[#0D0D0D] mt-1">
              {!payout.hasAccount ? "Neconfigurat" : payout.payoutsEnabled ? "Activ" : `În verificare (${payout.accountStatus || "în curs"})`}
            </p>
          </div>
        </div>
        <Link href="/creator/earnings" className="inline-flex items-center mt-4 min-h-[44px] px-3 -mx-3 rounded-lg text-sm font-bold text-[#7C3AED] hover:underline focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">
          Vezi detalii câștiguri →
        </Link>
      </section>

      {/* Funnel */}
      <section className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
        <h2 className="text-lg font-bold text-[#0D0D0D] mb-3">Funnel conversie (30z)</h2>
        {!funnel ? (
          <p className="text-sm text-[#6E6E80]">Date insuficiente — în curând.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Vizualizări", value: funnel.views },
              { label: "Click produs", value: funnel.clicks },
              { label: "Adăugat coș", value: funnel.carts },
              { label: "Cumpărare", value: funnel.purchases },
            ].map((step) => (
              <div key={step.label} className="bg-gradient-to-br from-[#7C3AED]/5 to-[#A855F7]/5 rounded-xl p-3">
                <p className="text-[11px] text-[#6E6E80] uppercase font-bold tracking-wider">{step.label}</p>
                <p className="text-lg font-black text-[#0D0D0D] mt-1">{fmtNum.format(step.value)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
