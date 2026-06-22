"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Minus, Plus } from "lucide-react";
import { usePiCart } from "../cart";
import { ensurePiAuthWithPayments, createPiPayment } from "@/lib/pi/payments";

export default function PiCartClient() {
  const router = useRouter();
  const { items, remove, setQty, clear, totalPi } = usePiCart();
  const [status, setStatus] = useState<
    | { phase: "idle" }
    | { phase: "auth" }
    | { phase: "paying" }
    | { phase: "done"; orderId: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  async function checkout() {
    if (items.length === 0) return;
    setStatus({ phase: "auth" });
    try {
      await ensurePiAuthWithPayments();
    } catch (e) {
      setStatus({
        phase: "error",
        message: e instanceof Error ? e.message : "Open in Pi Browser to pay.",
      });
      return;
    }
    setStatus({ phase: "paying" });
    createPiPayment({
      amountPi: Math.round(totalPi * 1e7) / 1e7,
      memo: `Swypik — ${items.length} item(s)`.slice(0, 120),
      items: items.map((i) => ({ productId: i.id, quantity: i.qty })),
      onCompleted: (orderId) => {
        clear();
        setStatus({ phase: "done", orderId });
      },
      onCancelled: () => setStatus({ phase: "idle" }),
      onError: (message) => setStatus({ phase: "error", message }),
    });
  }

  if (status.phase === "done") {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-6 text-center">
        <div className="mb-2 text-4xl">✅</div>
        <h2 className="mb-1 text-lg font-black">Paid with Pi</h2>
        <p className="text-sm text-white/70">
          Order <span className="font-mono">{status.orderId.slice(0, 8)}</span> confirmed.
        </p>
        <button
          onClick={() => router.push("/pi/orders")}
          className="mt-4 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold hover:bg-white/20"
        >
          View orders
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-white/50">Your cart is empty.</p>
        <Link
          href="/pi"
          className="mt-4 inline-block rounded-xl bg-[#7D4698] px-5 py-2.5 text-sm font-bold text-white"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-black">Cart</h1>
      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.id} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-white/5">
              {i.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.image} alt={i.title} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs text-white/80">{i.title}</p>
              <p className="mt-1 text-sm font-black text-[#C9A2DC]">π {i.amountPi.toFixed(4)}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => setQty(i.id, i.qty - 1)}
                  className="rounded-md border border-white/20 p-1"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-6 text-center text-sm">{i.qty}</span>
                <button
                  onClick={() => setQty(i.id, i.qty + 1)}
                  className="rounded-md border border-white/20 p-1"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button onClick={() => remove(i.id)} className="ml-auto text-white/40">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-sm text-white/60">Total</span>
        <span className="text-xl font-black text-[#C9A2DC]">π {totalPi.toFixed(4)}</span>
      </div>

      {status.phase === "error" && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {status.message}
        </div>
      )}

      <button
        onClick={checkout}
        disabled={status.phase === "auth" || status.phase === "paying"}
        className="mt-4 w-full rounded-xl bg-[#7D4698] py-3.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {status.phase === "auth"
          ? "Connecting…"
          : status.phase === "paying"
          ? "Paying…"
          : `Pay π ${totalPi.toFixed(4)} with Pi`}
      </button>
    </div>
  );
}
