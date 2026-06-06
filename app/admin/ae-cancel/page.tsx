import { dbQuery } from "@/lib/db";
import Link from "next/link";
import AECancelClient from "./AECancelClient";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type Row = {
  item_id: string;
  order_id: string;
  title: string;
  quantity: number;
  ae_order_id: string | null;
  source_status: string;
  refunded_at: string | null;
  refund_amount_cents: number | null;
  updated_at: string;
  buyer_email: string | null;
};

async function getPending(): Promise<Row[]> {
  const { rows } = await dbQuery<Row>(
    `SELECT coi.id::text                                              AS item_id,
            coi.order_id::text                                        AS order_id,
            coi.title,
            coi.quantity,
            coi.metadata->>'ae_order_id'                              AS ae_order_id,
            coi.source_status,
            coi.metadata->>'refunded_at'                              AS refunded_at,
            NULLIF(coi.metadata->>'refund_amount_cents','')::int      AS refund_amount_cents,
            coi.updated_at::text                                      AS updated_at,
            u.email                                                   AS buyer_email
       FROM commerce_order_items coi
       JOIN commerce_orders co ON co.id = coi.order_id
       LEFT JOIN users u ON u.id = co.buyer_user_id
      WHERE (coi.metadata->>'ae_cancel_required')::boolean = true
        AND COALESCE(coi.metadata->>'ae_cancel_resolved_at','') = ''
      ORDER BY coi.updated_at DESC
      LIMIT 200`,
  );
  return rows;
}

async function getResolvedRecent(): Promise<(Row & { resolved_at: string; status_resolved: string })[]> {
  const { rows } = await dbQuery<Row & { resolved_at: string; status_resolved: string }>(
    `SELECT coi.id::text                                              AS item_id,
            coi.order_id::text                                        AS order_id,
            coi.title,
            coi.quantity,
            coi.metadata->>'ae_order_id'                              AS ae_order_id,
            coi.source_status,
            coi.metadata->>'refunded_at'                              AS refunded_at,
            NULLIF(coi.metadata->>'refund_amount_cents','')::int      AS refund_amount_cents,
            coi.updated_at::text                                      AS updated_at,
            u.email                                                   AS buyer_email,
            coi.metadata->>'ae_cancel_resolved_at'                    AS resolved_at,
            COALESCE(coi.metadata->>'ae_cancel_status','cancelled')   AS status_resolved
       FROM commerce_order_items coi
       JOIN commerce_orders co ON co.id = coi.order_id
       LEFT JOIN users u ON u.id = co.buyer_user_id
      WHERE (coi.metadata->>'ae_cancel_required')::boolean = true
        AND COALESCE(coi.metadata->>'ae_cancel_resolved_at','') <> ''
      ORDER BY (coi.metadata->>'ae_cancel_resolved_at')::timestamptz DESC
      LIMIT 50`,
  );
  return rows;
}

function fmtMoney(cents: number | null): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" }).format(cents / 100);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default async function AdminAECancelPage() {
  const t = await getTranslations("aecancel");
  const [pending, resolved] = await Promise.all([getPending(), getResolvedRecent()]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-[#0D0D0D]">AliExpress Cancel Queue</h1>
        <p className="text-sm text-gray-600 mt-1">

          {t("itemsRefundateCuComanda")}
        </p>
      </div>

      <section className="mb-10">
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-lg font-bold text-[#0D0D0D]">

            {t("inAsteptare")} <span className="text-gray-500 font-normal">({pending.length})</span>
          </h2>
        </div>

        {pending.length === 0 ? (
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-8 text-center text-sm text-gray-500">

            {t("nicioCerereDeCancel")}
          </div>
        ) : (
          <div className="bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3">Produs</th>
                    <th className="text-left px-4 py-3">Order / Buyer</th>
                    <th className="text-left px-4 py-3">AE Order</th>
                    <th className="text-right px-4 py-3">Refund</th>
                    <th className="text-left px-4 py-3">{t("refundatLa")}</th>
                    <th className="text-right px-4 py-3">{t("actiuni")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((r) => (
                    <tr key={r.item_id} className="border-t border-[#E5E5E5]">
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-[#0D0D0D] truncate max-w-[280px]" title={r.title}>{r.title}</div>
                        <div className="text-xs text-gray-500">qty {r.quantity} · status {r.source_status}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/admin/orders/${r.order_id}`}
                          className="text-xs font-mono text-violet-700 hover:underline"
                        >
                          {r.order_id.slice(0, 8)}…
                        </Link>
                        <div className="text-xs text-gray-500 truncate max-w-[180px]" title={r.buyer_email || ""}>
                          {r.buyer_email || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {r.ae_order_id ? (
                          <span className="text-xs font-mono">{r.ae_order_id}</span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right font-mono">{fmtMoney(r.refund_amount_cents)}</td>
                      <td className="px-4 py-3 align-top text-xs text-gray-600">{fmtDate(r.refunded_at)}</td>
                      <td className="px-4 py-3 align-top text-right">
                        <AECancelClient itemId={r.item_id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#0D0D0D] mb-3">
          Rezolvate recent <span className="text-gray-500 font-normal">({resolved.length})</span>
        </h2>
        {resolved.length === 0 ? (
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 text-center text-sm text-gray-500">

            {t("nimicRezolvatInca")}
          </div>
        ) : (
          <div className="bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3">Produs</th>
                    <th className="text-left px-4 py-3">Order</th>
                    <th className="text-left px-4 py-3">AE Order</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">{t("rezolvatLa")}</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.map((r) => (
                    <tr key={r.item_id} className="border-t border-[#E5E5E5]">
                      <td className="px-4 py-3 truncate max-w-[260px]" title={r.title}>{r.title}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/orders/${r.order_id}`}
                          className="text-xs font-mono text-violet-700 hover:underline"
                        >
                          {r.order_id.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{r.ae_order_id || "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            r.status_resolved === "uncancelable"
                              ? "px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-semibold"
                              : "px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-semibold"
                          }
                        >
                          {r.status_resolved}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(r.resolved_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
