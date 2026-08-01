"use client";

/**
 * Formularul de plată Stripe (rulează în interiorul <Elements>).
 * Extras din CheckoutForm.tsx (Faza C — split god components).
 */
import { useEffect, useState } from "react";
import { Link } from "@/lib/i18n/navigation";
import { useTranslations } from "next-intl";
import { PaymentElement, useStripe, useElements, AddressElement } from "@stripe/react-stripe-js";
import { useFormatPrice } from "@/components/i18n/useFormatPrice";

type SavedAddress = {
  id: string;
  label: string | null;
  recipient_name: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postal_code: string;
  country_code: string;
  is_default: boolean;
};

export default function StripePaymentForm({ totalRon, orderId, orderLookupToken }: { totalRon: number; orderId: string; orderLookupToken: string }) {
  const t = useTranslations("checkoutForm");
  const formatPrice = useFormatPrice();
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string>("new");

  useEffect(() => {
    let cancel = false;
    fetch("/api/users/me/addresses", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancel || !data?.addresses) return;
        setSavedAddresses(data.addresses);
        const def = data.addresses.find((a: SavedAddress) => a.is_default) || data.addresses[0];
        if (def) setSelectedAddrId(def.id);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  const selected = savedAddresses.find((a) => a.id === selectedAddrId);
  const addressKey = selectedAddrId || "new";
  const addressDefaults = selected
    ? {
        name: selected.recipient_name,
        phone: selected.phone || undefined,
        address: {
          line1: selected.line1,
          line2: selected.line2 || undefined,
          city: selected.city,
          state: selected.region || undefined,
          postal_code: selected.postal_code,
          country: selected.country_code,
        },
      }
    : { address: { country: "RO" } };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || t("errValidare"));
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
      setError(confirmError.message || t("errPlata"));
      setIsProcessing(false);
    }
    // If successful, user is redirected to return_url
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Shipping Address */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-3 text-[#0D0D0D]">{t("adresaDeLivrare")}</h2>
        {savedAddresses.length > 0 && (
          <div className="mb-3 rounded-xl border border-[#E5E5E5] bg-white p-3">
            <label className="block text-xs font-bold text-[#6E6E80] mb-2 uppercase tracking-wider">
              {t("folosesteOAdresaSalvata")}
            </label>
            <select
              value={selectedAddrId}
              onChange={(e) => setSelectedAddrId(e.target.value)}
              className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#0D0D0D] focus:outline-none focus:border-[#10A37F]"
            >
              {savedAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.is_default ? "* " : ""}
                  {a.label ? `${a.label} — ` : ""}
                  {a.recipient_name}, {a.line1}, {a.city}
                </option>
              ))}
              <option value="new">{t("adaugaAdresaNoua")}</option>
            </select>
            <Link
              href="/account/addresses"
              className="mt-2 inline-block text-[11px] font-medium text-[#10A37F] hover:underline"
            >
              {t("gestioneazaAdresele")}
            </Link>
          </div>
        )}
        <div className="rounded-xl border border-[#E5E5E5] p-4 bg-[#FAFAFA]">
          <AddressElement
            key={addressKey}
            options={{
              mode: "shipping",
              allowedCountries: ["RO", "GB", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "HU", "BG"],
              fields: { phone: "always" },
              defaultValues: addressDefaults,
            }}
          />
        </div>
      </div>

      {/* Payment */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-3 text-[#0D0D0D]">{t("plata")}</h2>
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
          <AlertTriangle size={14} className="inline" /> {error}
        </div>
      )}

      <button
        id="btn-pay"
        type="submit"
        disabled={!stripe || !elements || isProcessing}
        className="w-full rounded-xl bg-[#10A37F] py-4 text-center text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#0E906F] shadow-[0_0_20px_rgba(16,163,127,0.3)]"
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {t("seProceseazaPlata")}
          </span>
        ) : (
          <>{t("plateste")} {formatPrice(Math.round(totalRon * 100), { sourceCurrency: "RON" })}</>
        )}
      </button>

      <div className="mt-3 text-center text-xs text-[#A1A1AA] flex items-center justify-center gap-1.5">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        {t("plataEsteProcesataSecurizat")}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 opacity-60">
        <span className="text-[10px] font-bold text-[#6E6E80] uppercase tracking-wider">{t("acceptam")}</span>
        <CreditCard size={18} />
        <span className="text-[10px] font-bold text-[#0D0D0D]">Visa</span>
        <span className="text-[10px] font-bold text-[#0D0D0D]">Mastercard</span>
      </div>
    </form>
  );
}
