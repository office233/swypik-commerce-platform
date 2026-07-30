"use client";

/**
 * /food/orders/[id] — tracking live pentru o comandă Swypik Food.
 *
 *  - timeline statusuri: plasată → acceptată → în preparare → gata → curier → în livrare → livrată
 *  - poziția curierului pe hartă, live prin SSE (/api/dispatch/[jobId]/stream) +
 *    fallback polling la 20s (GET /api/local-orders/[id]);
 *  - ETA: estimated_delivery_at de la server (prep + 15 min livrare), iar după
 *    pickup — distanța curier→client / viteza medie a vehiculului.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChefHat, Bike, MapPin, Phone, ShoppingBag } from "lucide-react";
import { haptic } from "@/lib/haptic";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
const LiveMarker = dynamic(() => import("@/components/map/LiveMarker"), { ssr: false });
const RoutePolyline = dynamic(() => import("@/components/map/RoutePolyline"), { ssr: false });

const ACCENT = "#2DBE60";

type OrderItem = {
  menu_item_id: string;
  name: string;
  qty: number;
  unit_price_cents: number;
  options?: { name: string; price_cents?: number }[];
};

type Order = {
  id: string;
  order_number: string;
  status: string;
  dispatch_status: string | null;
  items: OrderItem[];
  subtotal_cents: number;
  delivery_fee_cents: number;
  tip_cents: number;
  total_cents: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  delivery_address: string;
  delivery_lat: number | null;
  delivery_lng: number | null;
  placed_at: string;
  estimated_delivery_at: string | null;
  delivered_at: string | null;
  cancel_reason: string | null;
  merchant: {
    id: string;
    name: string;
    slug: string;
    image_url: string | null;
    phone: string | null;
    lat: number | null;
    lng: number | null;
    avg_prep_minutes: number;
  };
  courier: {
    id: string;
    name: string;
    vehicle_type: string;
    lat: number | null;
    lng: number | null;
  } | null;
  dispatch_job_id: string | null;
};

/** Pașii afișați în timeline, în ordine. */
const STEPS: { key: string; label: string; matches: string[] }[] = [
  { key: "placed", label: "Comandă plasată", matches: ["placed"] },
  { key: "accepted", label: "Confirmată de restaurant", matches: ["accepted"] },
  { key: "preparing", label: "În preparare", matches: ["preparing"] },
  { key: "ready", label: "Gata de ridicare", matches: ["ready"] },
  { key: "picked_up", label: "Curierul a preluat comanda", matches: ["picked_up"] },
  { key: "delivering", label: "În livrare", matches: ["delivering"] },
  { key: "delivered", label: "Livrată 🎉", matches: ["delivered"] },
];

const STATUS_ORDER = ["placed", "accepted", "preparing", "ready", "picked_up", "delivering", "delivered"];

