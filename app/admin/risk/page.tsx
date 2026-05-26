import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { scoreOrderRisk, type OrderRiskScore } from "@/lib/risk/order-fraud-score";
import { FraudActions } from "./FraudActions";
import { UserFraudActions } from "./UserFraudActions";

export const dynamic = "force-dynamic";

type Metrics7d = {
  totalDecisions: number;
  approvals: number;
  blocks: number;
  autoBlocks: number;
  flaggedOrders: number;
  blockRate: number; // % of flagged that ended blocked
  approveRate: number;
};

async function getMetrics7d(): Promise<Metrics7d> {
  const { rows: dec } = await dbQuery<{ approvals: number; blocks: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE (metadata->'fraud_last_decision'->>'action') = 'approve')::int AS approvals,
       COUNT(*) FILTER (WHERE (metadata->'fraud_last_decision'->>'action') = 'block')::int AS blocks
       FROM commerce_orders
      WHERE (metadata->'fraud_last_decision'->>'at')::timestamptz > now() - interval '7 days'`,
  );
  const { rows: flagged } = await dbQuery<{ flagged: number }>(
    `SELECT COUNT(*)::int AS flagged FROM commerce_orders
      WHERE created_at > now() - interval '7 days'
        AND COALESCE((metadata->>'fraud_score')::int, 0) >= 50`,
  );
  const { rows: autoB } = await dbQuery<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM user_fraud_decisions
      WHERE action = 'auto_block' AND decided_at > now() - interval '7 days'`,
  );
  const approvals = dec[0]?.approvals || 0;
  const blocks = dec[0]?.blocks || 0;
  const totalDecisions = approvals + blocks;
  const flaggedOrders = flagged[0]?.flagged || 0;
  return {
    totalDecisions,
    approvals,
    blocks,
    autoBlocks: autoB[0]?.c || 0,
    flaggedOrders,
    blockRate: totalDecisions ? Math.round((blocks / totalDecisions) * 100) : 0,
    approveRate: totalDecisions ? Math.round((approvals / totalDecisions) * 100) : 0,
  };
}

type BlockedUser = {
  id: string;
  email: string | null;
  username: string | null;
  blocked_at: string | null;
  reason: string | null;
  blocked_by: string | null;
  recreation_signal: string | null;
  recreation_of: string | null;
  flagged_orders_count: number;
};

async function getBlockedUsers(): Promise<BlockedUser[]> {
  const { rows } = await dbQuery<BlockedUser>(
    `SELECT u.id::text, u.email, u.username,
            u.metadata->'fraud_user_block'->>'blocked_at' AS blocked_at,
            u.metadata->'fraud_user_block'->>'reason' AS reason,
            u.metadata->'fraud_user_block'->>'blocked_by' AS blocked_by,
            u.metadata->'fraud_user_block'->>'recreation_signal' AS recreation_signal,
            u.metadata->'fraud_user_block'->>'recreation_of' AS recreation_of,
            (SELECT COUNT(*)::int FROM commerce_orders co
               WHERE co.buyer_user_id = u.id
                 AND COALESCE((co.metadata->>'fraud_score')::int, 0) >= 50
                 AND co.created_at > now() - interval '30 days') AS flagged_orders_count
       FROM users u
      WHERE (u.metadata->'fraud_user_block'->>'blocked')::boolean = true
      ORDER BY (u.metadata->'fraud_user_block'->>'blocked_at') DESC NULLS LAST
      LIMIT 50`,
  );
  return rows;
}

type SearchParams = { status?: string; min?: string };

type Row = {
  id: string;
  status: string;
  buyer_user_id: string | null;
  currency: string;
  total_cents: number;
  created_at: string;
  metadata: any;
  buyer_email: string | null;
  buyer_phone: string | null;
  buyer_email_verified_at: string | null;
  buyer_phone_verified_at: string | null;
  buyer_created_at: string | null;
  prior_paid: number;
  prior_disputes: number;
  prior_chargebacks_lost: number;
};

