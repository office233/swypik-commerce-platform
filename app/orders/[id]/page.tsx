"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STATUS_MAP: Record<string, { label: string; color: string; icon: string; step: number }> = {
  pending: { label: "În așteptare", color: "bg-yellow-100 text-yellow-800", icon: "⏳", step: 1 },
  paid: { label: "Plătită", color: "bg-neutral-100 text-neutral-900", icon: "💳", step: 2 },
  fulfilled: { label: "Expediată", color: "bg-blue-100 text-blue-800", icon: "📦", step: 3 },
  shipped: { label: "În tranzit", color: "bg-purple-100 text-purple-800", icon: "🚚", step: 3 },
  delivered: { label: "Livrată", color: "bg-neutral-100 text-neutral-900", icon: "✅", step: 4 },
  return_requested: { label: "Retur solicitat", color: "bg-orange-100 text-orange-800", icon: "🔄", step: 4 },
  cancelled: { label: "Anulată", color: "bg-red-100 text-red-800", icon: "❌", step: 0 },
};

const STEPS = [
  { label: "Comandă plasată", icon: "🛒" },
  { label: "Plată confirmată", icon: "💳" },
  { label: "Expediată", icon: "📦" },
  { label: "Livrată", icon: "🏠" },
];

export default function OrderTrackingPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnSuccess, setReturnSuccess] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    fetch(`/api/orders/${params.id}${token ? `?token=${encodeURIComponent(token)}` : ""}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setOrder(data);
        }
      })
      .catch(() => setError("Nu am putut încărca comanda."))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#E5E5E5] border-t-[#0D0D0D] rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-sm font-medium text-[#6E6E80]">Se încarcă comanda...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">📭</div>
          <h1 className="text-2xl font-black text-[#0D0D0D]">Comanda nu a fost găsită</h1>
          <p className="mt-2 text-sm text-[#6E6E80]">{error || "Verifică link-ul sau contactează suportul."}</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-[#0D0D0D] px-6 py-3 text-sm font-bold text-white">
            Înapoi la magazin
          </Link>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[order.status] || STATUS_MAP[order.fulfillmentStatus] || STATUS_MAP.pending;
  const currentStep = statusInfo.step;
  const isCancelled = order.status === "cancelled";
  const isReturnable =
    (order.fulfillmentStatus === "delivered" || order.fulfillmentStatus === "fulfilled" ||
     order.status === "delivered" || order.status === "fulfilled") &&
    order.status !== "return_requested";
  const isReturnRequested = order.status === "return_requested";

  const handleReturnSubmit = async () => {
    if (returnReason.trim().length < 5) {
      setReturnError("Motivul trebuie să aibă minim 5 caractere.");
      return;
    }
    setReturnSubmitting(true);
    setReturnError(null);
    try {
      const token = new URLSearchParams(window.location.search).get("token") || "";
      const res = await fetch(`/api/orders/${order.id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: returnReason.trim(), token }),
      });
      const data = await res.json();
      if (data.success) {
        setReturnSuccess(true);
        setShowReturnForm(false);
        // Update local order state to reflect the new status
        setOrder((prev: any) => ({ ...prev, status: "return_requested" }));
      } else {
        setReturnError(data.error || "Eroare la trimiterea cererii.");
      }
    } catch {
      setReturnError("Eroare de rețea. Încearcă din nou.");
    } finally {
      setReturnSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F8]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E5E5] px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-black text-[#0D0D0D]">Swypik</Link>
          <span className="text-xs font-bold text-[#6E6E80] uppercase tracking-widest">Urmărire comandă</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Order ID + Status */}
        <div className="text-center mb-8">
          <p className="text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1">Comanda</p>
          <h1 className="text-2xl font-black text-[#0D0D0D]">#{order.id.split("-")[0]}</h1>
          <span className={`mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold ${statusInfo.color}`}>
            {statusInfo.icon} {statusInfo.label}
          </span>
          <p className="mt-2 text-xs text-[#6E6E80]">
            Plasată pe {new Date(order.createdAt).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        {/* Progress Steps */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between relative">
              {/* Progress line */}
              <div className="absolute top-5 left-[10%] right-[10%] h-1 bg-[#E5E5E5] rounded-full">
                <div
                  className="h-full bg-[#0D0D0D] rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, ((currentStep - 1) / (STEPS.length - 1)) * 100)}%` }}
                />
              </div>

              {STEPS.map((step, i) => (
                <div key={step.label} className="relative z-10 flex flex-col items-center" style={{ width: "25%" }}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all ${
                    i + 1 <= currentStep
                      ? "bg-[#0D0D0D] border-[#0D0D0D] text-white shadow-md"
                      : "bg-white border-[#E5E5E5] text-[#A1A1AA]"
                  }`}>
                    {i + 1 <= currentStep ? "✓" : step.icon}
                  </div>
                  <p className={`mt-2 text-[11px] font-bold text-center ${
                    i + 1 <= currentStep ? "text-[#0D0D0D]" : "text-[#A1A1AA]"
                  }`}>
                    {step.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tracking Number */}
        {order.trackingNumber && (
          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 mb-6 shadow-sm">
            <h2 className="text-base font-black text-[#0D0D0D] mb-3">🚚 Cod de urmărire</h2>
            <div className="flex items-center gap-3 bg-[#F7F7F8] rounded-xl p-4">
              <div className="flex-1">
                <p className="text-lg font-black font-mono text-[#0D0D0D]">{order.trackingNumber}</p>
                <p className="text-xs text-[#6E6E80] mt-0.5">Folosește acest cod pe site-ul curierului</p>
              </div>
              {order.trackingUrl && (
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg bg-[#0D0D0D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0E906F] transition"
                >
                  Urmărește →
                </a>
              )}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 mb-6 shadow-sm">
          <h2 className="text-base font-black text-[#0D0D0D] mb-4">Produse comandate</h2>
          <div className="space-y-3">
            {(order.items || []).map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-[#F7F7F8] last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#0D0D0D] line-clamp-1">{item.title}</p>
                  <p className="text-xs text-[#6E6E80]">Cantitate: {item.quantity}</p>
                </div>
                <p className="text-sm font-black text-[#0D0D0D] shrink-0 ml-4">
                  {Number(item.unit_price * item.quantity).toFixed(2)} lei
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-[#E5E5E5] flex justify-between items-center">
            <span className="text-base font-black text-[#0D0D0D]">Total</span>
            <span className="text-xl font-black text-[#0D0D0D]">{Number(order.totalRon).toFixed(2)} lei</span>
          </div>
        </div>

        {/* Shipping Address */}
        {order.shipping && (
          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 mb-6 shadow-sm">
            <h2 className="text-base font-black text-[#0D0D0D] mb-3">📍 Adresa de livrare</h2>
            <div className="text-sm text-[#0D0D0D]">
              <p className="font-bold">{order.shipping.name}</p>
              <p>{order.shipping.line1}</p>
              {order.shipping.line2 && <p>{order.shipping.line2}</p>}
              <p>{order.shipping.city}, {order.shipping.postal_code}</p>
              <p>{order.shipping.country}</p>
            </div>
          </div>
        )}

        {/* Return Request Section */}
        {isReturnRequested && (
          <div className="bg-orange-50 rounded-2xl border border-orange-200 p-6 mb-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔄</span>
              <div>
                <h2 className="text-base font-black text-orange-800">Retur solicitat</h2>
                <p className="text-sm text-orange-700 mt-0.5">
                  Cererea ta de retur a fost înregistrată. Vei fi contactat în curând de echipa noastră.
                </p>
              </div>
            </div>
          </div>
        )}

        {returnSuccess && !isReturnRequested && (
          <div className="bg-neutral-100 rounded-2xl border border-neutral-100 p-6 mb-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-3xl">✅</span>
              <div>
                <h2 className="text-base font-black text-neutral-900">Cerere trimisă cu succes!</h2>
                <p className="text-sm text-neutral-900 mt-0.5">
                  Vom analiza cererea ta și te vom contacta în cel mai scurt timp.
                </p>
              </div>
            </div>
          </div>
        )}

        {isReturnable && !returnSuccess && (
          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 mb-6 shadow-sm">
            {!showReturnForm ? (
              <button
                id="btn-request-return"
                onClick={() => setShowReturnForm(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-red-200 bg-red-50 px-6 py-3.5 text-sm font-bold text-red-700 hover:bg-red-100 hover:border-red-300 transition-all active:scale-[0.98]"
              >
                <span>↩️</span> Solicită Retur
              </button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-black text-[#0D0D0D]">Solicită retur</h2>
                  <button
                    onClick={() => { setShowReturnForm(false); setReturnError(null); }}
                    className="text-xs font-bold text-[#6E6E80] hover:text-[#0D0D0D] transition"
                  >
                    ✕ Anulează
                  </button>
                </div>
                <div>
                  <label htmlFor="return-reason" className="block text-sm font-bold text-[#0D0D0D] mb-1.5">
                    Motivul returului
                  </label>
                  <textarea
                    id="return-reason"
                    rows={3}
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="Descrie motivul pentru care dorești să returnezi comanda..."
                    className="w-full rounded-xl border border-[#E5E5E5] bg-[#F7F7F8] px-4 py-3 text-sm text-[#0D0D0D] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#0D0D0D] focus:border-transparent resize-none transition"
                  />
                </div>
                {returnError && (
                  <p className="text-sm font-bold text-red-600 bg-red-50 rounded-lg px-3 py-2">
                    ⚠️ {returnError}
                  </p>
                )}
                <button
                  id="btn-submit-return"
                  onClick={handleReturnSubmit}
                  disabled={returnSubmitting || returnReason.trim().length < 5}
                  className="w-full rounded-xl bg-red-600 px-6 py-3.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {returnSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Se trimite...
                    </span>
                  ) : (
                    "Trimite cererea de retur"
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Back to shop */}
        <div className="text-center mt-8">
          <Link
            href="/"
            className="inline-block rounded-xl bg-[#0D0D0D] px-8 py-4 text-sm font-bold text-white transition-transform active:scale-[0.98]"
          >
            Înapoi la magazin
          </Link>
        </div>
      </div>
    </div>
  );
}
