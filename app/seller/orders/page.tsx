"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.error || "Nu am putut incarca comenzile.");
  }
  return json;
};

/* ───────────────────────────── status badge helper ───────────────────────────── */
function statusBadge(status: string) {
  switch (status) {
    case "fulfilled":
      return { label: "Expediat", cls: "bg-green-100 text-green-800", icon: "📦" };
    case "return_requested":
      return { label: "Retur solicitat", cls: "bg-orange-100 text-orange-800 ring-2 ring-orange-300", icon: "🔄" };
    case "refunded":
      return { label: "Restituit", cls: "bg-purple-100 text-purple-800", icon: "💸" };
    default:
      return { label: "În procesare", cls: "bg-yellow-100 text-yellow-800", icon: "⏳" };
  }
}

export default function SellerOrdersPage() {
  const { data, error, mutate } = useSWR("/api/seller/orders", fetcher);
  const [loadingAwb, setLoadingAwb] = useState<string | null>(null);
  const [loadingRefund, setLoadingRefund] = useState<string | null>(null);

  /* ────── AWB handler ────── */
  const handleAddAwb = async (orderId: string) => {
    const trackingNumber = prompt("Introduceți numărul de AWB pentru această comandă:");
    if (!trackingNumber) return;

    setLoadingAwb(orderId);
    try {
      const res = await fetch("/api/seller/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, tracking_number: trackingNumber }),
      });
      const json = await res.json();
      if (json.success) {
        alert("AWB adăugat cu succes!");
        mutate();
      } else {
        alert("Eroare: " + json.error);
      }
    } catch (err) {
      alert("A apărut o eroare la salvarea AWB-ului.");
    } finally {
      setLoadingAwb(null);
    }
  };

  /* ────── Refund handler ────── */
  const handleRefund = async (orderId: string) => {
    const confirmed = confirm(
      "Ești sigur că vrei să aprobi returul și să restituiești banii clientului?\n\nAceastă acțiune este ireversibilă."
    );
    if (!confirmed) return;

    setLoadingRefund(orderId);
    try {
      const res = await fetch(`/api/seller/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (json.success) {
        alert("✅ Restituirea a fost procesată cu succes! Banii vor fi returnați pe cardul clientului.");
        mutate();
      } else {
        alert("Eroare la restituire: " + json.error);
      }
    } catch (err) {
      alert("A apărut o eroare la procesarea restituirii.");
    } finally {
      setLoadingRefund(null);
    }
  };

  const orders = data?.orders || [];
  const isLoading = !data && !error;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-[#0D0D0D]">Comenzi primite</h1>
          <p className="text-sm text-[#6E6E80] mt-1">Gestionează comenzile și procesează expedierile (AWB).</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F7F7F8] border-b border-[#E5E5E5]">
              <tr>
                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">ID Comandă</th>
                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">Detalii Produse</th>
                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">Status</th>
                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px] text-right">Total</th>
                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px] text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#6E6E80]">
                    Se încarcă comenzile...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="font-bold text-red-700">Nu am putut incarca comenzile.</p>
                    <p className="text-sm text-[#6E6E80] mt-1">{error.message || "Eroare necunoscuta."}</p>
                    <button
                      onClick={() => mutate()}
                      className="mt-4 rounded-lg bg-[#0D0D0D] px-4 py-2 text-xs font-bold text-white"
                    >
                      Reincearca
                    </button>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-3xl mb-3">🛍️</p>
                    <p className="font-bold text-[#0D0D0D]">Nicio comandă deocamdată.</p>
                    <p className="text-sm text-[#6E6E80] mt-1">Comenzile din produsele tale vor apărea aici.</p>
                  </td>
                </tr>
              ) : (
                orders.map((order: any) => {
                  const badge = statusBadge(order.status);
                  const badgeLabel = order.status_label || badge.label;
                  const returnReason = order.order_metadata?.return_reason;
                  const isReturnRequested = order.status === "return_requested";
                  const isRefunded = order.status === "refunded";

                  return (
                    <tr
                      key={order.order_id}
                      className={`border-b border-[#E5E5E5] last:border-0 transition-colors ${
                        isReturnRequested
                          ? "bg-orange-50/60 hover:bg-orange-50"
                          : isRefunded
                          ? "bg-purple-50/40 hover:bg-purple-50/60"
                          : "hover:bg-[#F9FAFB]"
                      }`}
                    >
                      <td className="px-6 py-4 font-mono text-xs text-[#0D0D0D]">
                        {order.order_id.split("-")[0]}...
                      </td>
                      <td className="px-6 py-4">
                        {order.items?.map((item: any) => (
                          <div key={item.item_id} className="text-[#0D0D0D] mb-1 last:mb-0">
                            <span className="font-semibold">{item.quantity}x</span> {item.title}
                          </div>
                        ))}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge.cls}`}
                        >
                          {badge.icon} {badgeLabel}
                        </span>

                        {/* AWB info */}
                        {order.order_metadata?.tracking_number && (
                          <div className="mt-2 text-xs text-[#6E6E80]">
                            AWB: <span className="font-mono text-[#0D0D0D] font-medium">{order.order_metadata.tracking_number}</span>
                            {order.order_metadata.tracking_url && (
                              <a
                                href={order.order_metadata.tracking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 font-bold text-[#10A37F] hover:underline"
                              >
                                Urmareste
                              </a>
                            )}
                          </div>
                        )}

                        {/* Return reason callout */}
                        {isReturnRequested && returnReason && (
                          <div className="mt-3 rounded-lg bg-orange-100/80 border border-orange-200 p-3">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-orange-600 mb-1">
                              Motivul returului
                            </p>
                            <p className="text-xs text-orange-900 leading-relaxed">
                              &ldquo;{returnReason}&rdquo;
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-[#0D0D0D]">
                        {(order.total_cents / 100).toFixed(2)} RON
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end gap-2">
                          {/* AWB button — only for non-fulfilled, non-return, non-refunded */}
                          {order.status !== "fulfilled" &&
                            !isReturnRequested &&
                            !isRefunded && (
                              <button
                                onClick={() => handleAddAwb(order.order_id)}
                                disabled={loadingAwb === order.order_id}
                                className="px-3 py-1.5 bg-[#0D0D0D] text-white text-xs font-semibold rounded-lg hover:bg-[#2A2A2A] transition-colors disabled:opacity-50"
                              >
                                {loadingAwb === order.order_id ? "Se salvează..." : "Adaugă AWB"}
                              </button>
                            )}

                          {/* Approve return & refund button */}
                          {isReturnRequested && (
                            <button
                              onClick={() => handleRefund(order.order_id)}
                              disabled={loadingRefund === order.order_id}
                              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold rounded-lg hover:from-orange-600 hover:to-red-600 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {loadingRefund === order.order_id
                                ? "Se procesează..."
                                : "🔄 Aprobă Retur & Restituie Banii"}
                            </button>
                          )}

                          {/* Refunded label */}
                          {isRefunded && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-600">
                              ✅ Bani restituiți
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