async function getOrders(statusFilter: string | undefined): Promise<Row[]> {
  const conditions: string[] = ["co.created_at > now() - interval '90 days'"];
  const args: any[] = [];
  if (statusFilter && statusFilter !== "all") {
    args.push(statusFilter);
    conditions.push(`co.status = $${args.length}`);
  }

  const { rows } = await dbQuery<Row>(
    `SELECT co.id::text, co.status, co.buyer_user_id::text,
            co.currency, co.total_cents, co.created_at::text, co.metadata,
            u.email AS buyer_email,
            u.phone AS buyer_phone,
            u.email_verified_at::text AS buyer_email_verified_at,
            u.phone_verified_at::text AS buyer_phone_verified_at,
            u.created_at::text AS buyer_created_at,
            (SELECT COUNT(*)::int FROM commerce_orders co2
              WHERE co2.buyer_user_id = co.buyer_user_id
                AND co2.status IN ('paid','fulfilled','delivered')
                AND co2.id <> co.id) AS prior_paid,
            (SELECT COUNT(*)::int FROM stripe_disputes d
              JOIN commerce_orders co3 ON co3.id = d.order_id
              WHERE co3.buyer_user_id = co.buyer_user_id) AS prior_disputes,
            (SELECT COUNT(*)::int FROM stripe_disputes d
              JOIN commerce_orders co3 ON co3.id = d.order_id
              WHERE co3.buyer_user_id = co.buyer_user_id
                AND d.status IN ('lost','dispute_lost')) AS prior_chargebacks_lost
       FROM commerce_orders co
       LEFT JOIN users u ON u.id = co.buyer_user_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY co.created_at DESC
      LIMIT 500`,
    args,
  );
  return rows;
}

