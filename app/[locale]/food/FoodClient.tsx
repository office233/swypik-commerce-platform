"use client";

/**
 * Swypik Food — listarea restaurantelor din oraș.
 * Mobile-first: alegi orașul o dată, vezi cine e deschis, intri în meniu.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Cake, Clock, Ham, MapPin, Pizza, ReceiptText, Salad, Soup, Star, Truck, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { useFormatPrice } from "@/components/i18n/useFormatPrice";
import { useTranslations } from "next-intl";

const ACCENT = "#2DBE60"; // verdele Swypik Food
const CITY_KEY = "swypik_city";
const GEO_KEY = "swypik_geo"; // {lat,lng,t}

interface Merchant {
  id: string;
  kind: string;
  name: string;
  slug: string;
  description: string | null;
  cuisine_types: string[];
  location_city: string | null;
  delivery_fee_cents: number;
  min_order_cents: number;
  avg_prep_minutes: number;
  rating: number | null;
  image_url: string | null;
  is_open: boolean;
  hours_known?: boolean;
  distance_km?: number | null;
  menu_count: number;
}

const CUISINES: readonly { id: string; Icon: LucideIcon; labelKey: string }[] = [
  { id: "pizza", Icon: Pizza, labelKey: "cuisinePizza" },
  { id: "burgers", Icon: Ham, labelKey: "cuisineBurgers" },
  { id: "asian", Icon: Soup, labelKey: "cuisineAsian" },
  { id: "romanian", Icon: UtensilsCrossed, labelKey: "cuisineRomanian" },
  { id: "desserts", Icon: Cake, labelKey: "cuisineDesserts" },
  { id: "healthy", Icon: Salad, labelKey: "cuisineHealthy" },
] as const;

export default function FoodClient() {
  const router = useRouter();
  const fmt = useFormatPrice();
  const t = useTranslations("foodPage");
  const [city, setCity] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "asking" | "ok" | "denied">("idle");

  useEffect(() => {
    setCity(localStorage.getItem(CITY_KEY));
    try {
      const cached = JSON.parse(localStorage.getItem(GEO_KEY) ?? "null");
      if (cached?.lat && Date.now() - (cached.t ?? 0) < 30 * 60 * 1000) {
        setGeo({ lat: cached.lat, lng: cached.lng });
        setGeoState("ok");
      }
    } catch { /* ignore */ }
  }, []);

  const askLocation = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    setGeoState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const g = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        localStorage.setItem(GEO_KEY, JSON.stringify({ ...g, t: Date.now() }));
        setGeo(g);
        setGeoState("ok");
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ kind: "restaurant", limit: "40" });
      if (geo) {
        qs.set("lat", String(geo.lat));
        qs.set("lng", String(geo.lng));
      } else if (city) {
        qs.set("city", city);
      }
      if (cuisine) qs.set("cuisine", cuisine);
      const res = await fetch(`/api/merchants?${qs}`);
      const data = await res.json();
      if (data.success) setMerchants(data.merchants ?? []);
    } finally {
      setLoading(false);
    }
  }, [city, cuisine, geo]);

  useEffect(() => {
    void load();
  }, [load]);

  const pickCity = () => {
    haptic("tap");
    const c = prompt(t("cityPrompt"), city ?? "");
    if (c?.trim()) {
      localStorage.setItem(CITY_KEY, c.trim());
      setCity(c.trim());
    }
  };

  const fmtLei = (cents: number) => fmt(cents, { showDecimals: false });

  return (
    <div className="min-h-dvh bg-white pb-24">
      {/* Header verde Food */}
      <header
        className="sticky top-0 z-30 border-b border-black/5 backdrop-blur-xl"
        style={{ backgroundColor: `${ACCENT}14` }}
      >
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label={t("back")}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/85 transition active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-black leading-tight">Swypik Food</h1>
            <p className="text-[11px] leading-tight text-[#6E6E80]">{t("fastDelivery")}</p>
          </div>
          <button
            type="button"
            onClick={pickCity}
            className="ml-auto inline-flex h-9 items-center gap-1 rounded-full bg-white/85 px-3 text-xs font-bold transition active:scale-95"
          >
            <MapPin size={14} className="shrink-0" style={{ color: ACCENT }} />
            <span className="max-w-[110px] truncate">
              {geoState === "ok" ? t("nearMe") : city ?? t("chooseCity")}
            </span>
          </button>
          {geoState !== "ok" && (
            <button
              type="button"
              onClick={askLocation}
              aria-label={t("useMyLocation")}
              className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-bold text-white transition active:scale-95"
              style={{ backgroundColor: ACCENT }}
            >
              {geoState === "asking" ? "…" : "GPS"}
            </button>
          )}
        </div>

        {/* Tipuri de bucătărie */}
        <div className="flex snap-x gap-2 overflow-x-auto px-4 pb-2.5 scrollbar-none">
          {CUISINES.map((c) => {
            const active = cuisine === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  haptic("tap");
                  setCuisine(active ? null : c.id);
                }}
                aria-pressed={active}
                style={active ? { backgroundColor: ACCENT } : undefined}
                className={`inline-flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition active:scale-95 ${active ? "text-white" : "bg-white/85 text-[#6E6E80]"
                  }`}
              >
                <c.Icon size={14} aria-hidden />
                {t(c.labelKey)}
              </button>
            );
          })}
        </div>
      </header>

      <main className="px-4 pt-4">
        {!city && !loading && merchants.length === 0 && (
          <button
            type="button"
            onClick={pickCity}
            className="mb-4 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-[#E5E5E5] p-4 text-left transition active:scale-[0.98]"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: `${ACCENT}1A` }}>
              <MapPin size={20} style={{ color: ACCENT }} />
            </span>
            <span>
              <span className="block text-sm font-black">{t("chooseCityTitle")}</span>
              <span className="block text-xs text-[#6E6E80]">{t("chooseCitySub")}</span>
            </span>
          </button>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-[#F7F7F8]" />
            ))}
          </div>
        ) : merchants.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mb-3 flex justify-center" aria-hidden><UtensilsCrossed size={48} /></div>
            <p className="font-black">{t("noRestaurants", { city: city ? ` — ${city}` : "" })}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-[#6E6E80]">
              {t("ownerCta")}
            </p>
            <button
              type="button"
              onClick={() => router.push("/seller")}
              style={{ backgroundColor: ACCENT }}
              className="mt-5 h-11 rounded-xl px-5 text-sm font-bold text-white transition active:scale-95"
            >
              {t("ownerBtn")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {merchants.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  haptic("tap");
                  router.push(`/food/${m.slug}`);
                }}
                className="flex w-full gap-3 overflow-hidden rounded-2xl border border-[#E5E5E5] bg-white p-3 text-left shadow-sm transition active:scale-[0.98]"
              >
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#F7F7F8]">
                  {m.image_url ? (
                    <Image src={m.image_url} alt={m.name} fill sizes="96px" className="object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center"><UtensilsCrossed size={28} /></div>
                  )}
                  {!m.is_open && m.hours_known !== false && (
                    <div className="absolute inset-0 grid place-items-center bg-black/55">
                      <span className="text-[10px] font-black uppercase text-white">{t("closed")}</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate text-[15px] font-black">{m.name}</h2>
                    {m.rating != null && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-bold">
                        <Star size={12} fill="#FACC15" className="text-[#FACC15]" />
                        {Number(m.rating).toFixed(1)}
                      </span>
                    )}
                  </div>
                  {m.cuisine_types?.length > 0 && (
                    <p className="mt-0.5 truncate text-xs text-[#6E6E80]">{m.cuisine_types.join(" · ")}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[#6E6E80]">
                    {m.distance_km != null && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} />
                        {Number(m.distance_km) < 1 ? `${Math.round(Number(m.distance_km) * 1000)} m` : `${Number(m.distance_km).toFixed(1)} km`}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} />
                      {m.avg_prep_minutes + 25}–{m.avg_prep_minutes + 40} min
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Truck size={12} />
                      {m.delivery_fee_cents === 0 ? t("freeDelivery") : fmtLei(m.delivery_fee_cents)}
                    </span>
                    {m.min_order_cents > 0 && <span>{t("minOrder", { amount: fmtLei(m.min_order_cents) })}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
