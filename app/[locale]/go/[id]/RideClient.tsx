"use client";

/**
 * /go/[id] — ecranul cursei live.
 *  - „caut șofer" cu cerc pulsatoriu sincronizat cu valurile (2/5/10 km),
 *    contor de timp și mesaje progresive
 *  - date șofer (nume, marcă/model/culoare, număr, rating) după accept
 *  - poziție live pe hartă prin SSE (/api/rides/[id]/stream)
 *  - sună / copiază număr / share trip / SOS 112
 *  - anulare cu motiv (dialog cu taxa de anulare dacă se aplică)
 *  - la 'completed': bon + rating
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Car, CircleUserRound, Phone, Share, Star } from "lucide-react";
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
    accepted_at: string | null;
    created_at?: string;
    share_token?: string | null;
};

type Driver = {
    full_name: string;
    vehicle_type: string;
    vehicle_make: string | null;
    vehicle_model: string | null;
    vehicle_color: string | null;
    vehicle_plate: string | null;
    rating: string | null;
    phone?: string;
    current_lat: number | null;
    current_lng: number | null;
};

const CANCEL_REASONS = [
    "wait_too_long",
    "wrong_address",
    "driver_not_coming",
    "changed_mind",
    "other",
] as const;
type CancelReason = (typeof CANCEL_REASONS)[number];

/** Valurile dispatch: 2 km (0–45s), 5 km (45–90s), 10 km (90s+). */
function waveForElapsed(sec: number): 1 | 2 | 3 {
    if (sec < 45) return 1;
    if (sec < 90) return 2;
    return 3;
}

