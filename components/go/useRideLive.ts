"use client";

/**
 * Starea live a unei curse: GET /api/rides/[id] + SSE (/api/rides/[id]/stream,
 * canalul Redis al jobului de dispatch). Dacă SSE-ul cade, trecem pe polling.
 * Folosit și de ecranul pasagerului, și de panoul șoferului.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "./RideMap";
import type { RideResponse } from "./types";

const POLL_MS = Number(process.env.NEXT_PUBLIC_GO_POLL_MS) > 0 ? Number(process.env.NEXT_PUBLIC_GO_POLL_MS) : 10_000;
const FINAL = new Set(["completed", "cancelled"]);

export function useRideLive(rideId: string | null) {
  const [data, setData] = useState<RideResponse | null>(null);
  const [driverPos, setDriverPos] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sseDown, setSseDown] = useState(false);
  const statusRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!rideId) return;
    try {
      const res = await fetch(`/api/rides/${rideId}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as RideResponse & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "generic");
        return;
      }
      setError(null);
      setData(body);
      statusRef.current = body.ride.status;
      if (body.driver?.current_lat != null && body.driver.current_lng != null) {
        setDriverPos({ lat: Number(body.driver.current_lat), lng: Number(body.driver.current_lng) });
      }
    } catch {
      setError("network");
    }
  }, [rideId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!rideId || typeof EventSource === "undefined") {
      setSseDown(true);
      return;
    }
    const es = new EventSource(`/api/rides/${rideId}/stream`);
    es.onopen = () => setSseDown(false);
    es.onerror = () => setSseDown(true);
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string; lat?: number; lng?: number };
        if (msg.type === "location" && msg.lat != null && msg.lng != null) {
          setDriverPos({ lat: msg.lat, lng: msg.lng });
        } else if (msg.type !== "snapshot") {
          void refresh();
        }
      } catch {
        /* mesaj non-JSON (ping) */
      }
    };
    return () => es.close();
  }, [rideId, refresh]);

  // Plasa de siguranță: polling cât SSE-ul e căzut și cursa nu e finală.
  useEffect(() => {
    if (!sseDown) return;
    const iv = setInterval(() => {
      if (!statusRef.current || !FINAL.has(statusRef.current)) void refresh();
    }, POLL_MS);
    return () => clearInterval(iv);
  }, [sseDown, refresh]);

  return { data, driverPos, error, refresh };
}
