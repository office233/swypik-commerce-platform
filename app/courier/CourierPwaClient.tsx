"use client";

/**
 * PWA curier: toggle online/offline, GPS periodic (~10s),
 * ofertă de comandă cu countdown 45s accept/refuz, link navigare Google Maps.
 * + sunet la ofertă nouă, ascultare push (SW postMessage) pentru reacție
 * instant, deep-link Waze, avertisment tab în fundal (iOS) și heartbeat
 * de siguranță (>60s fără poziție trimisă → re-trigger).
 * Suportă AMBELE tipuri de job: livrări (local_orders) și curse Swypik Go
 * (rides) — serverul trimite `kind: 'delivery' | 'ride'` pe fiecare ofertă.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import EarningsTab from "./EarningsTab";

type Offer = {
    offer_id: string;
    kind?: "delivery" | "ride";
    order_id: string | null;
    ride_id: string | null;
    expires_at: string;
    order_number: string | null;
    merchant_name: string;
    pickup_address: string | null;
    delivery_address: string;
    delivery_fee_cents: number;
    currency: string;
};

type RideStep = "accepted" | "arriving" | "in_progress";

const OFFER_SECONDS = 45;

function mapsLink(address: string): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function wazeLink(address: string): string {
    return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

/** Butoane navigare Google Maps + Waze pentru o adresă. */
function NavButtons({ address, gmapsLabel, wazeLabel }: { address: string; gmapsLabel: string; wazeLabel: string }) {
    return (
        <span className="flex shrink-0 gap-1">
            <a
                href={mapsLink(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
            >
                {gmapsLabel}
            </a>
            <a
                href={wazeLink(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-cyan-100 px-3 py-1 text-xs font-medium text-cyan-700"
            >
                {wazeLabel}
            </a>
        </span>
    );
}

/** Beep scurt dublu prin WebAudio — nu necesită fișier audio. */
function playOfferSound(): void {
    try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const beep = (start: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.35);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + 0.4);
        };
        beep(0);
        beep(0.5);
        setTimeout(() => void ctx.close().catch(() => {}), 1500);
    } catch {
        // audio indisponibil — ignorăm
    }
}

export default function CourierPwaClient() {
    const t = useTranslations("shell");
    const [online, setOnline] = useState(false);
    const [tab, setTab] = useState<"jobs" | "earnings">("jobs");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [offer, setOffer] = useState<Offer | null>(null);
    const [secondsLeft, setSecondsLeft] = useState(OFFER_SECONDS);
    const [activeDelivery, setActiveDelivery] = useState<Offer | null>(null);
    const [activeRide, setActiveRide] = useState<Offer | null>(null);
    const [rideStep, setRideStep] = useState<RideStep>("accepted");
    const [soundOn, setSoundOn] = useState(true);
    const [hiddenWhileOnline, setHiddenWhileOnline] = useState(false);
    const coords = useRef<{ lat: number; lng: number } | null>(null);
    const seenOffers = useRef<Set<string>>(new Set());
    const soundOnRef = useRef(true);
    const lastHeartbeatAt = useRef(0);
    useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

    // GPS watch
    useEffect(() => {
        if (!online || typeof navigator === "undefined" || !navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                coords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            },
            () => setError("Activează localizarea pentru a primi comenzi."),
            { enableHighAccuracy: true, maximumAge: 5000 },
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [online]);

    // Heartbeat: trimite poziția + ia oferte la ~10s
    const heartbeat = useCallback(async (isOnline: boolean): Promise<void> => {
        try {
            const res = await fetch("/api/couriers/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    online: isOnline,
                    lat: coords.current?.lat,
                    lng: coords.current?.lng,
                }),
            });
            if (res.status === 401) {
                setError("Autentifică-te pentru a lucra ca și curier.");
                setOnline(false);
                return;
            }
            if (res.status === 403) {
                setError("Contul de curier nu e aprobat încă.");
                setOnline(false);
                return;
            }
            if (!res.ok) return;
            setError(null);
            const data = (await res.json()) as { offers?: Offer[] };
            const fresh = (data.offers ?? []).find((o) => !seenOffers.current.has(o.offer_id));
            if (fresh && !offer && !activeDelivery && !activeRide) {
                seenOffers.current.add(fresh.offer_id);
                const msLeft = new Date(fresh.expires_at).getTime() - Date.now();
                setSecondsLeft(Math.max(1, Math.min(OFFER_SECONDS, Math.floor(msLeft / 1000))));
                setOffer(fresh);
                if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
                if (soundOnRef.current) playOfferSound();
            }
            lastHeartbeatAt.current = Date.now();
        } catch {
            // rețea — reîncercăm
        }
    }, [offer, activeDelivery, activeRide]);

    useEffect(() => {
        if (!online) return;
        void heartbeat(true);
        const t = setInterval(() => void heartbeat(true), 10_000);
        return () => clearInterval(t);
    }, [online, heartbeat]);

    // Push instant: SW-ul trimite postMessage la orice push primit —
    // declanșăm imediat un heartbeat ca să luăm oferta fără să așteptăm polling-ul.
    useEffect(() => {
        if (!online || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
        const onMsg = (ev: MessageEvent) => {
            const d = ev.data as { type?: string } | null;
            if (d?.type === "push") void heartbeat(true);
        };
        navigator.serviceWorker.addEventListener("message", onMsg);
        return () => navigator.serviceWorker.removeEventListener("message", onMsg);
    }, [online, heartbeat]);

    // Vizibilitate: la revenirea în prim-plan re-trigger heartbeat dacă a
    // trecut >60s de la ultima poziție trimisă; banner când tab-ul e în fundal.
    useEffect(() => {
        if (!online || typeof document === "undefined") return;
        const onVis = () => {
            const hidden = document.visibilityState === "hidden";
            setHiddenWhileOnline(hidden);
            if (!hidden && Date.now() - lastHeartbeatAt.current > 60_000) void heartbeat(true);
        };
        document.addEventListener("visibilitychange", onVis);
        onVis();
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [online, heartbeat]);

    // Heartbeat de siguranță: dacă din orice motiv nu s-a trimis poziție >60s
    // cât suntem online, re-trigger imediat.
    useEffect(() => {
        if (!online) return;
        const t = setInterval(() => {
            if (Date.now() - lastHeartbeatAt.current > 60_000) void heartbeat(true);
        }, 15_000);
        return () => clearInterval(t);
    }, [online, heartbeat]);

    // Countdown ofertă
    useEffect(() => {
        if (!offer) return;
        if (secondsLeft <= 0) {
            setOffer(null);
            return;
        }
        const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [offer, secondsLeft]);

    async function toggleOnline(): Promise<void> {
        setBusy(true);
        const next = !online;
        try {
            await heartbeat(next);
            setOnline(next);
            if (!next) {
                setOffer(null);
            }
        } finally {
            setBusy(false);
        }
    }

    async function respond(accept: boolean): Promise<void> {
        if (!offer) return;
        setBusy(true);
        try {
            const isRide = offer.kind === "ride" && offer.ride_id;
            const url = isRide
                ? `/api/rides/${offer.ride_id}/dispatch`
                : `/api/local-orders/${offer.order_id}/dispatch`;
            const res = await fetch(url, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accept }),
            });
            if (accept && res.ok) {
                if (isRide) {
                    setActiveRide(offer);
                    setRideStep("accepted");
                } else {
                    setActiveDelivery(offer);
                }
            }
        } finally {
            setOffer(null);
            setBusy(false);
        }
    }

    async function updateDelivery(status: "picked_up" | "delivered"): Promise<void> {
        if (!activeDelivery) return;
        const res = await fetch(`/api/local-orders/${activeDelivery.order_id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        if (res.ok && status === "delivered") setActiveDelivery(null);
    }

    /** Tranziții cursă Go: accepted → arriving → in_progress → completed. */
    async function updateRide(status: "arriving" | "in_progress" | "completed"): Promise<void> {
        if (!activeRide?.ride_id) return;
        const res = await fetch(`/api/rides/${activeRide.ride_id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        if (!res.ok) return;
        if (status === "completed") {
                // Cursele cash: marchează încasarea (serverul refuză politicos la card).
                void fetch(`/api/rides/${activeRide.ride_id}/pay`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "collect_cash" }),
                }).catch(() => { });
            setActiveRide(null);
        } else {
            setRideStep(status);
        }
    }

    return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-gray-50 p-4">
            <header className="flex items-center justify-between">
                <h1 className="text-lg font-bold">Swypik Curier</h1>
                <div className="flex items-center gap-2">
                <a href="/courier/earnings" className="rounded-full border px-3 py-2 text-xs font-semibold">
                    Câștiguri
                </a>
                <button
                    onClick={() => setSoundOn((s) => !s)}
                    aria-label={soundOn ? t("soundOn") : t("soundOff")}
                    title={soundOn ? t("soundOn") : t("soundOff")}
                    className="rounded-full border px-3 py-2 text-xs"
                >
                    {soundOn ? "🔔" : "🔕"}
                </button>
                <button
                    onClick={() => void toggleOnline()}
                    disabled={busy}
                    className={`rounded-full px-5 py-2 text-sm font-bold text-white transition ${online ? "bg-green-600" : "bg-gray-400"
                        } disabled:opacity-50`}
                >
                    {online ? "● ONLINE" : "○ OFFLINE"}
                </button>
                </div>
            </header>

            {online && hiddenWhileOnline && (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    ⚠️ {t("bgWarning")}
                </div>
            )}

                <nav className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => setTab("jobs")}
                        className={`rounded-lg py-2 text-sm font-semibold ${tab === "jobs" ? "bg-black text-white" : "bg-white border"}`}
                    >
                        Comenzi
                    </button>
                    <button
                        onClick={() => setTab("earnings")}
                        className={`rounded-lg py-2 text-sm font-semibold ${tab === "earnings" ? "bg-black text-white" : "bg-white border"}`}
                    >
                        Câștiguri
                    </button>
                </nav>

                {tab === "earnings" && <EarningsTab />}

                {tab === "jobs" && <>
            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {!online && !activeDelivery && !activeRide && (
                <div className="rounded-xl border border-dashed p-8 text-center text-gray-400">
                    Treci online ca să primești comenzi.
                </div>
            )}

            {online && !offer && !activeDelivery && !activeRide && (
                <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
                    <div className="animate-pulse text-3xl">📡</div>
                    <p className="mt-2 text-sm text-gray-500">Aștept comenzi… GPS-ul se trimite la 10s.</p>
                </div>
            )}

            {offer && (
                <div className="rounded-2xl border-2 border-blue-500 bg-white p-5 shadow-lg">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold">{offer.kind === "ride" ? "Cursă nouă! 🚕" : "Comandă nouă!"}</h2>
                        <span
                            className={`rounded-full px-3 py-1 font-mono text-lg font-bold ${secondsLeft <= 10 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                                }`}
                        >
                            {secondsLeft}s
                        </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded bg-gray-200">
                        <div
                            className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
                            style={{ width: `${(secondsLeft / OFFER_SECONDS) * 100}%` }}
                        />
                    </div>
                    <dl className="mt-3 space-y-1 text-sm">
                        {offer.order_number && (
                            <div><dt className="inline font-medium">Comandă: </dt><dd className="inline font-mono">{offer.order_number}</dd></div>
                        )}
                        <div><dt className="inline font-medium">Ridicare: </dt><dd className="inline">{offer.merchant_name}{offer.pickup_address ? ` — ${offer.pickup_address}` : ""}</dd></div>
                        <div><dt className="inline font-medium">{offer.kind === "ride" ? "Destinație: " : "Livrare: "}</dt><dd className="inline">{offer.delivery_address}</dd></div>
                        <div><dt className="inline font-medium">{offer.kind === "ride" ? "Tarif estimat: " : "Câștig: "}</dt><dd className="inline font-bold">{(offer.delivery_fee_cents / 100).toFixed(2)} {offer.currency}</dd></div>
                    </dl>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                            onClick={() => void respond(false)}
                            disabled={busy}
                            className="rounded-lg bg-gray-200 py-3 font-semibold text-gray-700 disabled:opacity-50"
                        >
                            Refuz
                        </button>
                        <button
                            onClick={() => void respond(true)}
                            disabled={busy}
                            className="rounded-lg bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
                        >
                            Accept
                        </button>
                    </div>
                </div>
            )}

            {activeDelivery && (
                <div className="rounded-2xl border bg-white p-5 shadow-md">
                    <h2 className="font-bold">Livrare în curs — {activeDelivery.order_number}</h2>
                    <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span>🏪 {activeDelivery.merchant_name}</span>
                            {activeDelivery.pickup_address && (
                                <NavButtons address={activeDelivery.pickup_address} gmapsLabel={t("gmaps")} wazeLabel={t("waze")} />
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span>🏠 {activeDelivery.delivery_address}</span>
                            <NavButtons address={activeDelivery.delivery_address} gmapsLabel={t("gmaps")} wazeLabel={t("waze")} />
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                            onClick={() => void updateDelivery("picked_up")}
                            className="rounded-lg bg-amber-500 py-3 text-sm font-semibold text-white"
                        >
                            Am ridicat
                        </button>
                        <button
                            onClick={() => void updateDelivery("delivered")}
                            className="rounded-lg bg-green-600 py-3 text-sm font-semibold text-white"
                        >
                            Am livrat
                        </button>
                    </div>
                </div>
            )}

            {activeRide && (
                <div className="rounded-2xl border bg-white p-5 shadow-md">
                    <h2 className="font-bold">Cursă în curs 🚕</h2>
                    <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span>🟢 {activeRide.pickup_address ?? "Punct de ridicare"}</span>
                            {activeRide.pickup_address && (
                                <NavButtons address={activeRide.pickup_address} gmapsLabel={t("gmaps")} wazeLabel={t("waze")} />
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span>🔴 {activeRide.delivery_address}</span>
                            <NavButtons address={activeRide.delivery_address} gmapsLabel={t("gmaps")} wazeLabel={t("waze")} />
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3">
                        {rideStep === "accepted" && (
                            <button
                                onClick={() => void updateRide("arriving")}
                                className="rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white"
                            >
                                Am pornit spre client
                            </button>
                        )}
                        {rideStep === "arriving" && (
                            <button
                                onClick={() => void updateRide("in_progress")}
                                className="rounded-lg bg-amber-500 py-3 text-sm font-semibold text-white"
                            >
                                Clientul a urcat — pornește cursa
                            </button>
                        )}
                        {rideStep === "in_progress" && (
                            <button
                                onClick={() => void updateRide("completed")}
                                className="rounded-lg bg-green-600 py-3 text-sm font-semibold text-white"
                            >
                                Finalizează cursa
                            </button>
                        )}
                    </div>
                </div>
            )}
                </>}
        </div>
    );
}
