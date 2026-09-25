"use client";

/**
 * Heartbeat-ul șoferului: POST /api/couriers/status la HEARTBEAT_MS cu GPS-ul
 * curent (reîmprospătează last_heartbeat_at — sweep-ul din dispatch-tick pune
 * offline șoferii tăcuți). Răspunsul aduce ofertele pending.
 * Starea „online" vine DOAR din răspunsul serverului (fix: după un 403 UI-ul
 * rămânea ONLINE).
 */
import { useCallback, useEffect, useRef, useState } from "react";

const HEARTBEAT_MS =
  Number(process.env.NEXT_PUBLIC_DRIVER_HEARTBEAT_MS) > 0 ? Number(process.env.NEXT_PUBLIC_DRIVER_HEARTBEAT_MS) : 10_000;

export type DriverOffer = {
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

export type HeartbeatError = "unauthorized" | "not_approved" | "suspended" | "location" | null;

export function useDriverHeartbeat() {
  const [online, setOnline] = useState(false);
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [error, setError] = useState<HeartbeatError>(null);
  const [busy, setBusy] = useState(false);
  const coords = useRef<{ lat: number; lng: number } | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!online || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        coords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(coords.current);
      },
      () => setError("location"),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);

  const beat = useCallback(async (wantOnline: boolean): Promise<boolean> => {
    try {
      const res = await fetch("/api/couriers/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: wantOnline, lat: coords.current?.lat, lng: coords.current?.lng }),
      });
      const body = (await res.json().catch(() => ({}))) as { online?: boolean; offers?: DriverOffer[]; error?: string };
      if (res.status === 401) setError("unauthorized");
      else if (res.status === 403) setError(body.error === "courier_suspended" ? "suspended" : "not_approved");
      if (!res.ok) {
        setOnline(false);
        setOffers([]);
        return false;
      }
      setError((e) => (e === "location" ? e : null));
      setOnline(Boolean(body.online));
      setOffers(body.online ? body.offers ?? [] : []);
      return true;
    } catch {
      return false; // rețea — reîncercăm la următorul tick
    }
  }, []);

  useEffect(() => {
    if (!online) return;
    const iv = setInterval(() => void beat(true), HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [online, beat]);

  const toggle = useCallback(async () => {
    setBusy(true);
    await beat(!online);
    setBusy(false);
  }, [beat, online]);

  const dropOffer = useCallback((offerId: string) => setOffers((o) => o.filter((x) => x.offer_id !== offerId)), []);

  return { online, offers, error, busy, toggle, dropOffer, position, refresh: () => beat(online) };
}