export default function RideClient({ rideId }: { rideId: string }) {
    const router = useRouter();
    const t = useTranslations("go");
    const tShell = useTranslations("shell");
    const [ride, setRide] = useState<Ride | null>(null);
    const [driver, setDriver] = useState<Driver | null>(null);
    const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [stars, setStars] = useState(0);
    const [rated, setRated] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState<CancelReason | null>(null);
    const [cancelOther, setCancelOther] = useState("");
    const [cancelling, setCancelling] = useState(false);
    const [copied, setCopied] = useState(false);
    const [shared, setShared] = useState(false);
    const searchStartRef = useRef<number | null>(null);

    const refresh = useCallback(async () => {
        const res = await fetch(`/api/rides/${rideId}`, { cache: "no-store" });
        if (!res.ok) {
            setError(res.status === 403 ? t("errors.noAccess") : t("errors.notFound"));
            return;
        }
        const data = await res.json();
        setRide(data.ride);
        setDriver(data.driver);
        if (data.driver?.current_lat != null) {
            setDriverPos({ lat: Number(data.driver.current_lat), lng: Number(data.driver.current_lng) });
        }
        if (Array.isArray(data.ratings) && data.ratings.some((r: { rater_role: string }) => r.rater_role === "rider")) {
            setRated(true);
        }
    }, [rideId, t]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // SSE: status + poziție live.
    useEffect(() => {
        const es = new EventSource(`/api/rides/${rideId}/stream`);
        es.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === "location" && msg.lat != null) {
                    setDriverPos({ lat: msg.lat, lng: msg.lng });
                } else {
                    void refresh();
                }
            } catch {
                // mesaj non-JSON — ignorăm
            }
        };
        return () => es.close();
    }, [rideId, refresh]);

    const searching = !!ride && ["requested", "searching"].includes(ride.status);

    // Contor de timp pentru căutare (ancorat la created_at ca să supraviețuiască refresh-ului).
    useEffect(() => {
        if (!searching) {
            searchStartRef.current = null;
            return;
        }
        if (searchStartRef.current == null) {
            const created = ride?.created_at ? Date.parse(ride.created_at) : Number.NaN;
            searchStartRef.current = Number.isFinite(created) ? created : Date.now();
        }
        const iv = setInterval(() => {
            setElapsed(Math.max(0, Math.floor((Date.now() - (searchStartRef.current ?? Date.now())) / 1000)));
        }, 1000);
        return () => clearInterval(iv);
    }, [searching, ride?.created_at]);

    const doCancel = async () => {
        if (!cancelReason) return;
        haptic("tap");
        setCancelling(true);
        try {
            const res = await fetch(`/api/rides/${rideId}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "cancelled",
                    cancel_reason: cancelReason,
                    reason: cancelReason === "other" ? cancelOther.trim() || undefined : undefined,
                }),
            });
            if (res.ok) {
                setCancelOpen(false);
                void refresh();
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error ?? t("cancel.error"));
            }
        } finally {
            setCancelling(false);
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

    const shareTrip = async () => {
        if (!ride?.share_token) return;
        haptic("tap");
        const url = `${window.location.origin}/go/track/${ride.share_token}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: t("track.title"), url });
            } else {
                await navigator.clipboard.writeText(url);
                setShared(true);
                setTimeout(() => setShared(false), 2000);
            }
        } catch {
            // user a închis share sheet-ul
        }
    };

    const copyPlate = async () => {
        if (!driver?.vehicle_plate) return;
        haptic("tap");
        try {
            await navigator.clipboard.writeText(driver.vehicle_plate);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // clipboard indisponibil
        }
    };

    const active = !!ride && ["accepted", "arriving", "in_progress"].includes(ride.status);
    const done = ride?.status === "completed";
    const fmt = (c: number | null | undefined) =>
        c != null && ride ? `${(c / 100).toFixed(2)} ${ride.currency}` : "—";

    // Taxa de anulare care s-ar aplica ACUM (aceeași regulă ca serverul:
    // gratuit înainte de accept sau în primele 2 min după).
    const cancelFeeNow = useMemo(() => {
        if (!ride || !active || !ride.accepted_at) return 0;
        if (Date.now() - Date.parse(ride.accepted_at) <= 2 * 60 * 1000) return 0;
        const bd = ride.fare_breakdown as { cancel_fee_cents?: number } | null;
        return bd?.cancel_fee_cents ?? 0;
    }, [ride, active]);

    const pickup = ride ? { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) } : null;
    const dropoff = ride ? { lat: Number(ride.dropoff_lat), lng: Number(ride.dropoff_lng) } : null;

    if (error) {
        return (
            <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-[15px] font-semibold">{error}</p>
                <button onClick={() => router.push("/go")} className="rounded-2xl bg-neutral-900 px-6 py-3 text-white">
                    {t("errors.backToGo")}
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

    const wave = waveForElapsed(elapsed);
    const carLabel = driver
        ? [driver.vehicle_make, driver.vehicle_model, driver.vehicle_color].filter(Boolean).join(" ") ||
          driver.vehicle_type
        : "";

    return (
        <div className="relative flex h-[100dvh] flex-col bg-neutral-50">
            <div className="relative flex-1">
                {pickup ? (
                    <MapView center={pickup} className="absolute inset-0 z-0 h-full w-full">
                        <LiveMarker position={pickup} kind="pickup" />
                        {dropoff ? <LiveMarker position={dropoff} kind="dropoff" /> : null}
                        {driverPos ? <LiveMarker position={driverPos} kind="driver" label={driver?.full_name} /> : null}
                        {dropoff ? <RoutePolyline points={[pickup, dropoff]} /> : null}
                    </MapView>
                ) : null}

                {/* Share + SOS — mereu accesibile cât timp cursa e activă */}
                {searching || active ? (
                    <div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
                        {ride.share_token ? (
                            <button
                                onClick={shareTrip}
                                className="rounded-2xl bg-white/95 px-3 py-2 text-[12px] font-bold shadow-md"
                            >
                                {shared ? t("share.copied") : <span className="inline-flex items-center gap-1"><Share size={13} /> {t("share.button")}</span>}
                            </button>
                        ) : null}
                        <a
                            href="tel:112"
                            className="rounded-2xl bg-red-600 px-3 py-2 text-center text-[12px] font-extrabold text-white shadow-md"
                        >
                            🆘 {t("share.sos")}
                        </a>
                    </div>
                ) : null}
            </div>

            <div className="z-10 rounded-t-3xl bg-white p-4 pb-6 shadow-[0_-8px_24px_rgba(0,0,0,.08)]">
                <p className="text-center text-[15px] font-extrabold">
                    {RIDE_STATUS_KEYS.includes(ride.status) ? t(`status.${ride.status}`) : ride.status}
                </p>

                {searching ? (
                    <div className="mt-4 flex flex-col items-center gap-3">
                        {/* Cerc pulsatoriu — ritmul crește cu valul de căutare (2/5/10 km) */}
                        <div className="relative h-20 w-20">
                            <span
                                className="absolute inset-0 animate-ping rounded-full bg-yellow-300 opacity-60"
                                style={{ animationDuration: `${(4 - wave) * 0.8}s` }}
                            />
                            <span
                                className="absolute -inset-2 animate-ping rounded-full bg-yellow-200 opacity-30"
                                style={{ animationDuration: `${(4 - wave) * 1.2}s` }}
                            />
                            <span className="absolute inset-3 flex items-center justify-center rounded-full bg-yellow-400">
                                <Car size={24} />
                            </span>
                        </div>
                        <p className="text-[13px] font-semibold text-neutral-700">{t(`search.wave${wave}`)}</p>
                        <p className="text-[12px] tabular-nums text-neutral-400">{t("search.elapsed", { sec: elapsed })}</p>
                        <button
                            onClick={() => {
                                haptic("tap");
                                setCancelReason(null);
                                setCancelOpen(true);
                            }}
                            className="mt-1 rounded-2xl border border-red-200 px-6 py-3 text-[14px] font-bold text-red-600"
                        >
                            {t("search.cancelFree")}
                        </button>
                    </div>
                ) : null}

                {active && driver ? (
                    <div className="mt-3">
                        <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 p-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100"><CircleUserRound size={24} /></div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] font-bold">{driver.full_name}</p>
                                <p className="text-[13px] text-neutral-500">
                                    {carLabel}
                                    {driver.rating ? ` • ${Number(driver.rating).toFixed(2)}` : ""}
                                </p>
                            </div>
                            {driver.vehicle_plate ? (
                                <button
                                    onClick={copyPlate}
                                    className="rounded-lg bg-neutral-900 px-2 py-1 font-mono text-[13px] font-bold tracking-wider text-white"
                                    title={t("driver.copyPlate")}
                                >
                                    {copied ? t("driver.copied") : driver.vehicle_plate}
                                </button>
                            ) : null}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            {driver.phone ? (
                                <a
                                    href={`tel:${driver.phone}`}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-neutral-900 py-3 text-center text-[14px] font-bold text-white"
                                >
                                    <Phone size={15} /> {t("driver.call")}
                                </a>
                            ) : (
                                <span className="rounded-2xl bg-neutral-100 py-3 text-center text-[14px] font-semibold text-neutral-500">
                                    {fmt(ride.estimated_fare_cents)}
                                </span>
                            )}
                            {ride.status !== "in_progress" ? (
                                <button
                                    onClick={() => {
                                        haptic("tap");
                                        setCancelReason(null);
                                        setCancelOpen(true);
                                    }}
                                    className="rounded-2xl border border-red-200 py-3 text-[14px] font-bold text-red-600"
                                >
                                    {t("cancel.confirm")}
                                </button>
                            ) : (
                                <span className="rounded-2xl bg-neutral-100 py-3 text-center text-[14px] font-semibold text-neutral-500">
                                    {fmt(ride.estimated_fare_cents)}
                                </span>
                            )}
                        </div>
                    </div>
                ) : null}

                {done ? (
                    <div className="mt-3">
                        <div className="rounded-2xl border border-neutral-200 p-4 text-center">
                            <p className="text-[13px] text-neutral-500">{t("receipt.total")}</p>
                            <p className="text-3xl font-extrabold">{fmt(ride.final_fare_cents ?? ride.estimated_fare_cents)}</p>
                            <p className="mt-1 text-[12px] text-neutral-500">
                                {ride.distance_km ? `${Number(ride.distance_km).toFixed(1)} km` : ""}
                                {ride.duration_min ? ` • ${ride.duration_min} min` : ""}
                            </p>
                        </div>
                        {!rated ? (
                            <div className="mt-3 text-center">
                                <p className="text-[14px] font-semibold">{t("receipt.ratePrompt")}</p>
                                <div className="mt-1 flex justify-center gap-1">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                        <button key={s} onClick={() => setStars(s)} aria-label={`${s} stele`}>
                                            <Star size={28} className={s <= stars ? "fill-yellow-400 text-yellow-400" : "text-neutral-300"} />
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={sendRating}
                                    disabled={!stars}
                                    className="mt-2 w-full rounded-2xl bg-neutral-900 py-3 text-[14px] font-bold text-white disabled:opacity-40"
                                >
                                    {t("receipt.rateSend")}
                                </button>
                            </div>
                        ) : (
                            <p className="mt-3 text-center text-[13px] text-green-600">{t("receipt.rateThanks")}</p>
                        )}
                        <button
                            onClick={() => router.push("/go")}
                            className="mt-3 w-full rounded-2xl border border-neutral-200 py-3 text-[14px] font-bold"
                        >
                            {t("receipt.another")}
                        </button>
                    </div>
                ) : null}

                {ride.status === "cancelled" ? (
                    <div className="mt-3 text-center">
                        {ride.cancel_fee_cents ? (
                            <p className="text-[13px] text-neutral-500">
                                {t("receipt.cancelledFee", { fee: fmt(ride.cancel_fee_cents) })}
                            </p>
                        ) : (
                            <p className="text-[13px] text-neutral-500">{t("receipt.cancelledFree")}</p>
                        )}
                        <button
                            onClick={() => router.push("/go")}
                            className="mt-3 w-full rounded-2xl border border-neutral-200 py-3 text-[14px] font-bold"
                        >
                            {t("receipt.another")}
                        </button>
                    </div>
                ) : null}
            </div>

            {/* Dialog anulare cu motiv */}
            {cancelOpen ? (
                <div className="fixed inset-0 z-[600] flex items-end bg-black/40" onClick={() => setCancelOpen(false)}>
                    <div className="w-full rounded-t-3xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-[16px] font-extrabold">{t("cancel.title")}</h2>
                        <div className="mt-3 space-y-2">
                            {CANCEL_REASONS.map((r) => (
                                <button
                                    key={r}
                                    onClick={() => {
                                        haptic("tap");
                                        setCancelReason(r);
                                    }}
                                    className={`w-full rounded-2xl border p-3 text-left text-[14px] font-semibold transition ${
                                        cancelReason === r
                                            ? "border-neutral-900 bg-neutral-900 text-white"
                                            : "border-neutral-200 bg-white"
                                    }`}
                                >
                                    {t(`cancel.${r}`)}
                                </button>
                            ))}
                            {cancelReason === "other" ? (
                                <textarea
                                    value={cancelOther}
                                    onChange={(e) => setCancelOther(e.target.value)}
                                    maxLength={300}
                                    rows={2}
                                    placeholder={t("cancel.otherPlaceholder")}
                                    className="w-full rounded-2xl border border-neutral-200 p-3 text-[14px]"
                                />
                            ) : null}
                        </div>
                        {cancelFeeNow > 0 ? (
                            <p className="mt-3 flex items-center justify-center gap-1 text-center text-[13px] font-semibold text-amber-600">
                                <AlertTriangle size={14} /> {t("cancel.feeWarning", { fee: fmt(cancelFeeNow) })}
                            </p>
                        ) : null}
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setCancelOpen(false)}
                                className="rounded-2xl border border-neutral-200 py-3 text-[14px] font-bold"
                            >
                                {t("cancel.keep")}
                            </button>
                            <button
                                onClick={doCancel}
                                disabled={!cancelReason || cancelling}
                                className="rounded-2xl bg-red-600 py-3 text-[14px] font-bold text-white disabled:opacity-40"
                            >
                                {t("cancel.confirm")}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

const RIDE_STATUS_KEYS = [
    "requested",
    "searching",
    "accepted",
    "arriving",
    "in_progress",
    "completed",
    "cancelled",
];
