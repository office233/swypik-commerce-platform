/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type CartItem = {
  product: {
    id?: string;
    pgId?: string;
    productId?: string;
    title: string;
    price: number;
    oldPrice?: number;
    image?: string;
    images?: string[];
    color?: string;
    selectedColor?: string;
    selectedSize?: string;
    skuId?: string;
  };
  qty: number;
};

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("aicv_cart");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch {}
    setIsLoading(false);
  }, []);

  const persist = (updated: CartItem[]) => {
    setItems(updated);
    localStorage.setItem("aicv_cart", JSON.stringify(updated));
  };

  const updateQty = (idx: number, delta: number) => {
    const updated = items.map((item, i) => {
      if (i !== idx) return item;
      const next = Math.max(1, Math.min(10, item.qty + delta));
      return { ...item, qty: next };
    });
    persist(updated);
  };

  const removeItem = (idx: number) => {
    persist(items.filter((_, i) => i !== idx));
  };

  const clearCart = () => persist([]);

  const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  const totalItems = items.reduce((s, i) => s + i.qty, 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#E5E5E5] border-t-[#0D0D0D] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#E5E5E5] bg-white/95 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7F7F8] border border-[#E5E5E5] text-[#0D0D0D] active:scale-90 transition-transform">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-black text-[#0D0D0D]">Coșul tău</h1>
          <p className="text-xs font-semibold text-[#6E6E80]">
            {totalItems} {totalItems === 1 ? "produs" : "produse"}
          </p>
        </div>
        {items.length > 0 && (
          <button onClick={clearCart} className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors px-3 py-1.5 rounded-lg bg-red-50">
            Golește coșul
          </button>
        )}
      </header>

      {items.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-[#F7F7F8] flex items-center justify-center mb-6">
            <ShoppingCart size={36} className="text-[#D1D1D6]" />
          </div>
          <h2 className="text-xl font-black text-[#0D0D0D] mb-2">Coșul tău este gol</h2>
          <p className="text-sm text-[#6E6E80] mb-6 max-w-xs">
            Explorează feed-ul sau magazinul pentru a descoperi produse noi.
          </p>
          <div className="flex gap-3">
            <Link href="/explore" className="rounded-xl bg-[#0D0D0D] px-6 py-3 text-sm font-bold text-white active:scale-95 transition-transform">
              Explorează Feed
            </Link>
            <Link href="/shop" className="rounded-xl bg-[#F7F7F8] border border-[#E5E5E5] px-6 py-3 text-sm font-bold text-[#0D0D0D] active:scale-95 transition-transform">
              Magazin
            </Link>
          </div>
        </div>
      ) : (
        /* Cart Items */
        <div className="max-w-2xl mx-auto px-4 pt-4" style={{ paddingBottom: "max(12rem, calc(9rem + env(safe-area-inset-bottom, 0px)))" }}>
          <div className="space-y-3">
            {items.map((item, idx) => {
              const img = item.product.images?.[0] || item.product.image;
              const variant = [item.product.selectedColor, item.product.selectedSize].filter(Boolean).join(" / ");

              return (
                <div key={idx} className="flex gap-4 p-4 rounded-2xl border border-[#E5E5E5] bg-white hover:border-[#0D0D0D]/30 transition-colors">
                  {/* Image */}
                  <div className="h-20 w-20 rounded-xl bg-[#F7F7F8] border border-[#E5E5E5] overflow-hidden shrink-0 sm:h-24 sm:w-24">
                    {img ? (
                      <img src={img} alt={item.product.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link href={`/product/${item.product.id || item.product.pgId}`} className="text-sm font-bold text-[#0D0D0D] line-clamp-2 leading-tight hover:text-[#0D0D0D] transition-colors">
                      {item.product.title}
                    </Link>
                    {variant && (
                      <p className="text-xs text-[#6E6E80] mt-1">{variant}</p>
                    )}

                    <div className="flex items-center justify-between mt-3">
                      {/* Quantity */}
                      <div className="flex items-center rounded-xl border border-[#E5E5E5] overflow-hidden">
                        <button onClick={() => updateQty(idx, -1)} disabled={item.qty <= 1} className="w-8 h-8 flex items-center justify-center text-[#6E6E80] hover:bg-[#F7F7F8] disabled:opacity-30 transition">
                          <Minus size={14} />
                        </button>
                        <span className="w-8 h-8 flex items-center justify-center text-sm font-black text-[#0D0D0D] border-x border-[#E5E5E5]">
                          {item.qty}
                        </span>
                        <button onClick={() => updateQty(idx, 1)} disabled={item.qty >= 10} className="w-8 h-8 flex items-center justify-center text-[#6E6E80] hover:bg-[#F7F7F8] disabled:opacity-30 transition">
                          <Plus size={14} />
                        </button>
                      </div>

                      {/* Price */}
                      <div className="text-right">
                        <p className="text-base font-black text-[#0D0D0D]">{(item.product.price * item.qty).toFixed(2)} lei</p>
                        {item.qty > 1 && (
                          <p className="text-xs text-[#A1A1AA]">{item.product.price.toFixed(2)} / buc</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Remove */}
                  <button onClick={() => removeItem(idx)} className="self-start p-2 rounded-lg text-[#D1D1D6] hover:text-red-500 hover:bg-red-50 transition-all">
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Upsell */}
          <div className="mt-6 p-4 rounded-2xl bg-[#F7F7F8] border border-[#E5E5E5]">
            <p className="text-xs font-bold text-[#6E6E80] uppercase tracking-wider mb-2">💡 Livrare gratuită</p>
            <p className="text-sm text-[#0D0D0D] font-semibold">
              Toate comenzile au livrare gratuită pe Swypik.
            </p>
          </div>
        </div>
      )}

      {/* Fixed Bottom — Checkout */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-[#E5E5E5] px-4 pt-4 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] safe-pb">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-[#6E6E80]">Total ({totalItems} produse)</span>
              <span className="text-xl font-black text-[#0D0D0D]">{subtotal.toFixed(2)} lei</span>
            </div>
            <Link
              href="/checkout"
              className="block w-full rounded-2xl bg-[#0D0D0D] py-4 text-center text-sm font-bold text-white active:scale-[0.98] transition-transform shadow-xl"
            >
              🔒 Finalizează comanda — {subtotal.toFixed(2)} lei
            </Link>
            <p className="text-center text-xs text-[#A1A1AA] mt-2">
              Plata securizată prin Stripe • Livrare gratuită
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
