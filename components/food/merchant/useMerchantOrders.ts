"use client";

/** Comenzile active ale restaurantului: polling + sunet la comandă nouă + acțiuni de status. */
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";

export type MerchantOrder = {
  id: string;
  order_number: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_notes: string | null;
  items: { name: string; qty: number; unit_price_cents: number; options?: { name: string }[]; notes?: string | null }[];
  total_cents: number;
  payment_method: string;
  payment_status: string;
  dispatch_status: string | null;
  courier_id: string | null;
  placed_at: string;
};

const POLL_MS = 10_000;
const DING_HZ = 880;

function playDing(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = DING_HZ;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch {
    /* audio indisponibil */
  }
}

export function useMerchantOrders(merchantId: string | null) {
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const known = useRef<Set<string>>(new Set());
  const first = useRef(true);

  const poll = useCallback(async () => {
    if (!merchantId) return;
    try {
      const res = await fetch(`/api/merchants/${merchantId}/orders?status=active&limit=100`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { orders?: MerchantOrder[] };
      const list = data.orders ?? [];
      if (!first.current && list.some((o) => !known.current.has(o.id))) playDing();
      list.forEach((o) => known.current.add(o.id));
      first.current = false;
      setOrders(list);
    } catch (err) {
      logger.warn({ err, merchantId }, "merchant order poll failed");
    } finally {
      setLoaded(true);
    }
  }, [merchantId]);

  useEffect(() => {
    if (!merchantId) return;
    first.current = true;
    known.current = new Set();
    setLoaded(false);
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [merchantId, poll]);

  /** PATCH status; întoarce codul de eroare sau null. */
  const setStatus = useCallback(
    async (orderId: string, status: string, reason?: string): Promise<string | null> => {
      const res = await fetch(`/api/local-orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason: reason || undefined }),
      });
      const data = (await res.json().catch(() => null)) as { code?: string } | null;
      void poll();
      return res.ok ? null : data?.code ?? "server_error";
    },
    [poll],
  );

  /** Pornește căutarea de curier prin API-ul existent de dispatch. */
  const findCourier = useCallback(
    async (orderId: string): Promise<boolean> => {
      const res = await fetch(`/api/local-orders/${orderId}/dispatch`, { method: "POST" });
      void poll();
      return res.ok;
    },
    [poll],
  );

  return { orders, loaded, setStatus, findCourier };
}
