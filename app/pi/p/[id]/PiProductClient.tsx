"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, ShoppingBag, Zap } from "lucide-react";
import type { PiShopProduct } from "../../types";
import { piCartAdd } from "../../cart";
import { ensurePiAuthWithPayments, createPiPayment } from "@/lib/pi/payments";

export default function PiProductClient({ product }: { product: PiShopProduct }) {
  const router = useRouter();
  const [img, setImg] = useState(0);
  const [status, setStatus] = useState<
    | { phase: "idle" }
    | { phase: "auth" }
    | { phase: "paying" }
    | { phase: "done"; orderId: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  const canBuy = product.amountPi != null && product.amountPi > 0;

  function addToCart() {
    if (!canBuy) return;
    piCartAdd({
      id: product.id,
      title: product.title,
      image: product.images?.[0] || "",
      amountPi: product.amountPi!,
    });
    router.push("/pi/cart");
  }

  async function buyNow() {
    if (!canBuy) return;
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
      amountPi: product.amountPi!,
      memo: `Swypik — ${product.title}`.slice(0, 120),
      items: [{ productId: product.id, quantity: 1 }],
      onCompleted: (orderId) => setStatus({ phase: "done", orderId }),
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

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {product.images?.[img] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.images[img]} alt={product.title} className="aspect-square w-full object-cover" />
        ) : (
          <div className="aspect-square w-full" />
        )}
      </div>
      {product.images?.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {product.images.map((src, i) => (
            <button
              key={src}
              onClick={() => setImg(i)}
              className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border ${
                i === img ? "border-[#C9A2DC]" : "border-white/10"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <h1 className="mt-4 text-base font-bold">{product.title}</h1>

      <div className="mt-2 flex items-center gap-3 text-xs text-white/60">
        {product.rating != null && product.rating > 0 && (
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-current text-yellow-400" />
            {product.rating.toFixed(1)}
          </span>
        )}
        {product.orders != null && product.orders > 0 && <span>{product.orders} sold</span>}
        {product.deliveryDays != null && <span>~{product.deliveryDays}d delivery</span>}
      </div>

      <p className="mt-3 text-2xl font-black text-[#C9A2DC]">
        {canBuy ? `π ${product.amountPi!.toFixed(4)}` : "π —"}
      </p>

      {product.description && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/70">
          {product.description.slice(0, 600)}
        </p>
      )}

      {status.phase === "error" && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {status.message}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          onClick={addToCart}
          disabled={!canBuy}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 py-3 text-sm font-bold disabled:opacity-50"
        >
          <ShoppingBag className="h-4 w-4" /> Add to cart
        </button>
        <button
          onClick={buyNow}
          disabled={!canBuy || status.phase === "auth" || status.phase === "paying"}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#7D4698] py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          <Zap className="h-4 w-4" />
          {status.phase === "auth"
            ? "Connecting…"
            : status.phase === "paying"
            ? "Paying…"
            : "Buy with Pi"}
        </button>
      </div>
    </div>
  );
}
