"use client";

import { useEffect, useState, useCallback } from "react";
import { loadStripe, StripeElementsOptions } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements, AddressElement } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

type CartItem = {
  product: {
    id?: string;
    pgId?: string;
    productId?: string;
    title: string;
    price: number;
    image?: string;
    images?: string[];
    color?: string;
    selectedColor?: string;
    selectedSize?: string;
    skuId?: string;
    videoId?: string;
  };
  qty: number;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Inner form rendered inside <Elements> provider
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function StripePaymentForm({ totalRon, orderId, orderLookupToken }: { totalRon: number; orderId: string; orderLookupToken: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || "Eroare la validarea datelor.");
      setIsProcessing(false);
      return;
    }

    const returnUrl = `${window.location.origin}/checkout/success?order_id=${orderId}&token=${orderLookupToken}`;

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
    });

    if (confirmError) {
      setError(confirmError.message || "Plata nu a putut fi procesată.");
      setIsProcessing(false);
    }
    // If successful, user is redirected to return_url
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Shipping Address */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-3 text-[#0D0D0D]">📍 Adresa de livrare</h2>
        <div className="rounded-xl border border-[#E5E5E5] p-4 bg-[#FAFAFA]">
          <AddressElement
            options={{
              mode: "shipping",
              allowedCountries: ["RO", "GB", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "HU", "BG"],
              fields: { phone: "always" },
              defaultValues: {
                address: { country: "RO" },
              },
            }}
          />
        </div>
      </div>

      {/* Payment */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-3 text-[#0D0D0D]">💳 Plata</h2>
        <div className="rounded-xl border border-[#E5E5E5] p-4 bg-[#FAFAFA]">
          <PaymentElement
            options={{
              layout: "tabs",
            }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm font-bold text-red-600 bg-red-50 rounded-lg px-3 py-2.5 text-center">
          ⚠️ {error}
        </div>
      )}

      <button
        id="btn-pay"
        type="submit"
        disabled={!stripe || !elements || isProcessing}
        className="w-full rounded-xl bg-[#0D0D0D] py-4 text-center text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#0E906F] shadow-[0_0_20px_rgba(16,163,127,0.3)]"
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Se procesează plata...
          </span>
        ) : (
          <>🔒 Plătește {totalRon.toFixed(2)} lei</>
        )}
      </button>

      <div className="mt-3 text-center text-xs text-[#A1A1AA] flex items-center justify-center gap-1.5">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Plata este procesată securizat prin Stripe
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 opacity-60">
        <span className="text-[10px] font-bold text-[#6E6E80] uppercase tracking-wider">Acceptăm</span>
        <span className="text-lg">💳</span>
        <span className="text-[10px] font-bold text-[#0D0D0D]">Visa</span>
        <span className="text-[10px] font-bold text-[#0D0D0D]">Mastercard</span>
      </div>
    </form>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Main Checkout Form component
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function CheckoutForm() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [totalRon, setTotalRon] = useState(0);
  const [orderId, setOrderId] = useState("");
  const [orderLookupToken, setOrderLookupToken] = useState("");
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);

  // Load cart from localStorage
  useEffect(() => {
    const savedCart = localStorage.getItem("aicv_cart");
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCartItems(parsed);
        } else {
          setError("Coșul tău este gol.");
        }
      } catch {
        setError("Coșul de cumpărături este invalid.");
      }
    } else {
      setError("Coșul tău este gol. Adaugă produse înainte de a plăti.");
    }
    setIsInitializing(false);
  }, []);

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
        setError(data.error || "Nu am putut iniția plata.");
      }
    } catch {
      setError("Eroare de rețea. Verifică conexiunea.");
    } finally {
      setIsCreatingIntent(false);
    }
  }, [cartItems, clientSecret]);

  useEffect(() => {
    if (cartItems.length > 0 && !clientSecret) {
      createPaymentIntent();
    }
  }, [cartItems, clientSecret, createPaymentIntent]);

  const removeItem = (index: number) => {
    const updated = cartItems.filter((_, i) => i !== index);
    setCartItems(updated);
    localStorage.setItem("aicv_cart", JSON.stringify(updated));
    if (updated.length === 0) setError("Coșul tău este gol.");
    // Reset intent when cart changes
    setClientSecret(null);
  };

  const updateQuantity = (index: number, newQty: number) => {
    if (newQty < 1 || newQty > 10) return;
    const updated = cartItems.map((item, i) =>
      i === index ? { ...item, qty: newQty } : item
    );
    setCartItems(updated);
    localStorage.setItem("aicv_cart", JSON.stringify(updated));
    // Reset intent when cart changes
    setClientSecret(null);
  };

  if (isInitializing) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#E5E5E5] border-t-[#0D0D0D] rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm font-medium text-[#6E6E80]">Se încarcă checkout-ul securizat...</p>
        </div>
      </div>
    );
  }

  if (error && cartItems.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="text-xl font-black text-[#0D0D0D] mb-2">Coș gol</h2>
          <p className="text-sm text-[#6E6E80] mb-6">{error}</p>
          <a href="/" className="inline-block rounded-xl bg-[#0D0D0D] px-6 py-3 text-sm font-bold text-white transition-transform active:scale-[0.98]">
            Înapoi la magazin
          </a>
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
            colorPrimary: "#0D0D0D",
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
              border: "1px solid #0D0D0D",
              boxShadow: "0 0 0 1px #0D0D0D",
            },
            ".Label": {
              fontWeight: "600",
              fontSize: "13px",
              marginBottom: "6px",
            },
          },
        },
        locale: "ro",
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
            Checkout securizat
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        {/* Left Col — Cart + Payment Form */}
        <div className="flex-1 space-y-6">
          {/* Cart Items Summary */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-[#0D0D0D]">
              Produsele tale ({cartItems.reduce((s, i) => s + i.qty, 0)})
            </h2>
            <div className="space-y-3">
              {cartItems.map((item, idx) => (
                <div key={idx} className="flex gap-4 p-4 rounded-xl border border-[#E5E5E5] bg-white hover:border-[#0D0D0D]/30 transition-colors">
                  <div className="h-16 w-16 bg-[#F7F7F8] rounded-lg border border-[#E5E5E5] overflow-hidden shrink-0">
                    {(item.product.images?.[0] || item.product.image) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.product.images?.[0] || item.product.image} alt={item.product.title || "Produs"} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg">📦</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#0D0D0D] line-clamp-1 leading-tight">{item.product.title}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center border border-[#E5E5E5] rounded-lg overflow-hidden">
                        <button onClick={() => updateQuantity(idx, item.qty - 1)} disabled={item.qty <= 1} className="w-7 h-7 flex items-center justify-center text-[#6E6E80] hover:bg-[#F7F7F8] disabled:opacity-30 transition text-xs">−</button>
                        <span className="w-7 h-7 flex items-center justify-center text-xs font-bold text-[#0D0D0D] border-x border-[#E5E5E5]">{item.qty}</span>
                        <button onClick={() => updateQuantity(idx, item.qty + 1)} disabled={item.qty >= 10} className="w-7 h-7 flex items-center justify-center text-[#6E6E80] hover:bg-[#F7F7F8] disabled:opacity-30 transition text-xs">+</button>
                      </div>
                      <button onClick={() => removeItem(idx)} className="text-xs text-red-500 hover:text-red-700 font-medium transition">Șterge</button>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-[#0D0D0D]">{(item.product.price * item.qty).toFixed(2)} lei</p>
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
                <div className="w-10 h-10 border-3 border-[#E5E5E5] border-t-[#0D0D0D] rounded-full animate-spin mx-auto" />
                <p className="mt-4 text-sm font-medium text-[#6E6E80]">Se pregătește formularul de plată...</p>
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
            <h2 className="text-lg font-bold mb-6 text-[#0D0D0D]">Sumar comandă</h2>
            <div className="space-y-3 mb-6 max-h-[30vh] overflow-y-auto pr-2">
              {cartItems.map((item, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="h-12 w-12 bg-white rounded-lg border border-[#E5E5E5] overflow-hidden shrink-0 relative">
                    {(item.product.images?.[0] || item.product.image) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.product.images?.[0] || item.product.image} alt={item.product.title || "Produs"} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm">📦</div>
                    )}
                    <div className="absolute -top-1.5 -right-1.5 bg-[#6E6E80] text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold">
                      {item.qty}
                    </div>
                  </div>
                  <div className="flex-1 text-xs py-0.5">
                    <p className="font-medium text-[#0D0D0D] line-clamp-2 leading-tight">{item.product.title}</p>
                  </div>
                  <div className="font-bold text-sm text-[#0D0D0D] py-0.5 shrink-0">
                    {(item.product.price * item.qty).toFixed(2)} lei
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-[#E5E5E5] pt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#6E6E80]">Subtotal</span>
                <span className="font-medium">{subtotal.toFixed(2)} lei</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6E6E80]">Livrare Standard</span>
                <span className="font-bold text-[#0D0D0D]">Gratuit</span>
              </div>
              <div className="flex justify-between text-xl font-black pt-3 mt-1 border-t border-[#E5E5E5]">
                <span>Total</span>
                <span className="text-[#0D0D0D]">{subtotal.toFixed(2)} lei</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
