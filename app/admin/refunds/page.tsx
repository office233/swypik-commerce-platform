/**
 * Admin Refunds View — listă restituiri Stripe
 * Read-only: refund-urile sunt inițiate de seller sau via Stripe webhook.
 */
import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending: "În procesare",
  succeeded: "Reușit",
  failed: "Eșuat",
  cancelled: "Anulat",
  refunded: "Restituit",
};

async function getRefunds() {
  try {
    const { rows } = await dbQuery(
      `SELECT pt.id,
              pt.order_id,
              pt.amount_cents,
              pt.currency,
              pt.status,
              pt.provider_payment_id,
              pt.processed_at,
              pt.created_at,
              pt.metadata,
              co.metadata AS order_metadata,
              u.email AS buyer_email,
              u.username AS buyer_username
         FROM payment_transactions pt
         LEFT JOIN commerce_orders co ON co.id = pt.order_id
         LEFT JOIN users u ON u.id = co.buyer_user_id
        WHERE pt.transaction_type = 'refund'
        ORDER BY pt.created_at DESC
        LIMIT 100`
    );
    return rows;
  } catch (err) {
    console.error("[admin/refunds] query error", err);
    return [];
  }
}

export default async function AdminRefundsPage() {
  const t = await getTranslations("refunds");
  const items = await getRefunds();

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-[#0D0D0D]">Restituiri</h1>
        <p className="text-sm text-gray-600 mt-1">

          {t("refunduriStripeInitierePrin")}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E5E5E5] overflow-x-auto">
        <table className="w-full text-left min-w-[800px]">
          <thead className="bg-[#F7F7F8] border-b border-[#E5E5E5] text-sm font-bold text-[#0D0D0D]">
            <tr>
              <th className="px-4 py-3">Refund ID</th>
              <th className="px-4 py-3">{t("comanda")}</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">{t("suma")}</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Procesat</th>
              <th className="px-4 py-3">Creat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E5] text-sm">
            {items.map((row: any) => {
              const orderMeta = row.order_metadata || {};
              const buyer =
                row.buyer_email || row.buyer_username || orderMeta.customer_email || "Anonim";
              const amount = ((row.amount_cents || 0) / 100).toFixed(2);
              const currency = (row.currency || "RON").toUpperCase();
              const refundId = row.provider_payment_id || row.id;
              return (
                <tr key={row.id} className="hover:bg-[#F7F7F8]/50 transition">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {String(refundId).slice(0, 18)}…
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {row.order_id ? (
                      <Link
                        href={`/admin/orders/${row.order_id}`}
                        className="hover:text-[#0D0D0D] hover:underline"
                      >
                        {String(row.order_id).split("-")[0]}…
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{buyer}</td>
                  <td className="px-4 py-3 font-medium text-[#0D0D0D]">
                    {amount} {currency}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700">
                      {STATUS_LABELS[row.status] || row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {row.processed_at
                      ? new Date(row.processed_at).toLocaleString("ro-RO")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(row.created_at).toLocaleString("ro-RO")}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-gray-500">

                  {t("nuExistaRestituiriInregistrate")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
