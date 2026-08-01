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
import { Bus, Car, CarFront, type LucideIcon } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { DEFAULT_MAP_CENTER } from "@/lib/config/geo";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
const LiveMarker = dynamic(() => import("@/components/map/LiveMarker"), { ssr: false });
const RoutePolyline = dynamic(() => import("@/components/map/RoutePolyline"), { ssr: false });

const BUCHAREST = DEFAULT_MAP_CENTER;

const CLASSES: readonly { id: "economy" | "comfort" | "van"; labelKey: string; Icon: LucideIcon; hintKey: string }[] = [
  { id: "economy", labelKey: "classEconomy", Icon: Car, hintKey: "hintEconomy" },
  { id: "comfort", labelKey: "classComfort", Icon: CarFront, hintKey: "hintComfort" },
  { id: "van", labelKey: "classVan", Icon: Bus, hintKey: "hintVan" },
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
    <div className="relative flex h-[100dvh] flex-col bg-neutral-50">
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

      {/* Panou comandă */}
      <div className="z-10 rounded-t-3xl bg-white p-4 pb-6 shadow-[0_-8px_24px_rgba(0,0,0,.08)]">
        <h1 className="mb-3 text-lg font-extrabold tracking-tight">{t("title")} 🚕</h1>
        <div className="space-y-2">
          <AddressAutocomplete
            placeholder={t("pickupPlaceholder")}
            value={pickup?.address}
            onSelect={setPickup}
            icon={<span className="text-sm">🟢</span>}
          />
          <AddressAutocomplete
            placeholder={t("dropoffPlaceholder")}
            value={dropoff?.address}
            onSelect={setDropoff}
            icon={<span className="text-sm">🔴</span>}
          />
        </div>

        {/* Clase vehicul */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {CLASSES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                haptic("tap");
                setVehicleClass(c.id);
              }}
              className={`rounded-2xl border p-3 text-center transition ${vehicleClass === c.id
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white"
                }`}
            >
              <div className="text-xl">{c.emoji}</div>
              <div className="text-[13px] font-bold">{t(c.labelKey)}</div>
              <div className={`text-[12px] ${vehicleClass === c.id ? "text-neutral-300" : "text-neutral-500"}`}>
                {loading ? "…" : fmt(estimates[c.id])}
              </div>
            </button>
          ))}
        </div>

        {selected ? (
          <p className="mt-2 text-center text-[12px] text-neutral-500">
            {t("eta", { min: selected.duration_min, km: selected.distance_km.toFixed(1) })}
          </p>
        ) : null}
        {selected && Number(selected.breakdown?.surge_multiplier) > 1 ? (
          <p className="mt-2 text-center text-[12px] font-semibold text-amber-600">
            ⚡ {t("surge", { mult: Number(selected.breakdown.surge_multiplier).toFixed(2) })}
          </p>
        ) : null}
        {error ? <p className="mt-2 text-center text-[13px] text-red-600">{error}</p> : null}

        {swypInfo ? (
          <button
            type="button"
            onClick={() => setUseSwyp((v) => !v)}
            aria-pressed={useSwyp}
            className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${useSwyp ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"
              }`}
          >
            <span>
              <span className="block text-[14px] font-bold">{t("paySwyp")}</span>
              <span className="block text-[12px] text-neutral-500">
                {t("swypBalance", {
                  swyp: swypInfo.balanceSwyp.toFixed(0),
                  lei: (swypInfo.balanceSwyp * swypInfo.ronPerSwyp).toFixed(2),
                })}
              </span>
            </span>
            <span
              className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${useSwyp ? "bg-neutral-900" : "bg-neutral-300"
                }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white transition ${useSwyp ? "translate-x-5" : ""}`}
              />
            </span>
          </button>
        ) : null}

        <button
          type="button"
          disabled={!pickup || !dropoff || !selected || ordering}
          onClick={order}
          className="mt-3 w-full rounded-2xl bg-neutral-900 py-4 text-[15px] font-extrabold text-white disabled:opacity-40"
        >
          {ordering
            ? t("ordering")
            : selected
              ? t("order", { price: fmt(selected) })
              : t("orderNoPrice")}
        </button>
      </div>
    </div>
  );
}
