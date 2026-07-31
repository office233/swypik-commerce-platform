"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Link } from "@/lib/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { loadStripe, StripeElementsOptions } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements, AddressElement } from "@stripe/react-stripe-js";
import { useFormatPrice } from "@/components/i18n/useFormatPrice";
import CheckoutProductImage from "./checkout/CheckoutProductImage";
import StripePaymentForm from "./checkout/StripePaymentForm";
import type { CartItem } from "./checkout/types";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Main Checkout Form component
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function CheckoutForm() {
  const t = useTranslations("checkoutForm");
  const locale = useLocale();
  const formatPrice = useFormatPrice();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [totalRon, setTotalRon] = useState(0);
  const [orderId, setOrderId] = useState("");
  const [orderLookupToken, setOrderLookupToken] = useState("");
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);

  // Load cart from server (DB) — adapts API shape {items:[{productId,priceCents,quantity,...}]}
  // to legacy CartItem shape {product:{...,price}, qty}.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/cart", { credentials: "include", cache: "no-store" });
        if (!r.ok) throw new Error("cart_fetch_failed");
        const data = await r.json();
        const items: Array<any> = Array.isArray(data?.items) ? data.items : [];
        if (cancelled) return;
        if (items.length === 0) {
          setError(t("errCosGol"));
        } else {
          const mapped: CartItem[] = items.map((it) => ({
            product: {
              id: String(it.productId),
              productId: String(it.productId),
              skuId: it.variantId || undefined,
              title: it.title,
              price: Number(it.priceCents || 0) / 100,
              image: it.image || undefined,
              images: it.image ? [it.image] : undefined,
            } as any,
            qty: Math.max(1, Math.min(10, Number(it.quantity) || 1)),
          }));
          setCartItems(mapped);
        }
      } catch {
        if (!cancelled) setError(t("errIncarcareCos"));
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.qty, 0
  );

  // Create Payment Intent when cart is loaded
  const createPaymentIntent = useCallback(async () => {
    if (cartItems.length === 0 || clientSecret) return;
    setIsCreatingIntent(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: cartItems.map((item) => ({
            productId: item.product.id || item.product.productId || item.product.pgId,
            skuId: item.product.skuId || undefined,
            videoId: item.product.videoId || undefined,
            quantity: item.qty,
          })),
        }),
      });
      const data = await res.json();
      if (data.success && data.clientSecret) {
        setClientSecret(data.clientSecret);
        setTotalRon(data.totalRon);
        setOrderId(data.orderId);
        setOrderLookupToken(data.orderLookupToken);
      } else {
        setError(data.error || t("errInitiereCheckout"));
      }
    } catch {
      setError(t("errRetea"));
    } finally {
      setIsCreatingIntent(false);
    }
  }, [cartItems, clientSecret, t]);

  useEffect(() => {
    if (cartItems.length > 0 && !clientSecret) {
      createPaymentIntent();
    }
  }, [cartItems, clientSecret, createPaymentIntent]);

  const removeItem = async (index: number) => {
    const updated = cartItems.filter((_, i) => i !== index);
    setCartItems(updated);
    if (updated.length === 0) setError(t("cosGolScurt"));
    setClientSecret(null);
    // Server: PATCH the matching cart item id by re-reading /api/cart, then DELETE.
    try {
      const r = await fetch("/api/cart", { credentials: "include", cache: "no-store" });
      const data = await r.json();
      const items: any[] = Array.isArray(data?.items) ? data.items : [];
      const target = items[index];
      if (target?.id) {
        await fetch(`/api/cart/items/${target.id}`, { method: "DELETE", credentials: "include" });
      }
    } catch {}
  };

  const updateQuantity = async (index: number, newQty: number) => {
    if (newQty < 1 || newQty > 10) return;
    const updated = cartItems.map((item, i) =>
      i === index ? { ...item, qty: newQty } : item
    );
    setCartItems(updated);
    setClientSecret(null);
    try {
      const r = await fetch("/api/cart", { credentials: "include", cache: "no-store" });
      const data = await r.json();
      const items: any[] = Array.isArray(data?.items) ? data.items : [];
      const target = items[index];
      if (target?.id) {
        await fetch(`/api/cart/items/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ quantity: newQty }),
        });
      }
    } catch {}
  };

  if (isInitializing) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#E5E5E5] border-t-[#10A37F] rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm font-medium text-[#6E6E80]">{t("seIncarcaCheckoutulSecurizat")}</p>
        </div>
      </div>
    );
  }

  if (error && cartItems.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="text-xl font-black text-[#0D0D0D] mb-2">{t("cosGol")}</h2>
          <p className="text-sm text-[#6E6E80] mb-6">{error}</p>
          <Link href="/" className="inline-block rounded-xl bg-[#0D0D0D] px-6 py-3 text-sm font-bold text-white transition-transform active:scale-[0.98]">
            {t("inapoiLaMagazin")}
          </Link>
        </div>
      </div>
    );
  }

  const elementsOptions: StripeElementsOptions = clientSecret
    ? {
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#10A37F",
            colorBackground: "#ffffff",
            colorText: "#0D0D0D",
            colorDanger: "#EF4444",
            fontFamily: "'Inter', system-ui, sans-serif",
            spacingUnit: "4px",
            borderRadius: "12px",
          },
          rules: {
            ".Input": {
              border: "1px solid #E5E5E5",
              boxShadow: "none",
              padding: "12px 16px",
            },
            ".Input:focus": {
              border: "1px solid #10A37F",
              boxShadow: "0 0 0 1px #10A37F",
            },
            ".Label": {
              fontWeight: "600",
              fontSize: "13px",
              marginBottom: "6px",
            },
          },
        },
        locale: (["de", "en", "es", "fr", "it", "pt", "ro"].includes(locale) ? locale : "auto") as StripeElementsOptions["locale"],
      }
    : {};

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 mobile-page-bottom">
      {/* Header */}
      <div className="mb-8 border-b border-[#E5E5E5] pb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black">Swypik Checkout</h1>
          <div className="flex items-center gap-1.5 text-xs text-[#6E6E80]">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {t("checkoutSecurizat")}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        {/* Left Col — Cart + Payment Form */}
        <div className="flex-1 space-y-6">
          {/* Cart Items Summary */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#0D0D0D]">
              {t("produseleTaleCount", { count: cartItems.reduce((s, i) => s + i.qty, 0) })}
            </h2>
            <div className="space-y-3">
              {cartItems.map((item, idx) => (
                <div key={idx} className="flex gap-4 p-4 rounded-xl border border-[#E5E5E5] bg-white hover:border-[#10A37F]/30 transition-colors">
                  <div className="h-16 w-16 bg-[#F7F7F8] rounded-lg border border-[#E5E5E5] overflow-hidden shrink-0">
                    <CheckoutProductImage
                      item={item}
                      fallbackAlt={t("produsFallback")}
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                      placeholderClassName="text-lg"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#0D0D0D] line-clamp-1 leading-tight">{item.product.title}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center border border-[#E5E5E5] rounded-lg overflow-hidden">
                        <button onClick={() => updateQuantity(idx, item.qty - 1)} disabled={item.qty <= 1} className="w-7 h-7 flex items-center justify-center text-[#6E6E80] hover:bg-[#F7F7F8] disabled:opacity-30 transition text-xs">−</button>
                        <span className="w-7 h-7 flex items-center justify-center text-xs font-bold text-[#0D0D0D] border-x border-[#E5E5E5]">{item.qty}</span>
                        <button onClick={() => updateQuantity(idx, item.qty + 1)} disabled={item.qty >= 10} className="w-7 h-7 flex items-center justify-center text-[#6E6E80] hover:bg-[#F7F7F8] disabled:opacity-30 transition text-xs">+</button>
                      </div>
                      <button onClick={() => removeItem(idx)} className="text-xs text-red-500 hover:text-red-700 font-medium transition">{t("sterge")}</button>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-[#0D0D0D]">{formatPrice(Math.round(item.product.price * item.qty * 100), { sourceCurrency: "RON" })}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Stripe Embedded Payment Form */}
          {clientSecret ? (
            <Elements stripe={stripePromise} options={elementsOptions}>
              <StripePaymentForm totalRon={totalRon} orderId={orderId} orderLookupToken={orderLookupToken} />
            </Elements>
          ) : isCreatingIntent ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-10 h-10 border-3 border-[#E5E5E5] border-t-[#10A37F] rounded-full animate-spin mx-auto" />
                <p className="mt-4 text-sm font-medium text-[#6E6E80]">{t("sePregatesteFormularulDe")}</p>
              </div>
            </div>
          ) : error ? (
            <div className="text-sm font-bold text-red-600 bg-red-50 rounded-lg px-3 py-2.5 text-center">
              ⚠️ {error}
            </div>
          ) : null}
        </div>

        {/* Right Col — Order Summary */}
        <div className="w-full lg:w-[360px]">
          <div className="max-h-[55vh] overflow-y-auto rounded-2xl bg-[#F7F7F8] p-4 border border-[#E5E5E5] sm:p-6 lg:sticky lg:top-8 lg:max-h-none">
            <h2 className="text-lg font-bold mb-6 text-[#0D0D0D]">{t("sumarComanda")}</h2>
            <div className="space-y-3 mb-6 max-h-[30vh] overflow-y-auto pr-2">
              {cartItems.map((item, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="h-12 w-12 bg-white rounded-lg border border-[#E5E5E5] overflow-hidden shrink-0 relative">
                    <CheckoutProductImage
                      item={item}
                      fallbackAlt={t("produsFallback")}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      placeholderClassName="text-sm"
                    />
                    <div className="absolute -top-1.5 -right-1.5 bg-[#6E6E80] text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold">
                      {item.qty}
                    </div>
                  </div>
                  <div className="flex-1 text-xs py-0.5">
                    <p className="font-medium text-[#0D0D0D] line-clamp-2 leading-tight">{item.product.title}</p>
                  </div>
                  <div className="font-bold text-sm text-[#0D0D0D] py-0.5 shrink-0">
                    {formatPrice(Math.round(item.product.price * item.qty * 100), { sourceCurrency: "RON" })}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-[#E5E5E5] pt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#6E6E80]">{t("subtotal")}</span>
                <span className="font-medium">{formatPrice(Math.round(subtotal * 100), { sourceCurrency: "RON" })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6E6E80]">{t("livrareStandard")}</span>
                <span className="font-bold text-[#10A37F]">{t("gratuit")}</span>
              </div>
              <div className="flex justify-between text-xl font-black pt-3 mt-1 border-t border-[#E5E5E5]">
                <span>{t("total")}</span>
                <span className="text-[#10A37F]">{formatPrice(Math.round(subtotal * 100), { sourceCurrency: "RON" })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
