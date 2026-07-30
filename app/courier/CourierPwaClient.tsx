"use client";

/**
 * PWA curier: toggle online/offline, GPS periodic (~10s),
 * ofertă de comandă cu countdown 45s accept/refuz, link navigare Google Maps.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Offer = {
  offer_id: string;
  order_id: string;
  expires_at: string;
  order_number: string;
  merchant_name: string;
  pickup_address: string | null;
  delivery_address: string;
  delivery_fee_cents: number;
  currency: string;
};

const OFFER_SECONDS = 45;

function mapsLink(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function CourierPwaClient() {
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(OFFER_SECONDS);
  const [activeDelivery, setActiveDelivery] = useState<Offer | null>(null);
  const coords = useRef<{ lat: number; lng: number } | null>(null);
  const seenOffers = useRef<Set<string>>(new Set());

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
      if (fresh && !offer && !activeDelivery) {
        seenOffers.current.add(fresh.offer_id);
        const msLeft = new Date(fresh.expires_at).getTime() - Date.now();
        setSecondsLeft(Math.max(1, Math.min(OFFER_SECONDS, Math.floor(msLeft / 1000))));
        setOffer(fresh);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
      }
    } catch {
      // rețea — reîncercăm
    }
  }, [offer, activeDelivery]);

  useEffect(() => {
    if (!online) return;
    void heartbeat(true);
    const t = setInterval(() => void heartbeat(true), 10_000);
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
      const res = await fetch(`/api/local-orders/${offer.order_id}/dispatch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      if (accept && res.ok) {
        setActiveDelivery(offer);
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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-gray-50 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Swypik Curier</h1>
        <button
          onClick={() => void toggleOnline()}
          disabled={busy}
          className={`rounded-full px-5 py-2 text-sm font-bold text-white transition ${
            online ? "bg-green-600" : "bg-gray-400"
          } disabled:opacity-50`}
        >
          {online ? "● ONLINE" : "○ OFFLINE"}
        </button>
      </header>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!online && !activeDelivery && (
        <div className="rounded-xl border border-dashed p-8 text-center text-gray-400">
          Treci online ca să primești comenzi.
        </div>
      )}

      {online && !offer && !activeDelivery && (
        <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
          <div className="animate-pulse text-3xl">📡</div>
          <p className="mt-2 text-sm text-gray-500">Aștept comenzi… GPS-ul se trimite la 10s.</p>
        </div>
      )}

      {offer && (
        <div className="rounded-2xl border-2 border-blue-500 bg-white p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Comandă nouă!</h2>
            <span
              className={`rounded-full px-3 py-1 font-mono text-lg font-bold ${
                secondsLeft <= 10 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
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
            <div><dt className="inline font-medium">Comandă: </dt><dd className="inline font-mono">{offer.order_number}</dd></div>
            <div><dt className="inline font-medium">Ridicare: </dt><dd className="inline">{offer.merchant_name}{offer.pickup_address ? ` — ${offer.pickup_address}` : ""}</dd></div>
            <div><dt className="inline font-medium">Livrare: </dt><dd className="inline">{offer.delivery_address}</dd></div>
            <div><dt className="inline font-medium">Câștig: </dt><dd className="inline font-bold">{(offer.delivery_fee_cents / 100).toFixed(2)} {offer.currency}</dd></div>
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
                <a
                  href={mapsLink(activeDelivery.pickup_address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
                >
                  Navighează
                </a>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>🏠 {activeDelivery.delivery_address}</span>
              <a
                href={mapsLink(activeDelivery.delivery_address)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
              >
                Navighează
              </a>
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
    </div>
  );
}
