"use client";

import { useState } from "react";
import type { PiProduct } from "./page";
import { ensurePiAuthWithPayments, createPiPayment } from "@/lib/pi/payments";

function ronToPi(ron: number, piToRon: number): number | null {
  if (!piToRon || piToRon <= 0) return null;
  return Math.round((ron / piToRon) * 1e7) / 1e7;
}

type Status =
  | { phase: "idle" }
  | { phase: "authenticating" }
  | { phase: "paying"; productId: string }
  | { phase: "done"; orderId: string }
  | { phase: "error"; message: string };

export default function PiFeedClient({
  products,
  piToRon,
}: {
  products: PiProduct[];
  piToRon: number;
}) {
  const [status, setStatus] = useState<Status>({ phase: "idle" });

  async function buy(p: PiProduct) {
    setStatus({ phase: "authenticating" });
    try {
      await ensurePiAuthWithPayments();
    } catch (e) {
      setStatus({
        phase: "error",
        message:
          e instanceof Error ? e.message : "Open this app inside Pi Browser to pay.",
      });
      return;
    }

    const amountPi = ronToPi(p.price, piToRon);
    if (amountPi == null) {
      setStatus({ phase: "error", message: "Pi rate unavailable, try again shortly." });
      return;
    }
    setStatus({ phase: "paying", productId: p.id });

    createPiPayment({
      amountPi,
      memo: `Swypik — ${p.title}`.slice(0, 120),
      items: [{ productId: p.id, quantity: 1 }],
      onCompleted: (orderId) => setStatus({ phase: "done", orderId }),
      onCancelled: () => setStatus({ phase: "idle" }),
      onError: (message) => setStatus({ phase: "error", message }),
    });
  }

  if (status.phase === "done") {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-6 text-center">
        <div className="mb-2 text-4xl">✅</div>
        <h2 className="mb-1 text-lg font-black">Payment complete</h2>
        <p className="text-sm text-white/70">
          Order <span className="font-mono">{status.orderId.slice(0, 8)}</span> is
          confirmed. You paid with Pi.
        </p>
        <button
          onClick={() => setStatus({ phase: "idle" })}
          className="mt-4 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold hover:bg-white/20"
        >
          Continue shopping
        </button>
      </div>
    );
  }

  return (
    <div>
      {status.phase === "error" && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {status.message}
        </div>
      )}
      {status.phase === "authenticating" && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          Connecting to Pi…
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {products.map((p) => {
          const amountPi = ronToPi(p.price, piToRon);
          const busy = status.phase === "paying" && status.productId === p.id;
          return (
            <div
              key={p.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
            >
              <div className="aspect-square w-full overflow-hidden bg-white/5">
                {p.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.images[0]}
                    alt={p.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-xs text-white/80">{p.title}</p>
                <p className="mt-1 text-sm font-black text-[#C9A2DC]">
                  {amountPi == null ? "π —" : `π ${amountPi.toFixed(4)}`}
                </p>
                <button
                  disabled={busy || status.phase === "authenticating"}
                  onClick={() => buy(p)}
                  className="mt-2 w-full rounded-lg bg-[#7D4698] py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busy ? "Paying…" : "Buy with Pi"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