/** Viteze medii km/h pe tip vehicul, pentru ETA după pickup. */
const VEHICLE_SPEED_KMH: Record<string, number> = {
  foot: 5, bike: 15, scooter: 25, motorcycle: 30, car: 30, van: 28,
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default function OrderTrackingClient({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [courierPos, setCourierPos] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/local-orders/${orderId}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      setError(res.status === 401 ? "Nu ai acces la această comandă." : "Comanda nu există.");
      return;
    }
    setOrder(data.order);
    if (data.order.courier?.lat != null) {
      setCourierPos({ lat: data.order.courier.lat, lng: data.order.courier.lng });
    }
  }, [orderId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isFinal = order != null && ["delivered", "cancelled", "rejected"].includes(order.status);

  // SSE pe job-ul de dispatch: status + poziția curierului.
  useEffect(() => {
    if (!order?.dispatch_job_id || isFinal) return;
    const es = new EventSource(`/api/dispatch/${order.dispatch_job_id}/stream`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "location" && msg.lat != null) {
          setCourierPos({ lat: msg.lat, lng: msg.lng });
        } else if (msg.type === "status" || msg.type === "snapshot") {
          void refresh();
        }
      } catch { /* ignoră mesaje corupte */ }
    };
    return () => es.close();
  }, [order?.dispatch_job_id, isFinal, refresh]);

  // Fallback polling 20s cât timp comanda e activă (acoperă și pre-dispatch).
  useEffect(() => {
    if (!order || isFinal) return;
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, [order, isFinal, refresh]);

  const currentIdx = order ? STATUS_ORDER.indexOf(order.status) : -1;

  // ETA: după pickup — distanță curier→client / viteză vehicul; altfel estimated_delivery_at.
  const etaText = useMemo(() => {
    if (!order || isFinal) return null;
    if (
      courierPos &&
      order.delivery_lat != null &&
      order.delivery_lng != null &&
      ["picked_up", "delivering"].includes(order.status)
    ) {
      const km = haversineKm(courierPos, { lat: order.delivery_lat, lng: order.delivery_lng });
      const speed = VEHICLE_SPEED_KMH[order.courier?.vehicle_type ?? "bike"] ?? 20;
      const min = Math.max(2, Math.round((km / speed) * 60) + 2); // +2 min buffer predare
      return `~${min} min`;
    }
    if (order.estimated_delivery_at) {
      const diff = Math.round((new Date(order.estimated_delivery_at).getTime() - Date.now()) / 60_000);
      if (diff > 0) return `~${diff} min`;
    }
    return null;
  }, [order, courierPos, isFinal]);

  const fmtLei = (c: number) => `${(c / 100).toLocaleString("ro-RO", { minimumFractionDigits: 2 })} lei`;

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-white px-6 text-center">
        <div>
          <p className="text-lg font-black">{error}</p>
          <button
            type="button"
            onClick={() => router.push("/food")}
            style={{ backgroundColor: ACCENT }}
            className="mt-4 h-11 rounded-xl px-5 text-sm font-bold text-white"
          >
            Înapoi la restaurante
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="grid min-h-dvh place-items-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2DBE60] border-t-transparent" aria-label="Se încarcă" />
      </div>
    );
  }

  const cancelled = ["cancelled", "rejected"].includes(order.status);
  const mapPoints: { lat: number; lng: number }[] = [];
  if (order.merchant.lat != null && order.merchant.lng != null) mapPoints.push({ lat: order.merchant.lat, lng: order.merchant.lng });
  if (courierPos) mapPoints.push(courierPos);
  if (order.delivery_lat != null && order.delivery_lng != null) mapPoints.push({ lat: order.delivery_lat, lng: order.delivery_lng });
  const mapCenter = courierPos ?? mapPoints[0] ?? null;

  return (
    <div className="min-h-dvh bg-[#F7F7F8] pb-8">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[#E5E5E5] bg-white px-4 py-3">
        <button type="button" onClick={() => router.push("/food/orders")} aria-label="Înapoi" className="grid h-9 w-9 place-items-center rounded-full bg-[#F7F7F8] active:scale-95">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-black">{order.merchant.name}</h1>
          <p className="text-xs text-[#6E6E80]">#{order.order_number}</p>
        </div>
        {etaText && (
          <span style={{ backgroundColor: ACCENT }} className="rounded-full px-3 py-1.5 text-xs font-black text-white">
            {etaText}
          </span>
        )}
      </header>

      {/* Hartă live */}
      {mapCenter && !cancelled && (
        <div className="relative h-64 w-full">
          <MapView center={mapCenter} fitBounds={mapPoints.length >= 2 ? mapPoints : null} className="h-full w-full">
            {order.merchant.lat != null && order.merchant.lng != null && (
              <LiveMarker position={{ lat: order.merchant.lat, lng: order.merchant.lng }} kind="pickup" label={order.merchant.name} />
            )}
            {order.delivery_lat != null && order.delivery_lng != null && (
              <LiveMarker position={{ lat: order.delivery_lat, lng: order.delivery_lng }} kind="dropoff" label="Adresa ta" />
            )}
            {courierPos && <LiveMarker position={courierPos} kind="driver" label={order.courier?.name ?? "Curier"} />}
            {courierPos && order.delivery_lat != null && order.delivery_lng != null && (
              <RoutePolyline points={[courierPos, { lat: order.delivery_lat, lng: order.delivery_lng }]} color={ACCENT} />
            )}
          </MapView>
        </div>
      )}

      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        {/* Anulată */}
        {cancelled && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-base font-black text-red-600">
              {order.status === "rejected" ? "Comanda a fost refuzată" : "Comanda a fost anulată"}
            </p>
            {order.cancel_reason && <p className="mt-1 text-sm text-red-500">{order.cancel_reason}</p>}
          </div>
        )}

        {/* Timeline statusuri */}
        {!cancelled && (
          <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4">
            <ol className="space-y-0">
              {STEPS.map((step, i) => {
                const stepIdx = STATUS_ORDER.indexOf(step.matches[0]);
                const done = currentIdx > stepIdx || order.status === "delivered";
                const active = step.matches.includes(order.status);
                return (
                  <li key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${done || active ? "" : "bg-[#E5E5E5]"}`}
                        style={done || active ? { backgroundColor: ACCENT } : undefined}
                      >
                        {done ? <Check size={14} /> : active ? (
                          step.key === "preparing" ? <ChefHat size={14} /> :
                          step.key === "delivering" || step.key === "picked_up" ? <Bike size={14} /> :
                          <ShoppingBag size={14} />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        )}
                      </span>
                      {i < STEPS.length - 1 && (
                        <span className={`w-0.5 flex-1 ${done ? "" : "bg-[#E5E5E5]"}`} style={done ? { backgroundColor: ACCENT } : undefined} />
                      )}
                    </div>
                    <div className={`pb-4 ${i === STEPS.length - 1 ? "pb-0" : ""}`}>
                      <p className={`text-sm ${active ? "font-black" : done ? "font-semibold" : "font-medium text-[#9C9CAB]"}`}>
                        {step.label}
                      </p>
                      {active && step.key === "placed" && (
                        <p className="text-xs text-[#6E6E80]">Așteptăm confirmarea restaurantului…</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Curier */}
        {order.courier && !cancelled && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#E5E5E5] bg-white p-4">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#F0FAF4] text-xl" aria-hidden>🛵</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black">{order.courier.name}</p>
              <p className="text-xs text-[#6E6E80]">Curierul tău</p>
            </div>
          </div>
        )}

        {/* Adresă */}
        <div className="flex items-start gap-3 rounded-2xl border border-[#E5E5E5] bg-white p-4">
          <MapPin size={18} className="mt-0.5 shrink-0 text-[#6E6E80]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{order.delivery_address}</p>
            <p className="text-xs text-[#6E6E80]">Adresa de livrare</p>
          </div>
        </div>

        {/* Deep link Go: cursă către adresa de livrare */}
        {!cancelled && (
          <a
            href={`/go?dropoff=${encodeURIComponent(order.delivery_address)}${
              order.delivery_lat != null && order.delivery_lng != null
                ? `&dlat=${order.delivery_lat}&dlng=${order.delivery_lng}`
                : ""
            }`}
            onClick={() => haptic("tap")}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#E5E5E5] bg-white text-sm font-bold active:scale-[0.98]"
          >
            🚗 Ai nevoie de o cursă? Swypik Go
          </a>
        )}

        {/* Sumar comandă */}
        <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4">
          <h2 className="text-sm font-black">Comanda ta</h2>
          <div className="mt-2 space-y-1.5">
            {(order.items ?? []).map((it, i) => (
              <div key={i} className="flex justify-between gap-2 text-sm">
                <span className="text-[#3B3B4F]">
                  {it.qty}× {it.name}
                  {it.options?.length ? (
                    <span className="block text-xs text-[#9C9CAB]">{it.options.map((o) => o.name).join(", ")}</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold">{fmtLei(it.unit_price_cents * it.qty)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-[#E5E5E5] pt-2 text-sm">
            <div className="flex justify-between text-[#6E6E80]"><span>Produse</span><span>{fmtLei(order.subtotal_cents)}</span></div>
            <div className="flex justify-between text-[#6E6E80]"><span>Livrare</span><span>{order.delivery_fee_cents === 0 ? "Gratuită" : fmtLei(order.delivery_fee_cents)}</span></div>
            {order.tip_cents > 0 && (
              <div className="flex justify-between text-[#6E6E80]"><span>Bacșiș curier</span><span>{fmtLei(order.tip_cents)}</span></div>
            )}
            <div className="mt-1 flex justify-between font-black"><span>Total</span><span>{fmtLei(order.total_cents)}</span></div>
            <p className="mt-1 text-xs text-[#9C9CAB]">
              {order.payment_method === "cash" ? "Plată cash la livrare" : order.payment_status === "paid" ? "Plătită cu cardul ✓" : "Plată cu cardul în curs"}
            </p>
          </div>
        </div>

        {/* Sună restaurantul */}
        {order.merchant.phone && !cancelled && order.status !== "delivered" && (
          <a
            href={`tel:${order.merchant.phone}`}
            onClick={() => haptic("tap")}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#E5E5E5] bg-white text-sm font-bold active:scale-[0.98]"
          >
            <Phone size={16} /> Sună restaurantul
          </a>
        )}

        {/* Re-comandă după livrare */}
        {order.status === "delivered" && (
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              router.push(`/food/${order.merchant.slug}?reorder=${order.id}`);
            }}
            style={{ backgroundColor: ACCENT }}
            className="h-12 w-full rounded-2xl text-sm font-black text-white active:scale-[0.98]"
          >
            Comandă din nou
          </button>
        )}
      </main>
    </div>
  );
}
