/**
 * Server component: bandă cu 5 metrici operationale actionable în topul dashboard-ului.
 * Un singur query SQL agregat → 5 carduri cu link direct către pagina relevantă.
 */
import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { Shield, RotateCcw, Coins, AlertTriangle, ShieldAlert, Inbox, CheckCircle2 } from "lucide-react";

type Counts = {
  disputes_pending: number;
  disputes_urgent: number;
  returns_pending: number;
  refunds_pending: number;
  stale_pending_orders: number;
  risky_orders_7d: number;
  partner_apps_pending: number;
};

async function getCounts(): Promise<Counts> {
  const { rows } = await dbQuery<Record<keyof Counts, string>>(`
    SELECT
      (SELECT COUNT(*) FROM stripe_disputes
        WHERE status IN ('needs_response','warning_needs_response')
          AND evidence_submitted = false) AS disputes_pending,
      (SELECT COUNT(*) FROM stripe_disputes
        WHERE status IN ('needs_response','warning_needs_response')
          AND evidence_submitted = false
          AND evidence_due_by < now() + interval '24 hours') AS disputes_urgent,
      (SELECT COUNT(*) FROM commerce_orders
        WHERE status = 'return_requested'
           OR (metadata->>'return_status') = 'requested') AS returns_pending,
      (SELECT COUNT(*) FROM payment_transactions
        WHERE transaction_type = 'refund'
          AND status IN ('pending','processing','requires_action')) AS refunds_pending,
      (SELECT COUNT(*) FROM commerce_orders
        WHERE status IN ('pending_payment','pending')
          AND created_at < now() - interval '24 hours') AS stale_pending_orders,
      (SELECT COUNT(*) FROM commerce_orders co
        LEFT JOIN users u ON u.id = co.buyer_user_id
        WHERE co.created_at > now() - interval '7 days'
          AND co.status = 'paid'
          AND (
            co.buyer_user_id IS NULL
            OR u.email_verified_at IS NULL
            OR co.total_cents > 200000
            OR (u.created_at IS NOT NULL AND u.created_at > now() - interval '7 days')
          )) AS risky_orders_7d,
      (
        COALESCE((SELECT COUNT(*) FROM couriers WHERE verification_status = 'pending'), 0)
        + COALESCE((SELECT COUNT(*) FROM fleet_partners WHERE status = 'pending'), 0)
        + COALESCE((SELECT COUNT(*) FROM sellers WHERE status = 'pending'), 0)
        + COALESCE((SELECT COUNT(*) FROM host_applications WHERE status IN ('pending','needs_info')), 0)
        + COALESCE((SELECT COUNT(*) FROM creator_applications WHERE status IN ('submitted','in_review')), 0)
      ) AS partner_apps_pending
  `);
  const r = rows[0] || ({} as any);
  return {
    disputes_pending: Number(r.disputes_pending || 0),
    disputes_urgent: Number(r.disputes_urgent || 0),
    returns_pending: Number(r.returns_pending || 0),
    refunds_pending: Number(r.refunds_pending || 0),
    stale_pending_orders: Number(r.stale_pending_orders || 0),
    risky_orders_7d: Number(r.risky_orders_7d || 0),
    partner_apps_pending: Number(r.partner_apps_pending || 0),
  };
}

type Card = {
  href: string;
  label: string;
  count: number;
  Icon: React.ComponentType<{ className?: string }>;
  badgeText?: string | null;
  tone: "ok" | "warn" | "danger";
};

function cardClasses(tone: Card["tone"]): string {
  if (tone === "danger") return "border-red-300 bg-red-50 hover:bg-red-100 text-red-900";
  if (tone === "warn") return "border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-900";
  return "border-[#E5E5E5] bg-white hover:bg-gray-50 text-gray-700";
}

export default async function OpsAlertsBar() {
  let counts: Counts;
  try {
    counts = await getCounts();
  } catch {
    return null;
  }

  const cards: Card[] = [
    {
      href: "/admin/aplicatii?f=pending",
      label: "Aplicații",
      count: counts.partner_apps_pending,
      Icon: Inbox,
      tone: counts.partner_apps_pending > 5 ? "danger" : counts.partner_apps_pending > 0 ? "warn" : "ok",
    },
    {
      href: "/admin/disputes?status=needs_response",
      label: "Disputes",
      count: counts.disputes_pending,
      Icon: Shield,
      badgeText: counts.disputes_urgent > 0 ? `${counts.disputes_urgent} <24h` : null,
      tone: counts.disputes_urgent > 0 ? "danger" : counts.disputes_pending > 0 ? "warn" : "ok",
    },
    {
      href: "/admin/returns?status=requested",
      label: "Returns",
      count: counts.returns_pending,
      Icon: RotateCcw,
      tone: counts.returns_pending > 10 ? "danger" : counts.returns_pending > 0 ? "warn" : "ok",
    },
    {
      href: "/admin/refunds",
      label: "Refunds",
      count: counts.refunds_pending,
      Icon: Coins,
      tone: counts.refunds_pending > 0 ? "warn" : "ok",
    },
    {
      href: "/admin/orders?status=pending_payment",
      label: "Pending >24h",
      count: counts.stale_pending_orders,
      Icon: AlertTriangle,
      tone: counts.stale_pending_orders > 0 ? "warn" : "ok",
    },
    {
      href: "/admin/risk?status=paid&min=50",
      label: "Risc fraudă",
      count: counts.risky_orders_7d,
      Icon: ShieldAlert,
      tone: counts.risky_orders_7d > 3 ? "danger" : counts.risky_orders_7d > 0 ? "warn" : "ok",
    },
  ];

  const totalAlerts = cards.reduce((s, c) => s + (c.tone !== "ok" ? c.count : 0), 0);
  if (totalAlerts === 0) {
    return (
      <div className="mb-6 bg-green-50 border border-green-200 rounded-2xl p-3 text-sm text-green-800 flex items-center gap-1.5">
        <CheckCircle2 size={16} /> Niciun alert operational. Toate cozile sunt curate.
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Ops alerts
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className={`block border rounded-2xl p-3 transition ${cardClasses(c.tone)}`}
          >
            <div className="flex items-center gap-2">
              <c.Icon className="w-4 h-4" />
              <span className="text-xs font-semibold truncate">{c.label}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-2xl font-black">{c.count}</span>
              {c.badgeText && (
                <span className="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">
                  {c.badgeText}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
