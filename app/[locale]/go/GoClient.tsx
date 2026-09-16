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
import {
  Bus,
  Car,
  CarFront,
  Zap,
  ArrowLeft,
  ArrowUpDown,
  History,
  Clock,
  Wind,
  VolumeX,
  Luggage,
  type LucideIcon,
} from "lucide-react";
import { haptic } from "@/lib/haptic";
import { DEFAULT_MAP_CENTER } from "@/lib/config/geo";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
const LiveMarker = dynamic(() => import("@/components/map/LiveMarker"), { ssr: false });
const RoutePolyline = dynamic(() => import("@/components/map/RoutePolyline"), { ssr: false });

const BUCHAREST = DEFAULT_MAP_CENTER;

/** Destinații reale și populare din București */
const POPULAR_DESTINATIONS = [
  { label: "Aeroport OTP", icon: "✈️", address: "Aeroportul Internațional Henri Coandă, Otopeni", lat: 44.5711, lng: 26.0858, badge: "Otopeni" },
  { label: "Gara de Nord", icon: "🚆", address: "Piața Gării de Nord 1, București", lat: 44.4473, lng: 26.0754, badge: "Tren" },
  { label: "AFI Cotroceni", icon: "🛍️", address: "Bulevardul Vasile Milea 4, București", lat: 44.4305, lng: 26.0528, badge: "Mall" },
  { label: "Piața Unirii", icon: "🏛️", address: "Piața Unirii, București", lat: 44.4278, lng: 26.1025, badge: "Centru" },
  { label: "Herăstrău", icon: "🌳", address: "Șoseaua Nordului 1, București", lat: 44.4716, lng: 26.0825, badge: "Nord" },
  { label: "Calea Victoriei", icon: "💼", address: "Calea Victoriei 155, București", lat: 44.4485, lng: 26.0882, badge: "Business" },
] as const;

/** Clase de vehicule adaptate pieței din România */
const CLASSES: readonly {
  id: "economy" | "comfort" | "van";
  labelKey: string;
  name: string;
  models: string;
  Icon: LucideIcon;
  seats: number;
  defaultEta: string;
  accent: string;
}[] = [
  {
    id: "economy",
    labelKey: "classEconomy",
    name: "Economy",
    models: "Dacia Logan, Renault Clio",
    Icon: Car,
    seats: 4,
    defaultEta: "2-3 min",
    accent: "#10B981",
  },
  {
    id: "comfort",
    labelKey: "classComfort",
    name: "Comfort",
    models: "Toyota Corolla, Skoda Octavia",
    Icon: CarFront,
    seats: 4,
    defaultEta: "3-4 min",
    accent: "#F59E0B",
  },
  {
    id: "van",
    labelKey: "classVan",
    name: "Van XL",
    models: "Mercedes Vito, VW Multivan",
    Icon: Bus,
    seats: 6,
    defaultEta: "5-6 min",
    accent: "#6366F1",
  },
] as const;

type Estimate = {
  total_cents: number;
  currency: string;
  distance_km: number;
  duration_min: number;
  breakdown: { surge_multiplier: number };
};

