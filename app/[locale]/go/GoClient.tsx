"use client";

/**
 * /go — ecranul de comandă Swypik Go (mobile-first, PWA).
 * Hartă (react-leaflet/OSM) + autocomplete adrese (Nominatim) +
 * selector clasă vehicul cu preț estimat (POST /api/rides/estimate) +
 * buton „Comandă” (POST /api/rides → redirect /go/[id]).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import AddressAutocomplete, { type AddressResult } from "@/components/map/AddressAutocomplete";
import {
  ArrowLeft,
  ArrowUpDown,
  History,
  Clock,
  Wind,
  VolumeX,
  Luggage,
  ShieldCheck,
  ChevronRight,
  CreditCard,
  Banknote,
  Users,
} from "lucide-react";
import { haptic } from "@/lib/haptic";
import { DEFAULT_MAP_CENTER } from "@/lib/config/geo";
import { APP_URL } from "@/lib/app-url";

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

/** Ilustrații vectoriale realiste de lux pentru clasele de vehicule (fără emoticoane) */
function VehicleIllustration({ type }: { type: "economy" | "comfort" | "van" }) {
  if (type === "economy") {
    return (
      <svg width="68" height="32" viewBox="0 0 72 34" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xs">
        <ellipse cx="36" cy="30" rx="30" ry="2.5" fill="#000000" fillOpacity="0.2"/>
        <path d="M7 23C7 23 10 16 20 14L27 8.5C31 6.8 42 6.8 48 8.5L56 14C62 16 65 20 65 24C65 26 63 27 61 27H11C8.5 27 7 25.5 7 23Z" fill="url(#ecoBody)"/>
        <path d="M28 10L21.5 14.5H35V9.5C33 9.5 30 9.7 28 10Z" fill="#38BDF8" fillOpacity="0.9"/>
        <path d="M37 9.5V14.5H52L46 10C43 9.6 39 9.5 37 9.5Z" fill="#38BDF8" fillOpacity="0.9"/>
        <path d="M63 21L65 23H59V21H63Z" fill="#FEF08A"/>
        <path d="M8 21L7 23H11V21H8Z" fill="#EF4444"/>
        <circle cx="19" cy="26" r="5.5" fill="#18181B" stroke="#71717A" strokeWidth="1.8"/>
        <circle cx="19" cy="26" r="2.2" fill="#E4E4E7"/>
        <circle cx="50" cy="26" r="5.5" fill="#18181B" stroke="#71717A" strokeWidth="1.8"/>
        <circle cx="50" cy="26" r="2.2" fill="#E4E4E7"/>
        <defs>
          <linearGradient id="ecoBody" x1="7" y1="7" x2="65" y2="27" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF"/>
            <stop offset="0.6" stopColor="#E2E8F0"/>
            <stop offset="1" stopColor="#94A3B8"/>
          </linearGradient>
        </defs>
      </svg>
    );
  }
  if (type === "comfort") {
    return (
      <svg width="68" height="32" viewBox="0 0 72 34" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xs">
        <ellipse cx="36" cy="30" rx="31" ry="2.5" fill="#000000" fillOpacity="0.3"/>
        <path d="M6 23C6 23 9 15.5 20 13.5L28 8C33 6.5 45 6.5 50 8L59 13.5C64 15.5 66 19.5 66 24C66 26 64 27 61 27H10C7.5 27 6 25.5 6 23Z" fill="url(#comfBody)"/>
        <path d="M12 20H59" stroke="#94A3B8" strokeWidth="0.6"/>
        <path d="M29 9L21.5 14H35V8.5C33 8.5 31 8.7 29 9Z" fill="#0284C7" fillOpacity="0.8"/>
        <path d="M37 8.5V14H55L48.5 9C45 8.6 40 8.5 37 8.5Z" fill="#0284C7" fillOpacity="0.8"/>
        <path d="M64 20.5L66 22.5H60V20.5H64Z" fill="#38BDF8"/>
        <path d="M7 20.5L6 22.5H10V20.5H7Z" fill="#EF4444"/>
        <circle cx="18" cy="26" r="5.8" fill="#09090B" stroke="#F59E0B" strokeWidth="1.6"/>
        <circle cx="18" cy="26" r="2" fill="#F59E0B"/>
        <circle cx="51" cy="26" r="5.8" fill="#09090B" stroke="#F59E0B" strokeWidth="1.6"/>
        <circle cx="51" cy="26" r="2" fill="#F59E0B"/>
        <defs>
          <linearGradient id="comfBody" x1="6" y1="6" x2="66" y2="27" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3F3F46"/>
            <stop offset="0.5" stopColor="#18181B"/>
            <stop offset="1" stopColor="#09090B"/>
          </linearGradient>
        </defs>
      </svg>
    );
  }
  // Van XL
  return (
    <svg width="68" height="32" viewBox="0 0 72 34" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xs">
      <ellipse cx="36" cy="30" rx="31" ry="2.5" fill="#000000" fillOpacity="0.25"/>
      <path d="M7 24V12.5C7 10.5 9 8.5 11 8.5H46L57 14L64 18C66 19.5 66 21 66 24C66 26 64 27 61 27H11C8.5 27 7 25.5 7 24Z" fill="url(#vanBody)"/>
      <rect x="12" y="10.5" width="9" height="6.5" rx="1" fill="#0369A1" fillOpacity="0.8"/>
      <rect x="23" y="10.5" width="10" height="6.5" rx="1" fill="#0369A1" fillOpacity="0.8"/>
      <rect x="35" y="10.5" width="10" height="6.5" rx="1" fill="#0369A1" fillOpacity="0.8"/>
      <path d="M47 10.5H46L55 15L59 17H48V10.5Z" fill="#38BDF8" fillOpacity="0.85"/>
      <rect x="63" y="20" width="3" height="3" rx="0.5" fill="#FEF08A"/>
      <rect x="7" y="16" width="2" height="6" rx="0.5" fill="#EF4444"/>
      <circle cx="18" cy="26" r="5.6" fill="#18181B" stroke="#94A3B8" strokeWidth="1.6"/>
      <circle cx="18" cy="26" r="2.2" fill="#E2E8F0"/>
      <circle cx="51" cy="26" r="5.6" fill="#18181B" stroke="#94A3B8" strokeWidth="1.6"/>
      <circle cx="51" cy="26" r="2.2" fill="#E2E8F0"/>
      <defs>
        <linearGradient id="vanBody" x1="7" y1="8" x2="66" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#334155"/>
          <stop offset="0.6" stopColor="#1E293B"/>
          <stop offset="1" stopColor="#0F172A"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Clase de vehicule adaptate pieței din România */
const CLASSES = [
  {
    id: "economy",
    labelKey: "classEconomy",
    name: "Economy",
    models: "Dacia Logan, Renault Clio",
    seats: 4,
    defaultEta: "2-3 min",
    accent: "#10B981",
  },
  {
    id: "comfort",
    labelKey: "classComfort",
    name: "Comfort",
    models: "Toyota Corolla, Skoda Octavia",
    seats: 4,
    defaultEta: "3-4 min",
    accent: "#F59E0B",
  },
  {
    id: "van",
    labelKey: "classVan",
    name: "Van XL",
    models: "Mercedes Vito, VW Multivan",
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


export default function GoClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("go");
  const locale = useLocale();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [pickup, setPickup] = useState<AddressResult | null>(null);
  const [dropoff, setDropoff] = useState<AddressResult | null>(null);
  const [step, setStep] = useState<"destination" | "vehicle">("destination");
  const [vehicleClass, setVehicleClass] = useState<(typeof CLASSES)[number]["id"]>("economy");
  const [estimates, setEstimates] = useState<Record<string, Estimate | null>>({});
  const [loading, setLoading] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ridePreferences, setRidePreferences] = useState({
    ac: true,
    quiet: false,
    luggage: false,
  });

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
        if (!mountedRef.current) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPickup((p) => p ?? { address: t("myLocation"), lat, lng });
        void fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { result?: { address?: string } } | null) => {
            if (!mountedRef.current) return;
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

  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card");
  const [showSafetyModal, setShowSafetyModal] = useState(false);

  const handleLocateMe = useCallback(() => {
    haptic("tap");
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mountedRef.current) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPickup({ address: t("currentLocationLabel"), lat, lng });
        void fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { result?: { address?: string } } | null) => {
            if (!mountedRef.current) return;
            if (d?.result?.address) {
              setPickup({ address: d.result.address, lat, lng });
            }
          })
          .catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 5000 },
    );
  }, [t]);

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
    const amount = e.total_cents / 100;
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: e.currency || "RON",
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${amount.toFixed(0)} ${e.currency || "RON"}`;
    }
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
          aria-label={t("backHome")}
        >
          <ArrowLeft size={19} />
        </button>

        <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/95 backdrop-blur-md shadow-lg border border-black/5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-black text-neutral-900 tracking-tight flex items-center gap-1.5">
            <span className="text-amber-500">🚕</span> Swypik Go
          </span>
          <span className="text-[10px] font-bold text-neutral-400 pl-1.5 border-l border-neutral-200">
            {t("serviceArea")}
          </span>
        </div>

        <button
          type="button"
          onClick={() => router.push("/go/history")}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white/95 backdrop-blur-md shadow-lg border border-black/5 text-neutral-800 transition active:scale-95 hover:bg-white"
          aria-label={t("rideHistory")}
        >
          <History size={18} />
        </button>
      </div>

      {/* Banner flotant stadiu trafic în timp real (stil Uber & Bolt) */}
      {selected ? (
        <div className="absolute top-18 inset-x-4 z-20 pointer-events-none flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-950/90 dark:bg-black/95 backdrop-blur-md text-white shadow-2xl border border-white/15 animate-in fade-in slide-in-from-top-2 duration-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-black tracking-tight">{t("trafficOptimal")}</span>
            <span className="text-white/30 text-[10px]">•</span>
            <span className="text-amber-400 text-[11px] font-black">
              {t("eta", { min: selected.duration_min, km: selected.distance_km.toFixed(1) })}
            </span>
            {arrivalTime ? (
              <span className="text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-md border border-emerald-500/30">
                {t("arrivalLabel", { time: arrivalTime })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Hartă interactivă Swypik Go — Jumătate din ecran (50vh) */}
      <div className="relative h-[50vh] min-h-[50vh] max-h-[50vh] w-full shrink-0 overflow-hidden">
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

        </MapView>

        {/* Buton Plutitor Swypik Shield (Siguranță Cursă) */}
        <div className="absolute left-4 bottom-3 z-[400] pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowSafetyModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-xl border border-black/10 dark:border-white/10 text-neutral-900 dark:text-neutral-100 hover:scale-105 active:scale-95 transition"
            aria-label={t("shieldAria")}
          >
            <ShieldCheck size={15} className="text-emerald-500" />
            <span className="text-[11px] font-black tracking-tight">{t("safety")}</span>
          </button>
        </div>
      </div>

      {/* Panou de comandă inferior — Jumătate din ecran (50vh) cu flux pe 2 pași */}
      <div className="relative h-[50vh] min-h-[50vh] max-h-[50vh] w-full shrink-0 z-10 rounded-t-3xl bg-white px-4 pt-2.5 pb-4 sm:px-5 flex flex-col justify-between shadow-[0_-16px_48px_rgba(0,0,0,0.16)] border-t border-neutral-100 overflow-hidden">
        {/* Indicator drag */}
        <div className="w-12 h-1 rounded-full bg-neutral-200 mx-auto mb-2 shrink-0" />

        {step === "destination" ? (
          /* PASUL 1: Selectare adresă de pornire și destinație */
          <div className="flex-1 flex flex-col justify-between overflow-y-auto no-scrollbar">
            <div>
              {/* Header Pasul 1 */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                      {t("step1Label")}
                    </span>
                  </div>
                  <h1 className="text-[17px] font-black tracking-tight text-neutral-950 leading-tight">
                    {t("destinationHeading")}
                  </h1>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 shadow-xs">
                    <Clock size={12} className="text-emerald-600" /> {t("etaBadge")}
                  </span>
                  <span className="text-[9px] font-bold text-neutral-400 mt-0.5">{t("driversNearby")}</span>
                </div>
              </div>

              {/* Card conectat de călătorie (Preluare → Traseu → Destinație) */}
              <div className="relative rounded-2xl bg-neutral-50/90 p-2.5 border border-neutral-200/90 shadow-xs space-y-2">
                <div className="absolute left-[25px] top-[26px] bottom-[26px] w-[2px] bg-gradient-to-b from-emerald-500 via-neutral-300 to-rose-500 pointer-events-none rounded-full" />

                {/* Adresă Preluare */}
                <div className="relative pl-6">
                  <AddressAutocomplete
                    placeholder={t("pickupInputPlaceholder")}
                    value={pickup?.address}
                    onSelect={setPickup}
                    onClear={() => setPickup(null)}
                    icon={<span className="block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 shrink-0" />}
                  />
                </div>

                {/* Buton Inversare (⇅) */}
                {pickup && dropoff && (
                  <div className="relative flex justify-end pr-2 -my-2 z-10">
                    <button
                      type="button"
                      onClick={swapLocations}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition hover:scale-110 active:scale-90"
                      aria-label={t("swapAddresses")}
                    >
                      <ArrowUpDown size={12} />
                    </button>
                  </div>
                )}

                {/* Adresă Destinație */}
                <div className="relative pl-6">
                  <AddressAutocomplete
                    placeholder={t("destinationInputPlaceholder")}
                    value={dropoff?.address}
                    onSelect={(addr) => {
                      setDropoff(addr);
                    }}
                    onClear={() => setDropoff(null)}
                    icon={<span className="block h-2.5 w-2.5 rounded-full bg-rose-500 ring-4 ring-rose-100 shrink-0" />}
                  />
                </div>
              </div>

              {/* Destinații rapide din București */}
              <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                {POPULAR_DESTINATIONS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setDropoff({ address: p.address, lat: p.lat, lng: p.lng });
                    }}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/80 text-neutral-800 font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-xs"
                  >
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                    <span className="text-[10px] text-neutral-400 font-medium">{p.badge}</span>
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <p className="my-1.5 text-center text-xs font-bold text-rose-600 bg-rose-50 p-2 rounded-xl border border-rose-200">
                {error}
              </p>
            ) : null}

            {/* Buton Pasul 1 -> Pasul 2 */}
            <button
              type="button"
              disabled={!pickup || !dropoff || loading}
              onClick={() => {
                haptic("tap");
                void fetchEstimates();
                setStep("vehicle");
              }}
              className="mt-2 w-full rounded-2xl bg-neutral-950 hover:bg-neutral-900 active:scale-[0.99] py-3.5 px-4 text-white shadow-xl transition disabled:opacity-40 flex items-center justify-center gap-2 font-black text-[14px] shrink-0"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>{t("calculatingRoute")}</span>
                </>
              ) : !pickup || !dropoff ? (
                <span>{t("selectDestinationHint")}</span>
              ) : (
                <>
                  <span>{t("continueToVehicle")}</span>
                  <ChevronRight size={18} />
                </>
              )}
            </button>
          </div>
        ) : (
          /* PASUL 2: Selectare clasă mașină, opțiuni & Comandă (Cheamă șofer) */
          <div className="flex-1 flex flex-col justify-between overflow-y-auto no-scrollbar">
            <div>
              {/* Header Pasul 2 cu buton Înapoi la Traseu */}
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    setStep("destination");
                  }}
                  className="flex items-center gap-1.5 text-xs font-black text-neutral-700 hover:text-black py-1.5 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 transition active:scale-95"
                >
                  <ArrowLeft size={14} />
                  <span>{t("changeRoute")}</span>
                </button>

                <div className="flex items-center gap-2">
                  {selected ? (
                    <span className="text-[11px] font-black text-neutral-800 bg-neutral-100 px-2.5 py-1 rounded-xl">
                      {t("eta", { min: selected.duration_min, km: selected.distance_km.toFixed(1) })}
                    </span>
                  ) : null}
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {t("step2Label")}
                  </span>
                </div>
              </div>

              {selected && selected.breakdown.surge_multiplier > 1 ? (
                <p className="mt-1.5 text-center text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl py-1.5">
                  {t("surge", { mult: selected.breakdown.surge_multiplier })}
                </p>
              ) : null}

              {/* Selector Clase Vehicule — Carduri Luxury cu SVG-uri Realiste (FĂRĂ emoticoane) */}
              <div className="grid grid-cols-3 gap-2">
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
                      className={`relative flex flex-col justify-between rounded-2xl p-2 text-left transition-all duration-200 active:scale-[0.98] border ${
                        isSel
                          ? "border-neutral-950 bg-neutral-950 text-white shadow-xl ring-2 ring-neutral-950/25"
                          : "border-neutral-200/90 bg-white hover:border-neutral-300 text-neutral-800 shadow-xs hover:shadow-sm"
                      }`}
                    >
                      {isSel && (
                        <div className="absolute -top-2 right-2 px-1.5 py-0.5 rounded-full bg-emerald-500 text-[8px] font-black uppercase tracking-wider text-black shadow-sm">
                          {t("selectedBadge")}
                        </div>
                      )}
                      <div className="flex items-center justify-center my-0.5 h-8">
                        <VehicleIllustration type={c.id} />
                      </div>
                      <div className="mt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11.5px] font-black tracking-tight truncate">{c.name}</span>
                          <span className={`text-[9px] font-bold ${isSel ? "text-emerald-400" : "text-neutral-500"}`}>
                            {c.defaultEta}
                          </span>
                        </div>
                        <div className={`text-[13px] font-black mt-0.5 tracking-tight ${isSel ? "text-amber-300" : "text-neutral-950"}`}>
                          {loading ? "…" : fmt(estimates[c.id])}
                        </div>
                        <div className={`text-[9px] font-semibold flex items-center gap-1 mt-0.5 ${isSel ? "text-neutral-400" : "text-neutral-400"}`}>
                          <Users size={10} />
                          <span>{t("seatsCount", { count: c.seats })}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Preferințe Călătorie & Plată Compacte */}
              <div className="mt-2 flex items-center justify-between gap-1.5">
                {/* Preferințe Călătorie */}
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setRidePreferences((p) => ({ ...p, ac: !p.ac }));
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-bold transition ${
                      ridePreferences.ac
                        ? "bg-sky-50 text-sky-700 border-sky-200 shadow-xs"
                        : "bg-white text-neutral-500 border-neutral-200"
                    }`}
                    title={t("featureAc")}
                  >
                    <Wind size={11} /> AC
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setRidePreferences((p) => ({ ...p, quiet: !p.quiet }));
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-bold transition ${
                      ridePreferences.quiet
                        ? "bg-purple-50 text-purple-700 border-purple-200 shadow-xs"
                        : "bg-white text-neutral-500 border-neutral-200"
                    }`}
                    title={t("featureQuiet")}
                  >
                    <VolumeX size={11} /> {t("quietLabel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setRidePreferences((p) => ({ ...p, luggage: !p.luggage }));
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-bold transition ${
                      ridePreferences.luggage
                        ? "bg-amber-50 text-amber-700 border-amber-200 shadow-xs"
                        : "bg-white text-neutral-500 border-neutral-200"
                    }`}
                    title={t("featureLuggage")}
                  >
                    <Luggage size={11} /> {t("luggageLabel")}
                  </button>
                </div>

                {/* Selector Metodă de Plată (Card / Cash) */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setPaymentMethod("card");
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg font-bold text-[10px] transition ${
                      paymentMethod === "card"
                        ? "bg-neutral-900 text-white shadow-xs"
                        : "text-neutral-600 hover:text-neutral-900 bg-neutral-100"
                    }`}
                  >
                    <CreditCard size={11} />
                    <span>{t("payCard")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setPaymentMethod("cash");
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg font-bold text-[10px] transition ${
                      paymentMethod === "cash"
                        ? "bg-neutral-900 text-white shadow-xs"
                        : "text-neutral-600 hover:text-neutral-900 bg-neutral-100"
                    }`}
                  >
                    <Banknote size={11} />
                    <span>{t("payCash")}</span>
                  </button>
                </div>
              </div>
            </div>

            {error ? (
              <p className="my-1.5 text-center text-xs font-bold text-rose-600 bg-rose-50 p-2 rounded-xl border border-rose-200">
                {error}
              </p>
            ) : null}

            {/* Buton principal Comandă Cursă — CHEAMĂ ȘOFER */}
            <button
              type="button"
              disabled={!pickup || !dropoff || !selected || ordering}
              onClick={order}
              className="mt-2 w-full rounded-2xl bg-neutral-950 hover:bg-neutral-900 active:scale-[0.99] py-3.5 text-white shadow-xl transition disabled:opacity-40 flex flex-col items-center justify-center gap-0.5 shrink-0"
            >
              {ordering ? (
                <span className="flex items-center gap-2 text-[14px] font-black">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>{t("assigningDriver")}</span>
                </span>
              ) : selected ? (
                <>
                  <div className="flex items-center gap-2 text-[15px] font-black tracking-tight">
                    <span>{t("callVehicle", { vehicle: CLASSES.find((c) => c.id === vehicleClass)?.name.toUpperCase() ?? "" })}</span>
                    <span className="text-amber-400 font-extrabold">•</span>
                    <span className="text-amber-300">{fmt(selected)}</span>
                  </div>
                  <span className="text-[10px] font-medium text-neutral-400">
                    {t("priceGuaranteed")}
                  </span>
                </>
              ) : (
                <span className="text-[14px] font-black">{t("calculatingFare")}</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Modal Swypik Shield (Opțiuni de Siguranță stil Uber/Bolt) */}
      {showSafetyModal ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 p-6 shadow-2xl border border-neutral-200 dark:border-white/10 animate-in slide-in-from-bottom-6 duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h2 className="text-[17px] font-black text-neutral-900 dark:text-neutral-100 tracking-tight">{t("shieldTitle")}</h2>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">{t("shieldSubtitle")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSafetyModal(false)}
                aria-label={t("close")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-white/20"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 mb-5">
              {/* Partajare traseu */}
              <button
                type="button"
                onClick={() => {
                  haptic("tap");
                  const url = `${APP_URL}/go`;
                  if (navigator.share) {
                    navigator.share({ title: "Swypik Go", text: t("shareText"), url }).catch(() => {});
                  } else {
                    void navigator.clipboard.writeText(url);
                    alert(t("shareCopied"));
                  }
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-neutral-50 dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/10 transition text-left"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">📱</span>
                  <div>
                    <span className="block text-xs font-black text-neutral-900 dark:text-neutral-100">{t("shareFriendsTitle")}</span>
                    <span className="block text-[10px] text-neutral-500 dark:text-neutral-400">{t("shareFriendsSubtitle")}</span>
                  </div>
                </div>
                <span className="text-xs font-black text-emerald-600">{t("shareCta")}</span>
              </button>

              {/* Buton 112 Urgență */}
              <a
                href="tel:112"
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 transition text-left"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🚨</span>
                  <div>
                    <span className="block text-xs font-black text-rose-700 dark:text-rose-400">{t("emergencyCall")}</span>
                    <span className="block text-[10px] text-rose-600 dark:text-rose-400">
                      {t("gpsLabel", { coords: pickup ? `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}` : t("gpsUnavailable") })}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-black text-rose-700 dark:text-rose-400">{t("callNow")}</span>
              </a>
            </div>

            <button
              type="button"
              onClick={() => setShowSafetyModal(false)}
              className="w-full py-3 rounded-2xl bg-neutral-950 dark:bg-white dark:text-neutral-950 text-white font-black text-xs uppercase tracking-wider"
            >
              {t("close")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
