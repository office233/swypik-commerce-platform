import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { deriveOrderStatus } from "@/lib/commerce/order-status";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  total_cents: number | null;
  status: string;
  created_at: string;
  metadata: any; // jsonb col with variable shape
};

type FormattedOrder = {
  id: string;
  client: string;
  total: number;
  status: string;
  statusLabel: string;
  statusDetail: string;
  trackingNumber: string | null;
  data: string;
  fraudScore: number | null;
  fraudLevel: string | null;
  fraudBlock: boolean;
  fraudReview: boolean;
};

export default async function OrdersAdminPage() {
  let orders: FormattedOrder[] = [];
  let loadError: string | null = null;

  try {
    const res = await dbQuery(
      `SELECT id, total_cents, status, created_at, metadata
       FROM commerce_orders
       ORDER BY created_at DESC
       LIMIT 100`
    );

    orders = (res.rows as OrderRow[]).map((o) => {
      const derived = deriveOrderStatus({
        status: o.status,
        fulfillmentStatus: o.metadata?.fulfillment_status,
        metadata: o.metadata,
        trackingNumber: o.metadata?.tracking_number || o.metadata?.latest_tracking_number,
      });

      return {
        id: o.id,
        client: o.metadata?.customer_email || o.metadata?.shipping_address?.name || "N/A",
        total: (o.total_cents || 0) / 100,
        status: o.status,
        statusLabel: derived.label,
        statusDetail: derived.description,
        trackingNumber: o.metadata?.tracking_number || o.metadata?.latest_tracking_number || null,
        data: o.created_at,
        fraudScore: typeof o.metadata?.fraud_score === "number" ? o.metadata.fraud_score : null,
        fraudLevel: typeof o.metadata?.fraud_level === "string" ? o.metadata.fraud_level : null,
        fraudBlock: o.metadata?.fraud_block === true,
        fraudReview: o.metadata?.fraud_review === true,
      };
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Nu am putut incarca comenzile.";
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-3xl font-black text-[#0D0D0D] mb-6">Comenzi</h1>

      {loadError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {loadError}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-[#E5E5E5] overflow-x-auto">
        <table className="w-full text-left min-w-[760px]">
          <thead className="bg-[#F7F7F8] border-b border-[#E5E5E5] text-sm font-bold text-[#0D0D0D]">
            <tr>
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">Client</th>
              <th className="px-6 py-4">Total</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Tracking</th>
              <th className="px-6 py-4">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E5] text-sm">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-[#F7F7F8]/50 transition">
                <td className="px-6 py-4 font-mono text-xs text-gray-500">
                  <Link href={`/admin/orders/${order.id}`} className="hover:text-[#0D0D0D] hover:underline">
                    {String(order.id).split("-")[0]}...
                  </Link>
                </td>
                <td className="px-6 py-4 text-gray-600">{order.client}</td>
                <td className="px-6 py-4 font-medium text-[#0D0D0D]">
                  {Number(order.total).toFixed(2)} RON
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                    {order.statusLabel}
                  </span>
                  <p className="mt-1 text-xs text-gray-500">{order.statusDetail}</p>
                  {order.fraudBlock && (
                    <Link
                      href={`/admin/risk?status=paid&min=50`}
                      className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white hover:bg-red-700"
                      title={`Fraud score ${order.fraudScore}/100 — fulfillment BLOCAT`}
                    >
                      🛑 BLOCK {order.fraudScore}
                    </Link>
                  )}
                  {!order.fraudBlock && order.fraudReview && (
                    <Link
                      href={`/admin/risk?status=paid&min=50`}
                      className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500 text-white hover:bg-orange-600"
                      title={`Fraud score ${order.fraudScore}/100 — review manual recomandat`}
                    >
                      ⚠ REVIEW {order.fraudScore}
                    </Link>
                  )}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {order.trackingNumber ? (
                    <span className="font-mono text-xs">{order.trackingNumber}</span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-gray-500">
                  {new Date(order.data).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {orders.length === 0 && !loadError && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  Nu exista comenzi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
