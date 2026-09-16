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
  ShieldCheck,
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

  // Șoferi activi pe hartă cu simulare dinamică a deplasării (Live Crawl stil Uber & Bolt)
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([
    { id: "drv-1", lat: BUCHAREST.lat + 0.0031, lng: BUCHAREST.lng + 0.0028, heading: 45, eta: "2 min" },
    { id: "drv-2", lat: BUCHAREST.lat - 0.0039, lng: BUCHAREST.lng + 0.0036, heading: 135, eta: "3 min" },
    { id: "drv-3", lat: BUCHAREST.lat + 0.0024, lng: BUCHAREST.lng - 0.0042, heading: 275, eta: "4 min" },
    { id: "drv-4", lat: BUCHAREST.lat - 0.0019, lng: BUCHAREST.lng - 0.0031, heading: 215, eta: "3 min" },
  ]);

  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card");
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [safetyPin] = useState(() => Math.floor(1000 + Math.random() * 9000).toString());

  // Repoziționează mașinile când utilizatorul își alege locația de pornire
  useEffect(() => {
    if (!pickup) return;
    setNearbyDrivers([
      { id: "drv-1", lat: pickup.lat + 0.0028, lng: pickup.lng + 0.0025, heading: 45, eta: "2 min" },
      { id: "drv-2", lat: pickup.lat - 0.0032, lng: pickup.lng + 0.0031, heading: 135, eta: "3 min" },
      { id: "drv-3", lat: pickup.lat + 0.0021, lng: pickup.lng - 0.0038, heading: 275, eta: "4 min" },
      { id: "drv-4", lat: pickup.lat - 0.0017, lng: pickup.lng - 0.0026, heading: 215, eta: "3 min" },
    ]);
  }, [pickup?.lat, pickup?.lng]);

  // Simulare fluidă de deplasare a mașinilor pe străzi (actualizare heading și mișcare organică la 2.2 secunde)
  useEffect(() => {
    const interval = setInterval(() => {
      setNearbyDrivers((drivers) =>
        drivers.map((d) => {
          const rad = (d.heading * Math.PI) / 180;
          const step = 0.00012; // deplasare realistă ~13 metri
          const deltaLat = Math.cos(rad) * step;
          const deltaLng = Math.sin(rad) * step;
          const newHeading = (d.heading + (Math.random() * 12 - 6) + 360) % 360;
          return {
            ...d,
            lat: d.lat + deltaLat,
            lng: d.lng + deltaLng,
            heading: Math.round(newHeading),
          };
        }),
      );
    }, 2200);
    return () => clearInterval(interval);
  }, []);

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
          payment_method: paymentMethod,
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

      {/* Banner flotant stadiu trafic în timp real (stil Uber & Bolt) */}
      {selected ? (
        <div className="absolute top-18 inset-x-4 z-20 pointer-events-none flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-950/90 dark:bg-black/95 backdrop-blur-md text-white shadow-2xl border border-white/15 animate-in fade-in slide-in-from-top-2 duration-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-black tracking-tight">Trafic optim</span>
            <span className="text-white/30 text-[10px]">•</span>
            <span className="text-amber-400 text-[11px] font-black">~{selected.duration_min} min</span>
            <span className="text-white/60 text-[10px] font-semibold">({selected.distance_km.toFixed(1)} km)</span>
            {arrivalTime ? (
              <span className="text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-md border border-emerald-500/30">
                Sosire {arrivalTime}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Hartă interactivă Swypik Go */}
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

        {/* Buton Plutitor Swypik Shield (Siguranță Cursă stil Bolt / Uber) */}
        <div className="absolute left-4 bottom-4 z-[400] pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowSafetyModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-xl border border-black/10 dark:border-white/10 text-neutral-900 dark:text-neutral-100 hover:scale-105 active:scale-95 transition"
            aria-label="Opțiuni Siguranță Swypik Shield"
          >
            <ShieldCheck size={16} className="text-emerald-500" />
            <span className="text-[11px] font-black tracking-tight">Siguranță</span>
          </button>
        </div>
      </div>

      {/* Panou de comandă inferior — Super-App Mobility Luxury (Uber Black & Bolt Executive) */}
      <div className="z-10 rounded-t-3xl bg-white p-4 sm:p-5 pb-24 sm:pb-28 shadow-[0_-16px_48px_rgba(0,0,0,0.16)] border-t border-neutral-100 max-h-[68vh] overflow-y-auto">
        {/* Indicator drag */}
        <div className="w-12 h-1.2 rounded-full bg-neutral-200 mx-auto mb-3.5" />

        {/* Header cu tipografie Luxury Executive */}
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                ✦ Swypik Ride • Mobilitate Premium
              </span>
            </div>
            <h1 className="text-[18px] font-black tracking-tight text-neutral-950 leading-tight">
              Unde dorești să călătorești?
            </h1>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 shadow-xs">
              <Clock size={12} className="text-emerald-600" /> ~2-3 min
            </span>
            <span className="text-[9px] font-bold text-neutral-400 mt-0.5">Șoferi activi acum</span>
          </div>
        </div>

        {/* Card conectat de călătorie (Preluare → Traseu → Destinație) */}
        <div className="relative rounded-2xl bg-neutral-50/90 p-2.5 border border-neutral-200/90 shadow-xs space-y-2">
          {/* Traseu vertical stil fir luminos */}
          <div className="absolute left-[25px] top-[26px] bottom-[26px] w-[2px] bg-gradient-to-b from-emerald-500 via-neutral-300 to-rose-500 pointer-events-none rounded-full" />

          {/* Adresă Preluare */}
          <div className="relative pl-6">
            <AddressAutocomplete
              placeholder="Punct de preluare (locația ta)"
              value={pickup?.address}
              onSelect={setPickup}
              onClear={() => setPickup(null)}
              icon={<span className="block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 shrink-0" />}
            />
          </div>

          {/* Buton Inversare (⇅) integrat fluid */}
          {pickup && dropoff && (
            <div className="relative flex justify-end pr-2 -my-2 z-10">
              <button
                type="button"
                onClick={swapLocations}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition hover:scale-110 active:scale-90"
                aria-label="Inversează adresele"
              >
                <ArrowUpDown size={12} />
              </button>
            </div>
          )}

          {/* Adresă Destinație */}
          <div className="relative pl-6">
            <AddressAutocomplete
              placeholder="Unde dorești să mergi? (introdu destinația)"
              value={dropoff?.address}
              onSelect={setDropoff}
              onClear={() => setDropoff(null)}
              icon={<span className="block h-2.5 w-2.5 rounded-full bg-rose-500 ring-4 ring-rose-100 shrink-0" />}
            />
          </div>
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

        {/* Selector Clase Vehicule — Carduri Luxury */}
        <div className="mt-3.5 grid grid-cols-3 gap-2.5">
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
                className={`relative flex flex-col justify-between rounded-2xl p-3 text-left transition-all duration-200 active:scale-[0.98] border ${
                  isSel
                    ? "border-neutral-950 bg-neutral-950 text-white shadow-xl ring-2 ring-neutral-950/25"
                    : "border-neutral-200/90 bg-white hover:border-neutral-300 text-neutral-800 shadow-xs hover:shadow-sm"
                }`}
              >
                {isSel && (
                  <div className="absolute -top-2 right-2 px-1.5 py-0.5 rounded-full bg-emerald-500 text-[8px] font-black uppercase tracking-wider text-black shadow-sm">
                    Selectat
                  </div>
                )}
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-1.5 rounded-xl ${isSel ? "bg-white/10" : "bg-neutral-100"}`}>
                    <c.Icon size={20} className={isSel ? "text-amber-400" : "text-neutral-800"} />
                  </div>
                  <span className={`text-[10px] font-black ${isSel ? "text-emerald-400" : "text-neutral-500"}`}>
                    {c.defaultEta}
                  </span>
                </div>
                <div>
                  <div className="text-[12.5px] font-black tracking-tight truncate">{c.name}</div>
                  <div className={`text-[14px] font-black mt-0.5 tracking-tight ${isSel ? "text-amber-300" : "text-neutral-950"}`}>
                    {loading ? "…" : fmt(estimates[c.id])}
                  </div>
                  <div className={`text-[9.5px] font-semibold mt-0.5 truncate ${isSel ? "text-neutral-400" : "text-neutral-400"}`}>
                    👤 {c.seats} locuri
                  </div>
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

        {/* Selector Metodă de Plată (stil Bolt Super-App) */}
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-neutral-50 p-2 border border-neutral-200/90">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setPaymentMethod("card");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition ${
                paymentMethod === "card"
                  ? "bg-neutral-900 text-white shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <span>💳</span>
              <span>Card</span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setPaymentMethod("cash");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition ${
                paymentMethod === "cash"
                  ? "bg-neutral-900 text-white shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <span>💵</span>
              <span>Numerar</span>
            </button>
          </div>

          {/* Toggle SWYP Pay (-10% reducere pe cursă) */}
          {swypInfo ? (
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setUseSwyp((v) => !v);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-[11px] transition ${
                useSwyp
                  ? "bg-amber-400 text-black shadow-sm ring-2 ring-amber-400/40"
                  : "bg-neutral-200/80 text-neutral-700 hover:bg-neutral-300"
              }`}
            >
              <span>🪙</span>
              <span>SWYP Pay</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-black/10 text-black font-black">-10%</span>
            </button>
          ) : null}
        </div>

        {/* Buton principal Comandă Cursă — High-Impact CTA */}
        <button
          type="button"
          disabled={!pickup || !dropoff || !selected || ordering}
          onClick={order}
          className="mt-4 w-full rounded-2xl bg-neutral-950 hover:bg-neutral-900 active:scale-[0.99] py-4 text-white shadow-2xl transition disabled:opacity-40 flex flex-col items-center justify-center gap-0.5"
        >
          {ordering ? (
            <span className="flex items-center gap-2 text-[14px] font-black">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span>Se alocă cel mai apropiat șofer...</span>
            </span>
          ) : selected ? (
            <>
              <div className="flex items-center gap-2 text-[15px] font-black tracking-tight">
                <span>COMANDĂ {CLASSES.find((c) => c.id === vehicleClass)?.name.toUpperCase()}</span>
                <span className="text-amber-400 font-extrabold">•</span>
                <span className="text-amber-300">{fmt(selected)}</span>
              </div>
              <span className="text-[10px] font-medium text-neutral-400">
                ✓ Tarif fix garantat • Șofer confirmat în ~30 secunde
              </span>
            </>
          ) : (
            <span className="text-[14px] font-black">Alege destinația pentru a comanda</span>
          )}
        </button>
      </div>

      {/* Modal Swypik Shield (Opțiuni de Siguranță stil Uber/Bolt) */}
      {showSafetyModal ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-2xl border border-neutral-200 animate-in slide-in-from-bottom-6 duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h2 className="text-[17px] font-black text-neutral-900 tracking-tight">Swypik Shield</h2>
                  <p className="text-[11px] text-neutral-500 font-medium">Siguranță garantată pentru fiecare cursă</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSafetyModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 mb-5">
              {/* Cod PIN Securitate */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-neutral-50 border border-neutral-200">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🔢</span>
                  <div>
                    <span className="block text-xs font-black text-neutral-900">Cod PIN Cursă</span>
                    <span className="block text-[10px] text-neutral-500">Confirmă codul cu șoferul înainte de plecare</span>
                  </div>
                </div>
                <span className="text-base font-black tracking-widest text-emerald-600 bg-white px-2.5 py-1 rounded-xl border border-emerald-200 shadow-xs">
                  {safetyPin}
                </span>
              </div>

              {/* Partajare traseu */}
              <button
                type="button"
                onClick={() => {
                  haptic("tap");
                  const text = `Urmărește cursa mea pe Swypik Go: https://swypik.com/go`;
                  if (navigator.share) {
                    navigator.share({ title: "Cursa mea Swypik Go", text, url: "https://swypik.com/go" }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(text);
                    alert("Link-ul cursei a fost copiat!");
                  }
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 transition text-left"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">📱</span>
                  <div>
                    <span className="block text-xs font-black text-neutral-900">Trimite cursa prietenilor</span>
                    <span className="block text-[10px] text-neutral-500">Traseu și mașină vizibile în timp real</span>
                  </div>
                </div>
                <span className="text-xs font-black text-emerald-600">Partajează →</span>
              </button>

              {/* Buton 112 Urgență */}
              <a
                href="tel:112"
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 transition text-left"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🚨</span>
                  <div>
                    <span className="block text-xs font-black text-rose-700">Apel Urgență 112</span>
                    <span className="block text-[10px] text-rose-600">
                      GPS: {pickup ? `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}` : "Disponibil live"}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-black text-rose-700">Apelează</span>
              </a>
            </div>

            <button
              type="button"
              onClick={() => setShowSafetyModal(false)}
              className="w-full py-3 rounded-2xl bg-neutral-950 text-white font-black text-xs uppercase tracking-wider"
            >
              Închide
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