function computeScore(row: Row): OrderRiskScore {
  const md = row.metadata || {};
  const ship = md.shipping_address || {};
  const bill = md.billing_address || {};
  const items = Array.isArray(md.items) ? md.items : [];
  const itemCount = Number(md.item_count) || items.length || 1;
  const accountAgeDays = row.buyer_created_at
    ? Math.floor((Date.now() - new Date(row.buyer_created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  return scoreOrderRisk({
    totalCents: row.total_cents,
    currency: row.currency,
    itemCount,
    hasShippingAddress: Boolean(ship.line1 || ship.address_line_1),
    shippingCountry: ship.country || null,
    billingCountry: bill.country || null,
    ipCountry: md.checkout_ip_country || null,
    email: row.buyer_email,
    phone: row.buyer_phone,
    buyerAccountAgeDays: row.buyer_user_id ? accountAgeDays : null,
    emailVerified: Boolean(row.buyer_email_verified_at),
    phoneVerified: Boolean(row.buyer_phone_verified_at),
    priorPaidOrders: row.prior_paid,
    priorDisputes: row.prior_disputes,
    priorChargebacksLost: row.prior_chargebacks_lost,
  });
}

function levelBadge(level: OrderRiskScore["level"]): { bg: string; text: string; label: string } {
  switch (level) {
    case "critical":
      return { bg: "bg-red-600", text: "text-white", label: "CRITIC" };
    case "high":
      return { bg: "bg-orange-500", text: "text-white", label: "ÎNALT" };
    case "medium":
      return { bg: "bg-amber-100", text: "text-amber-900", label: "MEDIU" };
    case "low":
      return { bg: "bg-emerald-100", text: "text-emerald-900", label: "SCĂZUT" };
  }
}

function fmtMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

export default async function AdminRiskPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status || "paid";
  const minScore = Number(sp.min || "0");

  const [rows, metrics, blockedUsers] = await Promise.all([
    getOrders(statusFilter === "all" ? undefined : statusFilter),
    getMetrics7d(),
    getBlockedUsers(),
  ]);
  const scored = rows
    .map((r) => ({ row: r, risk: computeScore(r) }))
    .filter((x) => x.risk.score >= minScore)
    .sort((a, b) => b.risk.score - a.risk.score);

  const summary = {
    critical: scored.filter((x) => x.risk.level === "critical").length,
    high: scored.filter((x) => x.risk.level === "high").length,
    medium: scored.filter((x) => x.risk.level === "medium").length,
    low: scored.filter((x) => x.risk.level === "low").length,
  };

  return (
    <main className="max-w-7xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#0D0D0D]">Risc fraudă comenzi</h1>
          <p className="text-xs text-gray-500 mt-1">
            Scoring 0-100 per comandă (90 zile). Mai mare = risc mai mare. Review manual recomandat pentru ≥50.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-xs text-violet-700 hover:underline"
        >
          ← Admin home
        </Link>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <div className="text-xs text-red-700 font-semibold uppercase tracking-wider">Critic</div>
          <div className="text-2xl font-bold text-red-900">{summary.critical}</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded p-3">
          <div className="text-xs text-orange-700 font-semibold uppercase tracking-wider">Înalt</div>
          <div className="text-2xl font-bold text-orange-900">{summary.high}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-3">
          <div className="text-xs text-amber-700 font-semibold uppercase tracking-wider">Mediu</div>
          <div className="text-2xl font-bold text-amber-900">{summary.medium}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
          <div className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">Scăzut</div>
          <div className="text-2xl font-bold text-emerald-900">{summary.low}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 text-xs">
        {[
          { k: "paid", label: "Paid (de fulfilla)" },
          { k: "pending", label: "Pending" },
          { k: "fulfilled", label: "Fulfilled" },
          { k: "all", label: "Toate" },
        ].map((f) => (
          <Link
            key={f.k}
            href={`/admin/risk?status=${f.k}${minScore > 0 ? `&min=${minScore}` : ""}`}
            className={`px-3 py-1.5 rounded font-medium ${
              statusFilter === f.k
                ? "bg-violet-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <span className="ml-auto self-center text-gray-500">
          Filtrează min score:
        </span>
        {[0, 30, 50, 70].map((m) => (
          <Link
            key={m}
            href={`/admin/risk?status=${statusFilter}&min=${m}`}
            className={`px-2 py-1.5 rounded ${
              minScore === m ? "bg-violet-100 text-violet-800 font-semibold" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            ≥{m}
          </Link>
        ))}
      </div>

      {/* Metrics 7d */}
      <div className="bg-white border border-[#E5E5E5] rounded p-3">
        <div className="text-xs font-semibold text-gray-700 mb-2">📊 Activitate ultimele 7 zile</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500">Comenzi flagged</div>
            <div className="text-lg font-bold text-gray-900">{metrics.flaggedOrders}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-emerald-700">Aprobate</div>
            <div className="text-lg font-bold text-emerald-700">
              {metrics.approvals}{" "}
              <span className="text-[10px] font-normal text-gray-500">({metrics.approveRate}%)</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-red-700">Blocate (manual)</div>
            <div className="text-lg font-bold text-red-700">
              {metrics.blocks}{" "}
              <span className="text-[10px] font-normal text-gray-500">({metrics.blockRate}%)</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-orange-700">User auto-block</div>
            <div className="text-lg font-bold text-orange-700">{metrics.autoBlocks}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500">Total decizii</div>
            <div className="text-lg font-bold text-gray-900">{metrics.totalDecisions}</div>
          </div>
        </div>
        {metrics.blockRate > 60 && metrics.totalDecisions >= 5 && (
          <div className="mt-2 text-[11px] bg-red-50 text-red-800 px-2 py-1 rounded">
            ⚠ Rate de block ridicată ({metrics.blockRate}%) — verifică dacă weight-urile scoring nu produc false positives.
          </div>
        )}
        {metrics.approveRate > 80 && metrics.totalDecisions >= 5 && (
          <div className="mt-2 text-[11px] bg-amber-50 text-amber-800 px-2 py-1 rounded">
            ℹ Rate de approve ridicată ({metrics.approveRate}%) — scoring poate fi prea agresiv, ridică pragul de review.
          </div>
        )}
      </div>

      {/* Blocked users */}
      {blockedUsers.length > 0 && (
        <details className="bg-red-50 border border-red-200 rounded p-3" open={blockedUsers.length <= 3}>
          <summary className="text-xs font-semibold text-red-900 cursor-pointer list-none flex items-center justify-between">
            <span>🚫 Useri blocați ({blockedUsers.length})</span>
            <span className="text-[10px] font-normal text-red-700">click pentru detalii</span>
          </summary>
          <div className="mt-2 space-y-1.5">
            {blockedUsers.map((u) => (
              <div
                key={u.id}
                className="bg-white border border-red-100 rounded p-2 flex items-start justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-900 truncate flex items-center gap-1.5">
                    {u.recreation_signal && (
                      <span
                        title={`Recreation of ${u.recreation_of?.slice(0, 8) || "?"} via ${u.recreation_signal}`}
                        className="shrink-0 text-[9px] font-bold uppercase bg-fuchsia-600 text-white px-1.5 py-0.5 rounded"
                      >
                        ↻ {u.recreation_signal}
                      </span>
                    )}
                    <span className="truncate">
                      {u.email || u.username || "(no email)"}{" "}
                      <span className="text-[10px] font-normal text-gray-500">
                        · {u.flagged_orders_count} flagged / 30d
                      </span>
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-600 truncate">
                    <code className="font-mono text-[10px] text-gray-500">{u.id.slice(0, 8)}</code>
                    {u.blocked_by && ` · ${u.blocked_by}`}
                    {u.blocked_at && ` · ${new Date(u.blocked_at).toLocaleString("ro-RO")}`}
                  </div>
                  {u.reason && (
                    <div className="text-[11px] italic text-gray-700 mt-0.5 truncate">{u.reason}</div>
                  )}
                </div>
                <UserFraudActions userId={u.id} blocked={true} />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Orders list */}
      {scored.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-6 text-center text-emerald-800 text-sm">
          ✅ Nicio comandă cu risc ≥{minScore} în ultimele 90 zile pentru status <strong>{statusFilter}</strong>.
        </div>
      ) : (
        <div className="space-y-2">
          {scored.map(({ row, risk }) => {
            const badge = levelBadge(risk.level);
            const positives = risk.factors.filter((f) => f.delta > 0);
            const negatives = risk.factors.filter((f) => f.delta < 0);
            return (
              <details
                key={row.id}
                className="bg-white border border-[#E5E5E5] rounded p-3 group"
              >
                <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={`shrink-0 ${badge.bg} ${badge.text} font-bold text-xs px-2.5 py-1 rounded`}
                      title={risk.recommendation}
                    >
                      {risk.score}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.bg} ${badge.text} opacity-80`}
                    >
                      {badge.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#0D0D0D] truncate">
                        {row.buyer_email || "(guest)"}{" "}
                        <span className="text-xs text-gray-500 font-normal">
                          · {fmtMoney(row.total_cents, row.currency)} · {row.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        Order <code className="font-mono">{row.id.slice(0, 8)}</code> ·{" "}
                        {new Date(row.created_at).toLocaleString("ro-RO")}
                        {row.prior_paid > 0 && ` · ${row.prior_paid} comenzi anterioare`}
                        {row.prior_disputes > 0 && ` · ⚠ ${row.prior_disputes} dispute prior`}
                      </div>
                    </div>
                  </div>
                  {risk.blockSuggested && (
                    <span className="shrink-0 text-[10px] font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                      🛑 BLOCHEAZĂ
                    </span>
                  )}
                </summary>

                <div className="mt-3 pt-3 border-t border-[#E5E5E5] space-y-3">
                  <div className="text-xs bg-violet-50 text-violet-900 px-2 py-1.5 rounded">
                    💡 {risk.recommendation}
                  </div>

                  {positives.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-red-700 mb-1">
                        ⚠ Semnale negative ({positives.length})
                      </div>
                      <ul className="space-y-0.5 text-xs">
                        {positives.map((f, i) => (
                          <li key={i} className="flex justify-between gap-2 bg-red-50 px-2 py-0.5 rounded">
                            <span className="text-gray-800">{f.note}</span>
                            <span className="text-red-700 font-mono font-bold">+{f.delta}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {negatives.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-emerald-700 mb-1">
                        ✓ Semnale pozitive ({negatives.length})
                      </div>
                      <ul className="space-y-0.5 text-xs">
                        {negatives.map((f, i) => (
                          <li key={i} className="flex justify-between gap-2 bg-emerald-50 px-2 py-0.5 rounded">
                            <span className="text-gray-800">{f.note}</span>
                            <span className="text-emerald-700 font-mono font-bold">{f.delta}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {row.metadata?.fraud_last_decision && (
                    <div className="text-xs bg-blue-50 text-blue-900 px-2 py-1.5 rounded">
                      <span className="font-semibold">Ultima decizie:</span>{" "}
                      <span className="font-mono">{row.metadata.fraud_last_decision.action}</span>{" "}
                      la{" "}
                      {new Date(row.metadata.fraud_last_decision.at).toLocaleString("ro-RO")}
                      {row.metadata.fraud_last_decision.reason && (
                        <>
                          {" — "}
                          <em>{row.metadata.fraud_last_decision.reason}</em>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1 items-center flex-wrap">
                    <Link
                      href={`/admin/orders/${row.id}`}
                      className="text-xs px-2.5 py-1 rounded bg-violet-100 text-violet-800 hover:bg-violet-200 font-semibold"
                    >
                      Vezi comanda →
                    </Link>
                    <FraudActions
                      orderId={row.id}
                      blocked={row.metadata?.fraud_block === true}
                    />
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </main>
  );
}
