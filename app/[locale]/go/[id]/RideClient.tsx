"use client";

/**
 * /go/[id] — ecranul cursei live.
 *  - „caut șofer” cu animație cât timp status ∈ {requested, searching}
 *  - date șofer (nume, mașină, număr, rating) după accept
 *  - poziție live pe hartă prin SSE (/api/rides/[id]/stream)
 *  - buton sună / anulează
 *  - la 'completed': bon + rating
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { haptic } from "@/lib/haptic";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
const LiveMarker = dynamic(() => import("@/components/map/LiveMarker"), { ssr: false });
const RoutePolyline = dynamic(() => import("@/components/map/RoutePolyline"), { ssr: false });

type Ride = {
    id: string;
    status: string;
    vehicle_class: string;
    pickup_address: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_address: string;
    dropoff_lat: number;
    dropoff_lng: number;
    estimated_fare_cents: number | null;
    final_fare_cents: number | null;
    currency: string;
    duration_min: number | null;
    distance_km: string | null;
    fare_breakdown: Record<string, unknown> | null;
    cancel_fee_cents: number | null;
};

type Driver = {
    full_name: string;
    vehicle_type: string;
    vehicle_plate: string | null;
    rating: string | null;
    phone?: string;
    current_lat: number | null;
    current_lng: number | null;
};

const STATUS_LABEL: Record<string, string> = {
    requested: "Pregătim cursa…",
    searching: "Căutăm un șofer în zonă…",
    accepted: "Șoferul vine spre tine",
    arriving: "Șoferul e aproape!",
    in_progress: "Cursă în desfășurare",
    completed: "Cursă finalizată",
    cancelled: "Cursă anulată",
};

export default function RideClient({ rideId }: { rideId: string }) {
    const router = useRouter();
    const tShell = useTranslations("shell");
    const [ride, setRide] = useState<Ride | null>(null);
    const [driver, setDriver] = useState<Driver | null>(null);
    const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [stars, setStars] = useState(0);
    const [rated, setRated] = useState(false);
    const esRef = useRef<EventSource | null>(null);

    const refresh = useCallback(async () => {
        const res = await fetch(`/api/rides/${rideId}`, { cache: "no-store" });
        if (!res.ok) {
            setError(res.status === 403 ? "Nu ai acces la această cursă." : "Cursa nu există.");
            return;
        }
        const data = await res.json();
        setRide(data.ride);
        setDriver(data.driver);
        if (data.driver?.current_lat != null) {
            setDriverPos({ lat: data.driver.current_lat, lng: data.driver.current_lng });
        }
        if (Array.isArray(data.ratings) && data.ratings.some((r: { rater_role: string }) => r.rater_role === "rider")) {
            setRated(true);
        }
    }, [rideId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // SSE: status + poziție live.
    useEffect(() => {
        const es = new EventSource(`/api/rides/${rideId}/stream`);
        esRef.current = es;
        es.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === "location" && msg.lat != null) {
                    setDriverPos({ lat: msg.lat, lng: msg.lng });
                } else if (msg.type === "status" || msg.type === "snapshot") {
                    void refresh();
                }
            } catch {
                // ignore
            }
        };
        es.onerror = () => {
            // browserul reconectează singur
        };
        return () => es.close();
    }, [rideId, refresh]);

    const cancel = async () => {
        haptic("tap");
        if (!confirm("Sigur anulezi cursa?")) return;
        const res = await fetch(`/api/rides/${rideId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "cancelled", reason: "rider_cancel" }),
        });
        if (res.ok) void refresh();
        else {
            const data = await res.json().catch(() => ({}));
            setError(data.error ?? "Nu am putut anula.");
        }
    };

    const sendRating = async () => {
        if (!stars) return;
        haptic("tap");
        const res = await fetch(`/api/rides/${rideId}/rating`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stars }),
        });
        if (res.ok || res.status === 409) setRated(true);
    };

    const searching = ride && ["requested", "searching"].includes(ride.status);
    const active = ride && ["accepted", "arriving", "in_progress"].includes(ride.status);
    const done = ride?.status === "completed";
    const fmt = (c: number | null | undefined) =>
        c != null && ride ? `${(c / 100).toFixed(2)} ${ride.currency}` : "—";

    const pickup = ride ? { lat: ride.pickup_lat, lng: ride.pickup_lng } : null;
    const dropoff = ride ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng } : null;
    const bounds = useMemo(() => {
        const pts = [pickup, dropoff, driverPos].filter(Boolean) as { lat: number; lng: number }[];
        return pts.length >= 2 ? pts : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ride?.pickup_lat, ride?.dropoff_lat, driverPos?.lat, driverPos?.lng]);

    if (error) {
        return (
            <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-[15px] font-semibold">{error}</p>
                <button onClick={() => router.push("/go")} className="rounded-2xl bg-neutral-900 px-6 py-3 text-white">
                    Înapoi la Go
                </button>
            </div>
        );
    }
    if (!ride) {
        return (
            <div className="flex h-[100dvh] items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
            </div>
        );
    }

    return (
        <div className="relative flex h-[100dvh] flex-col bg-neutral-50">
            <div className="relative flex-1">
                {pickup ? (
                    <MapView center={pickup} fitBounds={bounds} className="absolute inset-0 z-0 h-full w-full">
                        {pickup ? <LiveMarker position={pickup} kind="pickup" /> : null}
                        {dropoff ? <LiveMarker position={dropoff} kind="dropoff" /> : null}
                        {driverPos ? <LiveMarker position={driverPos} kind="driver" label={driver?.full_name} /> : null}
                        {pickup && dropoff ? <RoutePolyline points={[pickup, dropoff]} /> : null}
                    </MapView>
                ) : null}
            </div>

            <div className="z-10 rounded-t-3xl bg-white p-4 pb-6 shadow-[0_-8px_24px_rgba(0,0,0,.08)]">
                <p className="text-center text-[15px] font-extrabold">{STATUS_LABEL[ride.status] ?? ride.status}</p>

                {searching ? (
                    <div className="mt-4 flex flex-col items-center gap-3">
                        <div className="relative h-16 w-16">
                            <span className="absolute inset-0 animate-ping rounded-full bg-yellow-300 opacity-60" />
                            <span className="absolute inset-2 flex items-center justify-center rounded-full bg-yellow-400 text-2xl">
                                🚕
                            </span>
                        </div>
                        <p className="text-[13px] text-neutral-500">Trimitem oferta șoferilor din apropiere…</p>
                        <button onClick={cancel} className="mt-1 rounded-2xl border border-red-200 px-6 py-3 text-[14px] font-bold text-red-600">
                            Anulează (gratuit)
                        </button>
                    </div>
                ) : null}

                {active && driver ? (
                    <div className="mt-3">
                        <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 p-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-xl">🧑‍✈️</div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] font-bold">{driver.full_name}</p>
                                <p className="text-[13px] text-neutral-500">
                                    {driver.vehicle_type} {driver.vehicle_plate ? `• ${driver.vehicle_plate}` : ""}
                                    {driver.rating ? ` • ★ ${Number(driver.rating).toFixed(2)}` : ""}
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            {driver.phone ? (
                                <a href={`tel:${driver.phone}`} className="rounded-2xl bg-neutral-900 py-3 text-center text-[14px] font-bold text-white">
                                    📞 Sună șoferul
                                </a>
                            ) : (
                                <span />
                            )}
                            {ride.status !== "in_progress" ? (
                                <button onClick={cancel} className="rounded-2xl border border-red-200 py-3 text-[14px] font-bold text-red-600">
                                    Anulează
                                </button>
                            ) : (
                                <span className="rounded-2xl bg-neutral-100 py-3 text-center text-[14px] font-semibold text-neutral-500">
                                    {fmt(ride.estimated_fare_cents)}
                                </span>
                            )}
                        </div>
                    </div>
                ) : null}

                {/* Cross-sell discret: cât aștepți/mergi, deschide feedul */}
                {active && driver && ride.status === "in_progress" ? (
                    <button
                        type="button"
                        onClick={() => {
                            haptic("tap");
                            router.push(`/?utm_source=go&utm_medium=ride_in_progress&utm_campaign=cross_sell`);
                        }}
                        className="mt-3 flex w-full items-center justify-between rounded-2xl border border-neutral-200 p-3 text-left active:scale-[0.98]"
                    >
                        <span>
                            <span className="block text-[14px] font-bold">{tShell("discoverFeed")}</span>
                            <span className="block text-[12px] text-neutral-500">{tShell("discoverFeedSub")}</span>
                        </span>
                        <span aria-hidden>🎬</span>
                    </button>
                ) : null}

                {done ? (
                    <div className="mt-3">
                        <div className="rounded-2xl border border-neutral-200 p-4 text-center">
                            <p className="text-[13px] text-neutral-500">Total de plată</p>
                            <p className="text-3xl font-extrabold">{fmt(ride.final_fare_cents ?? ride.estimated_fare_cents)}</p>
                            <p className="mt-1 text-[12px] text-neutral-500">
                                {ride.distance_km ? `${Number(ride.distance_km).toFixed(1)} km` : ""}
                                {ride.duration_min ? ` • ${ride.duration_min} min` : ""}
                            </p>
                        </div>
                        {!rated ? (
                            <div className="mt-3 text-center">
                                <p className="text-[14px] font-semibold">Cum a fost cursa?</p>
                                <div className="mt-1 flex justify-center gap-1 text-3xl">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                        <button key={s} onClick={() => setStars(s)} aria-label={`${s} stele`}>
                                            {s <= stars ? "⭐" : "☆"}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={sendRating}
                                    disabled={!stars}
                                    className="mt-2 w-full rounded-2xl bg-neutral-900 py-3 text-[14px] font-bold text-white disabled:opacity-40"
                                >
                                    Trimite ratingul
                                </button>
                            </div>
                        ) : (
                            <p className="mt-3 text-center text-[13px] text-green-600">Mulțumim pentru rating! 💛</p>
                        )}
                        <button onClick={() => router.push("/go")} className="mt-3 w-full rounded-2xl border border-neutral-200 py-3 text-[14px] font-bold">
                            Comandă altă cursă
                        </button>
                    </div>
                ) : null}

                {ride.status === "cancelled" ? (
                    <div className="mt-3 text-center">
                        {ride.cancel_fee_cents ? (
                            <p className="text-[13px] text-neutral-500">Taxă de anulare: {fmt(ride.cancel_fee_cents)}</p>
                        ) : null}
                        <button onClick={() => router.push("/go")} className="mt-2 w-full rounded-2xl bg-neutral-900 py-3 text-[14px] font-bold text-white">
                            Comandă altă cursă
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
