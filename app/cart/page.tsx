/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useFormatPrice } from "@/components/i18n/useFormatPrice";

type ApiItem = {
  id: string;
  productId: string;
  variantId: string | null;
  title: string;
  image: string | null;
  quantity: number;
  priceCents: number;
  currency: string;
  metadata?: Record<string, unknown>;
};

async function migrateLocalCart(): Promise<boolean> {
  try {
    const saved = localStorage.getItem("aicv_cart");
    if (!saved) return false;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem("aicv_cart");
      return false;
    }
    for (const it of parsed) {
      const productId = it?.product?.id || it?.product?.pgId || it?.product?.productId;
      if (!productId) continue;
      const priceRon = Number(it?.product?.price);
      const priceCents = Number.isFinite(priceRon) ? Math.round(priceRon * 100) : 0;
      await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productId: String(productId),
          quantity: Math.max(1, Math.min(10, Number(it?.qty) || 1)),
          variantId: it?.product?.skuId || null,
          title: it?.product?.title,
          image: it?.product?.images?.[0] || it?.product?.image || null,
          priceCents,
          currency: "RON",
        }),
      }).catch(() => null);
    }
    localStorage.removeItem("aicv_cart");
    return true;
  } catch {
    return false;
  }
}

export default function CartPage() {
  const router = useRouter();
  const t = useTranslations("cart");
  const formatPrice = useFormatPrice();
  const [items, setItems] = useState<ApiItem[]>([]);
  const [currency, setCurrency] = useState("RON");
  const [subtotalCents, setSubtotalCents] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const apply = useCallback((data: { items?: ApiItem[]; subtotalCents?: number; currency?: string }) => {
    setItems(Array.isArray(data?.items) ? data.items : []);
    setSubtotalCents(Number(data?.subtotalCents) || 0);
    if (data?.currency) setCurrency(data.currency);
  }, []);

  const load = useCallback(async () => {
    const r = await fetch("/api/cart", { credentials: "include", cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    apply(data);
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch("/api/cart", { credentials: "include", cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (!cancelled) apply(data);
      const empty = !Array.isArray(data?.items) || data.items.length === 0;
      if (empty) {
        const migrated = await migrateLocalCart();
        if (migrated && !cancelled) await load();
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [apply, load]);

  const updateQty = async (item: ApiItem, delta: number) => {
    const next = Math.max(0, Math.min(99, item.quantity + delta));
    const r = await fetch(`/api/cart/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ quantity: next }),
    });
    const data = await r.json().catch(() => ({}));
    apply(data);
  };

  const removeItem = async (item: ApiItem) => {
    const r = await fetch(`/api/cart/items/${item.id}`, { method: "DELETE", credentials: "include" });
    const data = await r.json().catch(() => ({}));
    apply(data);
  };

  const clearCart = async () => {
    const r = await fetch("/api/cart", { method: "DELETE", credentials: "include" });
    if (r.ok) await load();
  };

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#E5E5E5] border-t-[#0D0D0D] rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-50 border-b border-[#E5E5E5] bg-white/95 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="grid h-11 w-11 place-items-center rounded-xl bg-[#F7F7F8] border border-[#E5E5E5] text-[#0D0D0D] active:scale-90 transition-transform focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none" aria-label={t("inapoi")}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-black text-[#0D0D0D]">{t("title")}</h1>
          <p className="text-xs font-semibold text-[#6E6E80]">
            {t("productCount", { count: totalItems })}
          </p>
        </div>
        {items.length > 0 && (
          <button onClick={() => { if (confirm(t("confirmClear"))) clearCart(); }} className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors px-3 py-2 rounded-lg bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none min-h-[36px]">
            {t("golesteCosul")}
          </button>
        )}
      </header>

      <main>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-[#F7F7F8] flex items-center justify-center mb-6">
              <ShoppingCart size={36} className="text-[#D1D1D6]" />
            </div>
            <h2 className="text-xl font-black text-[#0D0D0D] mb-2">{t("empty")}</h2>
            <p className="text-sm text-[#6E6E80] mb-6 max-w-xs">{t("exploreazaFeedulSauMagazinul")}</p>
            <div className="flex gap-3">
              <Link href="/explore" className="rounded-xl bg-[#0D0D0D] px-6 py-3 text-sm font-bold text-white active:scale-95 transition-transform">{t("exploreazaFeed")}</Link>
              <Link href="/" className="rounded-xl bg-[#F7F7F8] border border-[#E5E5E5] px-6 py-3 text-sm font-bold text-[#0D0D0D] active:scale-95 transition-transform">{t("magazin")}</Link>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 pt-4" style={{ paddingBottom: "max(12rem, calc(9rem + env(safe-area-inset-bottom, 0px)))" }}>
            <div className="space-y-3">
              {items.map((item) => {
                const lineCents = item.priceCents * item.quantity;
                return (
                  <div key={item.id} className="flex gap-4 p-4 rounded-2xl border border-[#E5E5E5] bg-white hover:border-[#0D0D0D]/30 transition-colors">
                    <div className="h-20 w-20 rounded-xl bg-[#F7F7F8] border border-[#E5E5E5] overflow-hidden shrink-0 sm:h-24 sm:w-24">
                      {item.image ? (
                        <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link href={`/product/${item.productId}`} className="text-sm font-bold text-[#0D0D0D] line-clamp-2 leading-tight hover:text-[#0D0D0D] transition-colors">
                        {item.title}
                      </Link>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center rounded-xl border border-[#E5E5E5] overflow-hidden">
                          <button onClick={() => updateQty(item, -1)} disabled={item.quantity <= 1} className="w-11 h-11 flex items-center justify-center text-[#6E6E80] hover:bg-[#F7F7F8] disabled:opacity-30 transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none" aria-label={t("scade")}>
                            <Minus size={14} />
                          </button>
                          <span className="min-w-[44px] h-11 flex items-center justify-center text-sm font-black text-[#0D0D0D] border-x border-[#E5E5E5]" aria-live="polite">{item.quantity}</span>
                          <button onClick={() => updateQty(item, 1)} disabled={item.quantity >= 99} className="w-11 h-11 flex items-center justify-center text-[#6E6E80] hover:bg-[#F7F7F8] disabled:opacity-30 transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none" aria-label={t("adauga")}>
                            <Plus size={14} />
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-[#0D0D0D]">{formatPrice(lineCents, { sourceCurrency: item.currency as any })}</p>
                          {item.quantity > 1 && (
                            <p className="text-xs text-[#A1A1AA]">{t("perUnit", { price: formatPrice(item.priceCents, { sourceCurrency: item.currency as any }) })}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => { if (confirm(t("confirmRemove"))) removeItem(item); }} className="self-start grid h-11 w-11 place-items-center rounded-lg text-[#D1D1D6] hover:text-red-500 hover:bg-red-50 transition-all focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none" aria-label={t("sterge")}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 p-4 rounded-2xl bg-[#F7F7F8] border border-[#E5E5E5]">
              <p className="text-xs font-bold text-[#6E6E80] uppercase tracking-wider mb-2">{t("livrareGratuita")}</p>
              <p className="text-sm text-[#0D0D0D] font-semibold">{t("toateComenzileAuLivrare")}</p>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-[#E5E5E5] px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-[#6E6E80]">{t("subtotal")} ({t("productCount", { count: totalItems })})</span>
                <span className="text-base font-bold text-[#0D0D0D]">{formatPrice(subtotalCents, { sourceCurrency: currency as any })}</span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-[#A1A1AA]">{t("tax")}</span>
                <span className="text-xs text-[#A1A1AA]">{t("taxCalculatedAtCheckout")}</span>
              </div>
              <Link href="/checkout" className="block w-full rounded-2xl bg-[#0D0D0D] py-4 text-center text-sm font-bold text-white active:scale-[0.98] transition-transform shadow-xl">
                {t("finalizeazaComanda")} {formatPrice(subtotalCents, { sourceCurrency: currency as any })}
              </Link>
              <p className="text-center text-xs text-[#A1A1AA] mt-2">{t("plataSecurizataPrinStripe")}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