type NearbyDriver = {
  id: string;
  lat: number;
  lng: number;
  heading: number;
  eta: string;
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
  const [ridePreferences, setRidePreferences] = useState({
    ac: true,
    quiet: false,
    luggage: false,
  });

  // Soldul și cursul SWYP Pay
  useEffect(() => {
    Promise.all([
      fetch("/api/swyp/rate").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/swyp/wallet").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([rate, bal]) => {
        const ron = Number(rate?.ron_per_swyp ?? 0);
        const balance = Number(bal?.balanceUnits ?? 0) / 100;
        if (ron > 0 && balance > 0) setSwypInfo({ ronPerSwyp: ron, balanceSwyp: balance });
      })
      .catch(() => {});
  }, []);

  // Deep link din alte pagini: /go?dropoff=...&dlat=...&dlng=...
  useEffect(() => {
    const addr = searchParams.get("dropoff");
    if (!addr) return;
    const lat = Number.parseFloat(searchParams.get("dlat") ?? "");
    const lng = Number.parseFloat(searchParams.get("dlng") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setDropoff((d) => d ?? { address: addr, lat, lng });
  }, [searchParams]);

  // Geolocalizare inițială
  useEffect(() => {
    if (!navigator.geolocation || pickup) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPickup((p) => p ?? { address: t("myLocation"), lat, lng });
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

  // Șoferi activi simulați în jur (dau viață hărții ca în Uber/Bolt)
  const nearbyDrivers = useMemo<NearbyDriver[]>(() => {
    const origin = pickup ?? BUCHAREST;
    return [
      { id: "drv-1", lat: origin.lat + 0.0031, lng: origin.lng + 0.0028, heading: 45, eta: "2 min" },
      { id: "drv-2", lat: origin.lat - 0.0039, lng: origin.lng + 0.0036, heading: 135, eta: "3 min" },
      { id: "drv-3", lat: origin.lat + 0.0024, lng: origin.lng - 0.0042, heading: 275, eta: "4 min" },
      { id: "drv-4", lat: origin.lat - 0.0019, lng: origin.lng - 0.0031, heading: 215, eta: "3 min" },
    ];
  }, [pickup]);

  const handleLocateMe = useCallback(() => {
    haptic("tap");
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPickup({ address: "Locația mea curentă", lat, lng });
        void fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { result?: { address?: string } } | null) => {
            if (d?.result?.address) {
              setPickup({ address: d.result.address, lat, lng });
            }
          })
          .catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 5000 },
    );
  }, []);

  const swapLocations = () => {
    haptic("tap");
    const temp = pickup;
    setPickup(dropoff);
    setDropoff(temp);
  };

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
  }, [pickup, dropoff, t]);

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
          payment_method: useSwyp ? "swyp" : "cash",
          use_swyp: useSwyp && !!swypInfo,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.ride_id) {
        router.push(`/go/${data.ride_id}`);
        return;
      }
      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/auth/login?next=${encodeURIComponent("/go")}`);
          return;
        }
        setError(res.status === 422 ? t("noZone") : data.error ?? t("orderError"));
        return;
      }
      router.push(`/go/${data.ride_id}`);
    } finally {
      setOrdering(false);
    }
  };

  const fmt = (e: Estimate | null | undefined) => {
    if (!e) return "—";
    const baseRon = e.total_cents / 100;
    if (useSwyp && swypInfo) {
      const discounted = baseRon * 0.9;
      return `${discounted.toFixed(0)} lei`;
    }
    return `${baseRon.toFixed(0)} lei`;
  };

  const bounds = useMemo(() => (pickup && dropoff ? [pickup, dropoff] : null), [pickup, dropoff]);
  const selected = estimates[vehicleClass];

  // Calcul oră estimată de sosire
  const arrivalTime = useMemo(() => {
    if (!selected?.duration_min) return null;
    const now = new Date();
    now.setMinutes(now.getMinutes() + selected.duration_min + 3);
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [selected]);

  return (
    <div className="relative flex h-[100dvh] flex-col bg-[#F3F4F6] overflow-hidden select-none">
      {/* Header plutitor modern */}
      <div className="absolute top-4 inset-x-4 z-20 flex items-center justify-between pointer-events-none">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white/95 backdrop-blur-md shadow-lg border border-black/5 text-neutral-800 transition active:scale-95 hover:bg-white"
          aria-label="Înapoi acasă"
        >
          <ArrowLeft size={19} />
        </button>

        <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/95 backdrop-blur-md shadow-lg border border-black/5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-black text-neutral-900 tracking-tight flex items-center gap-1.5">
            <span className="text-amber-500">🚕</span> Swypik Go
          </span>
          <span className="text-[10px] font-bold text-neutral-400 pl-1.5 border-l border-neutral-200">
            București & Ilfov
          </span>
        </div>

        <button
          type="button"
          onClick={() => router.push("/go/history")}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white/95 backdrop-blur-md shadow-lg border border-black/5 text-neutral-800 transition active:scale-95 hover:bg-white"
          aria-label="Istoric curse"
        >
          <History size={18} />
        </button>
      </div>

      {/* Hartă interactivă CartoDB Voyager */}
      <div className="relative flex-1">
        <MapView
          center={pickup ?? BUCHAREST}
          flyTo={dropoff ?? pickup}
          fitBounds={bounds}
          onLocate={handleLocateMe}
          showControls={true}
          className="absolute inset-0 z-0 h-full w-full"
        >
          {/* Punct de preluare */}
          {pickup ? <LiveMarker position={pickup} kind="pickup" label={pickup.address} /> : null}

          {/* Destinație */}
          {dropoff ? <LiveMarker position={dropoff} kind="dropoff" label={dropoff.address} /> : null}

          {/* Rută reală pe străzi via OSRM */}
          {pickup && dropoff ? <RoutePolyline points={[pickup, dropoff]} color="#10B981" casingColor="#0D0D0D" /> : null}

          {/* Mașini live disponibile în apropiere */}
          {nearbyDrivers.map((d) => (
            <LiveMarker
              key={d.id}
              position={{ lat: d.lat, lng: d.lng }}
              kind="nearby"
              heading={d.heading}
              eta={d.eta}
            />
          ))}
        </MapView>
      </div>

      {/* Panou de comandă inferior — stil Uber / Bolt Super-App */}
      <div className="z-10 rounded-t-3xl bg-white p-4 sm:p-5 pb-6 shadow-[0_-12px_40px_rgba(0,0,0,0.14)] border-t border-neutral-100 max-h-[66vh] overflow-y-auto">
        {/* Indicator drag / mânere */}
        <div className="w-10 h-1 rounded-full bg-neutral-200 mx-auto mb-3" />

        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[16px] font-black tracking-tight text-neutral-900">Unde mergi azi?</h1>
            <p className="text-[11px] text-neutral-500 font-medium">Curse rapide cu șoferi verificați</p>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1.5 shadow-sm">
            <Clock size={12} className="text-emerald-600" /> Sosire în ~2-3 min
          </span>
        </div>

        {/* Câmpuri Adrese cu buton Inversare (⇅) */}
        <div className="relative space-y-2">
          <AddressAutocomplete
            placeholder="Punct de preluare (locația ta)"
            value={pickup?.address}
            onSelect={setPickup}
            onClear={() => setPickup(null)}
            icon={<span className="block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 shrink-0" />}
          />

          {pickup && dropoff && (
            <button
              type="button"
              onClick={swapLocations}
              className="absolute right-3 top-[34px] z-10 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition hover:scale-105 active:scale-90"
              aria-label="Inversează adresele"
            >
              <ArrowUpDown size={12} />
            </button>
          )}

          <AddressAutocomplete
            placeholder="Introdu adresa de destinație..."
            value={dropoff?.address}
            onSelect={setDropoff}
            onClear={() => setDropoff(null)}
            icon={<span className="block h-2.5 w-2.5 rounded-full bg-rose-500 ring-4 ring-rose-100 shrink-0" />}
          />
        </div>

        {/* Destinații rapide din București */}
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          {POPULAR_DESTINATIONS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                haptic("tap");
                setDropoff({ address: p.address, lat: p.lat, lng: p.lng });
              }}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/80 text-neutral-800 font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
              <span className="text-[10px] text-neutral-400 font-medium">{p.badge}</span>
            </button>
          ))}
        </div>

        {/* Selector Clase Vehicule */}
        <div className="mt-3 grid grid-cols-3 gap-2">
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
                className={`relative rounded-2xl p-2.5 text-center transition duration-200 active:scale-[0.98] border ${
                  isSel
                    ? "border-neutral-950 bg-neutral-950 text-white shadow-lg ring-2 ring-neutral-950/15"
                    : "border-neutral-200/90 bg-white hover:border-neutral-300 text-neutral-800 shadow-sm"
                }`}
              >
                <div className="flex justify-center mb-1">
                  <c.Icon size={22} className={isSel ? "text-amber-400" : "text-neutral-700"} />
                </div>
                <div className="text-[12px] font-black truncate">{c.name}</div>
                <div className={`text-[12px] font-black mt-0.5 ${isSel ? "text-amber-300" : "text-neutral-900"}`}>
                  {loading ? "…" : fmt(estimates[c.id])}
                </div>
                <div className={`text-[9px] font-semibold mt-0.5 truncate ${isSel ? "text-neutral-400" : "text-neutral-400"}`}>
                  {c.seats} locuri • {c.defaultEta}
                </div>
              </button>
            );
          })}
        </div>

        {/* Detalii cursă (Distanță, Timp & Sosire estimată) */}
        {selected ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2 text-[11px] font-bold text-neutral-700 border border-neutral-200/70">
            <span className="flex items-center gap-1">
              <span>📏 {selected.distance_km.toFixed(1)} km</span>
              <span className="text-neutral-300">•</span>
              <span>⏱️ ~{selected.duration_min} min drum</span>
            </span>
            {arrivalTime ? (
              <span className="text-neutral-900 font-extrabold bg-white px-2 py-0.5 rounded-lg border border-neutral-200 shadow-xs">
                Sosire la {arrivalTime}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Alertă Surge Pricing */}
        {selected && Number(selected.breakdown?.surge_multiplier) > 1 ? (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] font-bold text-amber-800 bg-amber-50 py-1.5 px-2 rounded-xl border border-amber-200">
            <Zap size={13} className="fill-amber-500 text-amber-500 shrink-0" />
            Tarif dinamic activ ({Number(selected.breakdown.surge_multiplier).toFixed(2)}x cerere ridicată în zonă)
          </p>
        ) : null}

        {error ? (
          <p className="mt-2 text-center text-xs font-bold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
            {error}
          </p>
        ) : null}

        {/* Preferințe Călătorie */}
        <div className="mt-3 flex items-center gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setRidePreferences((p) => ({ ...p, ac: !p.ac }));
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-bold transition ${
              ridePreferences.ac
                ? "bg-sky-50 text-sky-700 border-sky-200 shadow-xs"
                : "bg-white text-neutral-500 border-neutral-200"
            }`}
          >
            <Wind size={12} /> AC pornit
          </button>
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setRidePreferences((p) => ({ ...p, quiet: !p.quiet }));
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-bold transition ${
              ridePreferences.quiet
                ? "bg-purple-50 text-purple-700 border-purple-200 shadow-xs"
                : "bg-white text-neutral-500 border-neutral-200"
            }`}
          >
            <VolumeX size={12} /> Călătorie silențioasă
          </button>
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setRidePreferences((p) => ({ ...p, luggage: !p.luggage }));
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-bold transition ${
              ridePreferences.luggage
                ? "bg-amber-50 text-amber-700 border-amber-200 shadow-xs"
                : "bg-white text-neutral-500 border-neutral-200"
            }`}
          >
            <Luggage size={12} /> Bagaje mari
          </button>
        </div>

        {/* Plată cu SWYP Pay (-10% reducere) */}
        {swypInfo ? (
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setUseSwyp((v) => !v);
            }}
            aria-pressed={useSwyp}
            className={`mt-3 flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${
              useSwyp
                ? "border-amber-400 bg-amber-50/70 shadow-sm"
                : "border-neutral-200 bg-neutral-50/50 hover:bg-neutral-50"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-400 text-black flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                🪙
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-neutral-900">Plătește cu SWYP Pay</span>
                  <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-amber-500 text-black uppercase tracking-wider">
                    -10% REDUCERE
                  </span>
                </div>
                <span className="block text-[11px] text-neutral-500 font-medium">
                  Sold: {swypInfo.balanceSwyp.toFixed(0)} SWYP ({(swypInfo.balanceSwyp * swypInfo.ronPerSwyp).toFixed(2)} lei)
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

        {/* Buton principal Comandă Cursă */}
        <button
          type="button"
          disabled={!pickup || !dropoff || !selected || ordering}
          onClick={order}
          className="mt-3.5 w-full rounded-2xl bg-[#0D0D0D] hover:bg-neutral-800 active:scale-[0.99] py-3.5 text-[15px] font-black text-white shadow-xl transition disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {ordering ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span>Se caută cel mai apropiat șofer...</span>
            </span>
          ) : selected ? (
            <>
              <span>Cheamă {CLASSES.find((c) => c.id === vehicleClass)?.name}</span>
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
