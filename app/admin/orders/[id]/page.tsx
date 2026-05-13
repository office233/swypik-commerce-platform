"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function AdminOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [trackingInput, setTrackingInput] = useState("");

  const loadOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const data = await res.json();
      if (!data.error) {
        setOrder(data);
        setItems(data.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

  async function doAction(action: string, extra: Record<string, any> = {}) {
    setActionLoading(action);
    try {
      const res = await fetch("/api/admin/fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, orderId, ...extra }),
      });
      const data = await res.json();
      if (data.success) {
        setToast(
          action === "fulfill" ? "✅ Comanda a fost trimisă la furnizor!" :
          action === "add_tracking" ? "✅ Cod AWB adăugat cu succes!" :
          action === "cancel" ? "❌ Comanda a fost anulată." : "✅ Acțiune completă!"
        );
        setTimeout(() => setToast(""), 3000);
        loadOrder(); // reload
      } else {
        setToast(`⚠️ Eroare: ${data.error || "Necunoscută"}`);
        setTimeout(() => setToast(""), 4000);
      }
    } finally {
      setActionLoading(null);
      setShowTrackingModal(false);
      setTrackingInput("");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#E5E5E5] border-t-[#0D0D0D] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center">
        <p className="text-[#6E6E80] font-bold">Comanda nu a fost găsită.</p>
      </div>
    );
  }

  const statusColor =
    order.status === "paid" ? "bg-neutral-100 text-neutral-900" :
    order.status === "pending" ? "bg-yellow-100 text-yellow-800" :
    order.status === "fulfilled" ? "bg-blue-100 text-blue-800" :
    order.status === "return_requested" ? "bg-orange-100 text-orange-800" :
    order.status === "refunded" ? "bg-purple-100 text-purple-800" :
    order.status === "cancelled" ? "bg-red-100 text-red-800" :
    "bg-gray-100 text-gray-800";

  const fulfillColor =
    order.fulfillmentStatus === "shipped" ? "bg-purple-100 text-purple-800" :
    order.fulfillmentStatus === "processing" ? "bg-yellow-100 text-yellow-800" :
    order.fulfillmentStatus === "manual_required" ? "bg-orange-100 text-orange-800" :
    order.fulfillmentStatus === "failed" ? "bg-red-100 text-red-800" :
    "bg-gray-100 text-gray-800";

  return (
    <div className="min-h-screen bg-[#F7F7F8] p-8">
      <div className="max-w-4xl mx-auto">

        {/* Top Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link href="/admin/orders" className="text-sm font-bold text-[#6E6E80] hover:text-[#0D0D0D] mb-2 inline-block">
              ← Înapoi la comenzi
            </Link>
            <h1 className="text-2xl font-black text-[#0D0D0D] flex items-center gap-3 flex-wrap">
              Comanda #{orderId.split("-")[0]}
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${statusColor}`}>
                {order.statusLabel || order.status.toUpperCase()}
              </span>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${fulfillColor}`}>
                {order.fulfillmentStatus || "pending"}
              </span>
            </h1>
            {order.statusDetail && (
              <p className="text-sm text-[#6E6E80] mt-1">{order.statusDetail}</p>
            )}
            <p className="text-sm text-[#6E6E80] mt-1">
              Plasată pe {new Date(order.createdAt).toLocaleString("ro-RO")}
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            {order.status === "paid" && (
              <>
                <button
                  onClick={() => doAction("fulfill")}
                  disabled={!!actionLoading}
                  className="rounded-lg bg-[#0D0D0D] px-4 py-2 text-sm font-bold text-white hover:bg-[#0E906F] disabled:opacity-50 transition"
                >
                  {actionLoading === "fulfill" ? "Se procesează..." : "🚀 Trimite la Furnizor"}
                </button>
                <button
                  onClick={() => setShowTrackingModal(true)}
                  disabled={!!actionLoading}
                  className="rounded-lg bg-[#0D0D0D] px-4 py-2 text-sm font-bold text-white hover:bg-[#333] disabled:opacity-50 transition"
                >
                  📦 Adaugă AWB
                </button>
              </>
            )}
            {order.status === "fulfilled" && !order.trackingNumber && (
              <button
                onClick={() => setShowTrackingModal(true)}
                disabled={!!actionLoading}
                className="rounded-lg bg-[#0D0D0D] px-4 py-2 text-sm font-bold text-white hover:bg-[#333] disabled:opacity-50 transition"
              >
                📦 Adaugă AWB
              </button>
            )}
            {order.status !== "cancelled" && (
              <button
                onClick={() => { if (confirm("Ești sigur că vrei să anulezi comanda?")) doAction("cancel"); }}
                disabled={!!actionLoading}
                className="rounded-lg bg-white border border-[#E5E5E5] px-4 py-2 text-sm font-bold text-[#df1b41] hover:bg-red-50 disabled:opacity-50 transition"
              >
                {actionLoading === "cancel" ? "Se anulează..." : "Anulează"}
              </button>
            )}
            <Link
              href={`/orders/${orderId}`}
              target="_blank"
              className="rounded-lg bg-white border border-[#E5E5E5] px-4 py-2 text-sm font-bold text-[#6E6E80] hover:bg-[#F7F7F8] transition"
            >
              👁️ Pagina client
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Main Column */}
          <div className="md:col-span-2 space-y-6">

            {/* Items */}
            <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm">
              <h2 className="text-lg font-black mb-4">Produse comandate</h2>
              <div className="space-y-4">
                {items.map((item: any, i: number) => (
                  <div key={i} className="flex gap-4 items-center pb-4 border-b border-[#E5E5E5] last:border-0 last:pb-0">
                    <div className="h-16 w-16 bg-[#F7F7F8] rounded-xl flex items-center justify-center font-bold text-2xl">
                      📦
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm text-[#0D0D0D]">{item.title}</p>
                      <p className="text-xs text-[#6E6E80]">Cantitate: {item.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-sm">{Number(item.unit_price).toFixed(2)} lei</p>
                      <p className="text-xs text-[#6E6E80]">x {item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Info */}
            <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm">
              <h2 className="text-lg font-black mb-4">Sumar plată</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-base font-black pt-2">
                  <span>Total plătit</span>
                  <span>{Number(order.totalRon).toFixed(2)} lei</span>
                </div>
              </div>
            </div>

            {/* Tracking Info */}
            {order.trackingNumber && (
              <div className="bg-white rounded-2xl border border-[#0D0D0D]/30 p-6 shadow-sm">
                <h2 className="text-lg font-black mb-3 text-[#0D0D0D]">🚚 Cod de urmărire</h2>
                <div className="bg-[#F0FDF4] rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xl font-black font-mono text-[#0D0D0D]">{order.trackingNumber}</p>
                    {order.trackingUrl && (
                      <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0D0D0D] font-bold hover:underline">
                        Urmărește coletul →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Right Column */}
          <div className="space-y-6">

            {/* Customer Info */}
            <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm">
              <h2 className="text-base font-black mb-4">Client</h2>
              <div className="space-y-1 text-sm">
                <p className="font-bold text-[#0D0D0D]">{order.shipping?.name || "Nespecificat"}</p>
                <p className="text-[#6E6E80]">{order.shipping?.phone || "Fără telefon"}</p>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm">
              <h2 className="text-base font-black mb-4">Adresă de livrare</h2>
              <div className="text-sm text-[#0D0D0D]">
                {order.shipping?.line1 ? (
                  <>
                    <p>{order.shipping.name}</p>
                    <p>{order.shipping.line1}</p>
                    {order.shipping.line2 && <p>{order.shipping.line2}</p>}
                    <p>{order.shipping.city}, {order.shipping.state}</p>
                    <p>{order.shipping.postal_code}, {order.shipping.country}</p>
                  </>
                ) : (
                  <p className="text-[#6E6E80]">Nu a fost furnizată nicio adresă de livrare.</p>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Tracking Modal */}
      {showTrackingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowTrackingModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-[#0D0D0D] mb-2">Adaugă cod AWB</h3>
            <p className="text-sm text-[#6E6E80] mb-4">Introdu codul de urmărire primit de la curier sau furnizor.</p>
            <input
              type="text"
              value={trackingInput}
              onChange={e => setTrackingInput(e.target.value)}
              placeholder="Ex: RO123456789CN"
              className="w-full rounded-lg border border-[#E5E5E5] px-4 py-3 text-sm focus:border-[#0D0D0D] focus:outline-none focus:ring-1 focus:ring-[#0D0D0D]"
              autoFocus
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => doAction("add_tracking", { trackingNumber: trackingInput })}
                disabled={!trackingInput.trim() || !!actionLoading}
                className="flex-1 rounded-lg bg-[#0D0D0D] py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {actionLoading === "add_tracking" ? "Se salvează..." : "Salvează AWB"}
              </button>
              <button
                onClick={() => setShowTrackingModal(false)}
                className="rounded-lg bg-[#F7F7F8] px-4 py-3 text-sm font-bold text-[#6E6E80]"
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 rounded-full bg-[#0D0D0D] px-6 py-3 text-sm font-bold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
