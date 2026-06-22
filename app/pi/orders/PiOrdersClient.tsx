"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PiOrder = {
  orderId: string;
  amountPi: number;
  status: string;
  txid: string | null;
  date: string;
};

export default function PiOrdersClient() {
  const [orders, setOrders] = useState<PiOrder[] | null>(null);
  const [authed, setAuthed] = useState(true);

  useEffect(() => {
    fetch("/api/pi/orders")
      .then((r) => r.json())
      .then((d) => {
        setAuthed(d.authenticated !== false);
        setOrders(d.orders || []);
      })
      .catch(() => setOrders([]));
  }, []);

  if (orders === null) {
    return <p className="py-10 text-center text-sm text-white/50">Loading…</p>;
  }

  if (!authed) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-white/50">Sign in with Pi to see your orders.</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-white/50">No orders yet.</p>
        <Link
          href="/pi"
          className="mt-4 inline-block rounded-xl bg-[#7D4698] px-5 py-2.5 text-sm font-bold text-white"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-black">Orders</h1>
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.orderId} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-white/60">#{o.orderId.slice(0, 8)}</span>
              <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-400">
                Paid
              </span>
            </div>
            <p className="mt-2 text-lg font-black text-[#C9A2DC]">π {o.amountPi.toFixed(4)}</p>
            <p className="mt-1 text-xs text-white/40">
              {new Date(o.date).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
