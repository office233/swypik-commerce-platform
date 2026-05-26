import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { scoreOrderRisk, type OrderRiskScore } from "@/lib/risk/order-fraud-score";
import { SummaryCards } from "./SummaryCards";
import { RiskFilters } from "./RiskFilters";
import { Metrics7dPanel, type Metrics7d } from "./Metrics7dPanel";
import { BlockedUsersList, type BlockedUser } from "./BlockedUsersList";
import { OrderRiskCard, type OrderRow } from "./OrderRiskCard";

export const dynamic = "force-dynamic";

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
  return {
    totalDecisions,
    approvals,
    blocks,
    autoBlocks: autoB[0]?.c || 0,
    flaggedOrders: flagged[0]?.flagged || 0,
    blockRate: totalDecisions ? Math.round((blocks / totalDecisions) * 100) : 0,
    approveRate: totalDecisions ? Math.round((approvals / totalDecisions) * 100) : 0,
  };
}

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

async function getOrders(statusFilter: string | undefined): Promise<OrderRow[]> {
  const conditions: string[] = ["co.created_at > now() - interval '90 days'"];
  const args: any[] = [];
  if (statusFilter && statusFilter !== "all") {
    args.push(statusFilter);
    conditions.push(`co.status = $${args.length}`);
  }
  const { rows } = await dbQuery<OrderRow>(
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

function computeScore(row: OrderRow): OrderRiskScore {
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

type SearchParams = { status?: string; min?: string };

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
        <Link href="/admin" className="text-xs text-violet-700 hover:underline">
          ← Admin home
        </Link>
      </header>

      <SummaryCards summary={summary} />
      <RiskFilters statusFilter={statusFilter} minScore={minScore} />
      <Metrics7dPanel metrics={metrics} />
      <BlockedUsersList users={blockedUsers} />

      {scored.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-6 text-center text-emerald-800 text-sm">
          ✅ Nicio comandă cu risc ≥{minScore} în ultimele 90 zile pentru status <strong>{statusFilter}</strong>.
        </div>
      ) : (
        <div className="space-y-2">
          {scored.map(({ row, risk }) => (
            <OrderRiskCard key={row.id} row={row} risk={risk} />
          ))}
        </div>
      )}
    </main>
  );
}
