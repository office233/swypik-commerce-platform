"use client";

/**
 * /go — ecranul de comandă Swypik Go (mobile-first, PWA).
 * Hartă (react-leaflet/OSM) + autocomplete adrese (Nominatim) +
 * selector clasă vehicul cu preț estimat (POST /api/rides/estimate) +
 * buton „Comandă” (POST /api/rides → redirect /go/[id]).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import AddressAutocomplete, { type AddressResult } from "@/components/map/AddressAutocomplete";
import { Bus, Car, CarFront, Zap, ArrowLeft, Users, Clock, Sparkles, ShieldCheck, type LucideIcon } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { DEFAULT_MAP_CENTER } from "@/lib/config/geo";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
const LiveMarker = dynamic(() => import("@/components/map/LiveMarker"), { ssr: false });
const RoutePolyline = dynamic(() => import("@/components/map/RoutePolyline"), { ssr: false });

const BUCHAREST = DEFAULT_MAP_CENTER;

const PRESETS = [
  { label: "Acasă", icon: "🏠", address: "Acasă", lat: 44.432, lng: 26.103 },
  { label: "Birou", icon: "🏢", address: "Calea Victoriei 155", lat: 44.448, lng: 26.088 },
  { label: "Aeroport", icon: "✈️", address: "Aeroport Henri Coandă Otopeni", lat: 44.571, lng: 26.085 },
  { label: "Mall", icon: "🛍️", address: "AFI Cotroceni, Vasile Milea 4", lat: 44.430, lng: 26.053 },
] as const;

const CLASSES: readonly { id: "economy" | "comfort" | "van"; labelKey: string; Icon: LucideIcon; hintKey: string; seats: number; defaultEta: string }[] = [
  { id: "economy", labelKey: "classEconomy", Icon: Car, hintKey: "hintEconomy", seats: 4, defaultEta: "2 min" },
  { id: "comfort", labelKey: "classComfort", Icon: CarFront, hintKey: "hintComfort", seats: 4, defaultEta: "4 min" },
  { id: "van", labelKey: "classVan", Icon: Bus, hintKey: "hintVan", seats: 6, defaultEta: "6 min" },
] as const;

type Estimate = {
  total_cents: number;
  currency: string;
  distance_km: number;
  duration_min: number;
  breakdown: { surge_multiplier: number };
};

export default function GoClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("go");
  const [pickup, setPickup] = useState<AddressResult | null>(null);
  const [dropoff, setDropoff] = useState<AddressResult | null>(null);
  const [vehicleClass, setVehicleClass] = useState<(typeof CLASSES)[number]["id"]>("economy");
  const [estimates, setEstimates] = useState<Record<string, Estimate | null>>({});
  const [loading, setLoading] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useSwyp, setUseSwyp] = useState(false);
  const [swypInfo, setSwypInfo] = useState<{ ronPerSwyp: number; balanceSwyp: number } | null>(null);

  // Cursul + soldul SWYP: opțiunea de plată apare doar dacă moneda are
  // acoperire reală (curs > 0) și userul are sold.
  useEffect(() => {
    Promise.all([
      fetch("/api/swyp/rate").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/swyp/wallet").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([rate, bal]) => {
        const ron = Number(rate?.ron_per_swyp ?? 0);
        const balance = Number(bal?.balanceUnits ?? 0) / 100; // 100 subunități = 1 SWYP
        if (ron > 0 && balance > 0) setSwypInfo({ ronPerSwyp: ron, balanceSwyp: balance });
      })
      .catch(() => { });
  }, []);

  // Deep link din alte verticale: /go?dropoff=<adresă>&dlat=..&dlng=..
  // (ex: din tracking Eats — „ai nevoie de o cursă?").
  useEffect(() => {
    const addr = searchParams.get("dropoff");
    if (!addr) return;
    const lat = Number.parseFloat(searchParams.get("dlat") ?? "");
    const lng = Number.parseFloat(searchParams.get("dlng") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setDropoff((d) => d ?? { address: addr, lat, lng });
  }, [searchParams]);

  // Geolocalizare inițială best-effort → pickup implicit.
  useEffect(() => {
    if (!navigator.geolocation || pickup) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPickup((p) => p ?? { address: t("myLocation"), lat, lng });
        // Adresa lizibilă, best-effort, prin proxy-ul intern de reverse geocoding.
        void fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { result?: { address?: string } } | null) => {
            const address = d?.result?.address;
            if (address) {
              setPickup((p) => (p && p.lat === lat && p.lng === lng ? { ...p, address } : p));
            }
          })
          .catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 5000 },
    );
  }, [pickup, t]);

  const fetchEstimates = useCallback(async () => {
    if (!pickup || !dropoff) return;
    setLoading(true);
    setError(null);
    try {
      const out: Record<string, Estimate | null> = {};
      await Promise.all(
        CLASSES.map(async (c) => {
          const res = await fetch("/api/rides/estimate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pickup, dropoff, vehicle_class: c.id }),
          });
          if (res.ok) {
            const data = await res.json();
            out[c.id] = data.estimate;
          } else if (res.status === 401) {
            setError(t("estimateError"));
            out[c.id] = null;
          } else if (res.status === 422) {
            setError(t("noZone"));
            out[c.id] = null;
          } else {
            const data = await res.json().catch(() => ({}));
            if (data.error) setError(data.error);
            out[c.id] = null;
          }
        }),
      );
      setEstimates(out);
    } finally {
      setLoading(false);
    }
  }, [pickup, dropoff]);

  useEffect(() => {
    void fetchEstimates();
  }, [fetchEstimates]);

  const order = async () => {
    if (!pickup || !dropoff || ordering) return;
    haptic("tap");
    setOrdering(true);
    setError(null);
    try {
      const res = await fetch("/api/rides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup,
          dropoff,
          vehicle_class: vehicleClass,
          payment_method: "cash",
          use_swyp: useSwyp && !!swypInfo,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.ride_id) {
        router.push(`/go/${data.ride_id}`);
        return;
      }
      if (!res.ok) {
        setError(res.status === 422 ? t("noZone") : (data.error ?? t("orderError")));
        return;
      }
      router.push(`/go/${data.ride_id}`);
    } finally {
      setOrdering(false);
    }
  };

  const fmt = (e: Estimate | null | undefined) =>
    e ? `${(e.total_cents / 100).toFixed(0)} ${e.currency}` : "—";

  const bounds = useMemo(
    () => (pickup && dropoff ? [pickup, dropoff] : null),
    [pickup, dropoff],
  );
  const selected = estimates[vehicleClass];

  return (
    <div className="relative flex h-[100dvh] flex-col bg-neutral-100 overflow-hidden">
      {/* Floating Top Header */}
      <div className="absolute top-4 inset-x-4 z-20 flex items-center justify-between pointer-events-none">
        <button
          type="button"
          onClick={() => router.back()}
          className="pointer-events-auto p-2.5 rounded-full bg-white/95 backdrop-blur-md shadow-md hover:bg-white text-neutral-800 transition active:scale-95"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="pointer-events-auto flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/95 backdrop-blur-md shadow-md border border-neutral-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-black text-neutral-900 tracking-tight flex items-center gap-1">
            <span className="text-amber-500">🚕</span> Swypik Go
          </span>
          <span className="text-[11px] text-neutral-400 font-medium pl-1 border-l border-neutral-200">
            București & Ilfov
          </span>
        </div>
      </div>

      {/* Hartă */}
      <div className="relative flex-1">
        <MapView
          center={pickup ?? BUCHAREST}
          flyTo={dropoff ?? pickup}
          fitBounds={bounds}
          className="absolute inset-0 z-0 h-full w-full"
        >
          {pickup ? <LiveMarker position={pickup} kind="pickup" label={pickup.address} /> : null}
          {dropoff ? <LiveMarker position={dropoff} kind="dropoff" label={dropoff.address} /> : null}
          {pickup && dropoff ? <RoutePolyline points={[pickup, dropoff]} /> : null}
        </MapView>
      </div>

      {/* Panou comandă - Modern Bottom Sheet */}
      <div className="z-10 rounded-t-3xl bg-white p-4 sm:p-5 pb-6 shadow-[0_-10px_30px_rgba(0,0,0,.12)] border-t border-neutral-100 max-h-[65vh] overflow-y-auto">
        {/* Drag Handle Indicator */}
        <div className="w-10 h-1 rounded-full bg-neutral-200 mx-auto mb-3" />

        <div className="flex items-center justify-between mb-3">
          <h1 className="text-base font-black tracking-tight text-neutral-900 flex items-center gap-1.5">
            <span>Unde mergi azi?</span>
          </h1>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <Clock size={11} /> Sosire ~3-5 min
          </span>
        </div>

        {/* Câmpuri Adrese Autocomplete */}
        <div className="space-y-2">
          <AddressAutocomplete
            placeholder={t("pickupPlaceholder")}
            value={pickup?.address}
            onSelect={setPickup}
            icon={<span className="block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />}
          />
          <AddressAutocomplete
            placeholder={t("dropoffPlaceholder")}
            value={dropoff?.address}
            onSelect={setDropoff}
            icon={<span className="block h-2.5 w-2.5 rounded-full bg-rose-500 ring-4 ring-rose-100" />}
          />
        </div>

        {/* Destinații Rapide (Quick Presets) */}
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                haptic("tap");
                setDropoff({ address: p.address, lat: p.lat, lng: p.lng });
              }}
              className="shrink-0 px-2.5 py-1.5 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-700 font-semibold flex items-center gap-1.5 transition active:scale-95"
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Clase Vehicul (Cards) */}
        <div className="mt-3.5 grid grid-cols-3 gap-2">
          {CLASSES.map((c) => {
            const isSel = vehicleClass === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  haptic("tap");
                  setVehicleClass(c.id);
                }}
                className={`relative rounded-2xl p-2.5 text-center transition duration-150 active:scale-98 border ${
                  isSel
                    ? "border-neutral-900 bg-neutral-900 text-white shadow-md ring-2 ring-neutral-900/10"
                    : "border-neutral-200 bg-white hover:border-neutral-300 text-neutral-800"
                }`}
              >
                <div className="flex justify-center mb-1">
                  <c.Icon size={22} className={isSel ? "text-amber-400" : "text-neutral-700"} />
                </div>
                <div className="text-xs font-black truncate">{t(c.labelKey)}</div>
                <div className={`text-[11px] font-bold mt-0.5 ${isSel ? "text-amber-300" : "text-neutral-900"}`}>
                  {loading ? "…" : fmt(estimates[c.id])}
                </div>
                <div className={`text-[9px] mt-0.5 ${isSel ? "text-neutral-300" : "text-neutral-400"}`}>
                  {c.seats} locuri
                </div>
              </button>
            );
          })}
        </div>

        {/* Detalii ETA & Surge */}
        {selected ? (
          <div className="mt-2.5 flex items-center justify-between text-[11px] px-1 text-neutral-600 font-medium">
            <span>Distanță: {selected.distance_km.toFixed(1)} km</span>
            <span className="font-bold text-neutral-800">Timp estimat: ~{selected.duration_min} min</span>
          </div>
        ) : null}

        {selected && Number(selected.breakdown?.surge_multiplier) > 1 ? (
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs font-bold text-amber-600 bg-amber-50 py-1.5 rounded-xl border border-amber-200">
            <Zap size={14} className="fill-amber-500 text-amber-500" /> Tarif dinamic activ ({Number(selected.breakdown.surge_multiplier).toFixed(2)}x cerere ridicată)
          </p>
        ) : null}

        {error ? <p className="mt-2 text-center text-xs font-bold text-rose-600 bg-rose-50 p-2 rounded-xl border border-rose-200">{error}</p> : null}

        {/* Card Plată Moneda SWYP (10% reducere) */}
        {swypInfo ? (
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setUseSwyp((v) => !v);
            }}
            aria-pressed={useSwyp}
            className={`mt-3 flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${
              useSwyp ? "border-amber-400 bg-amber-50/50 shadow-sm" : "border-neutral-200 hover:bg-neutral-50"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm shrink-0">
                🪙
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-neutral-900">Plătește cu SWYP Pay</span>
                  <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-500 text-white uppercase tracking-wider">
                    -10% REDUCERE
                  </span>
                </div>
                <span className="block text-[11px] text-neutral-500 font-medium">
                  Sold disponibil: {swypInfo.balanceSwyp.toFixed(0)} SWYP ({(swypInfo.balanceSwyp * swypInfo.ronPerSwyp).toFixed(2)} lei)
                </span>
              </div>
            </div>

            <span
              className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition ${
                useSwyp ? "bg-amber-500" : "bg-neutral-300"
              }`}
            >
              <span
                className={`block h-4 w-4 rounded-full bg-white transition shadow-sm ${
                  useSwyp ? "translate-x-4" : ""
                }`}
              />
            </span>
          </button>
        ) : null}

        {/* CTA Comandă Cursă */}
        <button
          type="button"
          disabled={!pickup || !dropoff || !selected || ordering}
          onClick={order}
          className="mt-3.5 w-full rounded-2xl bg-[#0D0D0D] hover:bg-neutral-800 active:scale-[0.99] py-3.5 text-sm font-black text-white shadow-lg transition disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {ordering ? (
            <span>Se caută cel mai apropiat șofer...</span>
          ) : selected ? (
            <>
              <span>Cheamă {t(CLASSES.find((c) => c.id === vehicleClass)?.labelKey || "Mașină")}</span>
              <span className="text-amber-400 font-extrabold">•</span>
              <span>{fmt(selected)}</span>
            </>
          ) : (
            <span>Alege destinația</span>
          )}
        </button>
      </div>
    </div>
  );
}
