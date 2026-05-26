/**
 * Admin Returns Queue — cereri de retur clienți
 */
import Link from "next/link";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  requested: "Solicitat",
  approved: "Aprobat",
  rejected: "Respins",
  refunded: "Restituit",
};

type SearchParams = { status?: string };

async function getReturns(params: SearchParams) {
  const status = params.status || "all";
  const where: string[] = [
    "(co.metadata->>'return_status' IS NOT NULL OR co.status = 'return_requested')",
  ];
  const args: any[] = [];
  if (status !== "all" && STATUS_LABELS[status]) {
    args.push(status);
    where.push(`co.metadata->>'return_status' = $${args.length}`);
  }

  const sql = `
    SELECT co.id,
           co.status,
           co.total_cents,
           co.currency,
           co.created_at,
           co.metadata,
           u.email AS buyer_email,
           u.username AS buyer_username,
           (SELECT COUNT(*) FROM commerce_order_items coi WHERE coi.order_id = co.id)::int AS item_count
    FROM commerce_orders co
    LEFT JOIN users u ON u.id = co.buyer_user_id
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE((co.metadata->>'return_requested_at')::timestamptz, co.created_at) DESC
    LIMIT 100
  `;

  try {
    const { rows } = await dbQuery(sql, args);
    return rows;
  } catch (err) {
    console.error("[admin/returns] query error", err);
    return [];
  }
}

export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const activeStatus = sp.status || "all";
  const items = await getReturns(sp);

  const tabs: { value: string; label: string }[] = [
    { value: "all", label: "Toate" },
    { value: "requested", label: "Solicitate" },
    { value: "approved", label: "Aprobate" },
    { value: "rejected", label: "Respinse" },
    { value: "refunded", label: "Restituite" },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D0D0D]">Cereri de retur</h1>
          <p className="text-sm text-gray-600 mt-1">
            Returnări inițiate de clienți, în așteptarea unei decizii admin.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((t) => {
          const href =
            t.value === "all" ? "/admin/returns" : `/admin/returns?status=${t.value}`;
          const active = activeStatus === t.value;
          return (
            <Link
              key={t.value}
              href={href}
              className={`inline-flex items-center px-4 py-2.5 rounded-full text-xs font-bold border transition min-h-[40px] ${
                active
                  ? "bg-[#0D0D0D] text-white border-[#0D0D0D]"
                  : "bg-white text-gray-700 border-[#E5E5E5] hover:border-[#0D0D0D]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E5E5E5] overflow-x-auto">
        <table className="w-full text-left min-w-[900px]">
          <thead className="bg-[#F7F7F8] border-b border-[#E5E5E5] text-sm font-bold text-[#0D0D0D]">
            <tr>
              <th className="px-4 py-3">Comandă</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Articole</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Motiv</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Solicitat</th>
              <th className="px-4 py-3">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E5] text-sm">
            {items.map((row: any) => {
              const meta = row.metadata || {};
              const rs = meta.return_status || (row.status === "return_requested" ? "requested" : null);
              const reason = meta.return_reason || "—";
              const requestedAt = meta.return_requested_at || row.created_at;
              const buyer =
                row.buyer_email || row.buyer_username || meta.customer_email || "Anonim";
              const total = ((row.total_cents || 0) / 100).toFixed(2);
              const currency = (row.currency || "RON").toUpperCase();
              return (
                <tr key={row.id} className="hover:bg-[#F7F7F8]/50 transition align-top">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    <Link
                      href={`/admin/orders/${row.id}`}
                      className="hover:text-[#0D0D0D] hover:underline"
                    >
                      {String(row.id).split("-")[0]}…
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{buyer}</td>
                  <td className="px-4 py-3 text-gray-700">{row.item_count}</td>
                  <td className="px-4 py-3 font-medium text-[#0D0D0D]">
                    {total} {currency}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[260px]">
                    <span className="line-clamp-2">{reason}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700">
                      {rs ? STATUS_LABELS[rs] || rs : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {requestedAt ? new Date(requestedAt).toLocaleString("ro-RO") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ReturnActions orderId={row.id} status={rs} />
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-gray-500">
                  Nu sunt cereri de retur încă.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReturnActions({ orderId, status }: { orderId: string; status: string | null }) {
  const canAct = status === "requested" || status === null;
  if (!canAct) {
    return (
      <Link
        href={`/admin/orders/${orderId}`}
        className="text-xs font-bold text-gray-600 hover:text-[#0D0D0D]"
      >
        Vezi
      </Link>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      <Link
        href={`/admin/orders/${orderId}`}
        className="px-2 py-1 rounded text-[11px] font-bold border border-[#E5E5E5] text-gray-700 hover:bg-[#F7F7F8]"
      >
        Vezi
      </Link>
      <ApproveButton orderId={orderId} />
      <RejectButton orderId={orderId} />
    </div>
  );
}

function ApproveButton({ orderId }: { orderId: string }) {
  return (
    <form
      action={`/api/admin/returns/${orderId}/approve`}
      method="post"
      className="inline"
    >
      <button
        type="submit"
        className="px-2 py-1 rounded text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700"
      >
        Aprobă
      </button>
    </form>
  );
}

function RejectButton({ orderId }: { orderId: string }) {
  return (
    <form
      action={`/api/admin/returns/${orderId}/reject`}
      method="post"
      className="inline"
    >
      <input type="hidden" name="reason" value="Respinsă de admin" />
      <button
        type="submit"
        className="px-2 py-1 rounded text-[11px] font-bold bg-rose-600 text-white hover:bg-rose-700"
      >
        Respinge
      </button>
    </form>
  );
}
