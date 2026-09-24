"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { haptic } from "@/lib/haptic";
import { useFormatPrice } from "@/components/i18n/useFormatPrice";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

type Target = { episodeId: string } | { season: true };

type Props = {
  slug: string;
  target: Target;
  /** `null` = prețul RON nu a fost încă setat de creator ("preț în curând"). */
  priceCents: number | null;
  label: string;
  onUnlocked: () => void;
};

function ConfirmForm({ onDone, onCancel, amountCents }: { onDone: () => void; onCancel: () => void; amountCents: number }) {
  const t = useTranslations("movies");
  const formatPrice = useFormatPrice();
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || t("error"));
      setBusy(false);
      return;
    }
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (confirmError) {
      setError(confirmError.message || t("error"));
      setBusy(false);
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      onDone();
      return;
    }
    setError(t("error"));
    setBusy(false);
  };

  return (
    <div className="space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wide text-white/60">{t("payWithCard")}</p>
        <button type="button" onClick={onCancel} aria-label={t("close")} className="rounded-full bg-white/10 p-1.5 text-white/70">
          <X size={14} />
        </button>
      </div>
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="text-xs font-semibold text-amber-300">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy || !stripe || !elements}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-black text-black active:scale-95 disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
        {busy ? t("unlocking") : `${t("plateste")} ${formatPrice(amountCents, { sourceCurrency: "RON" })}`}
      </button>
    </div>
  );
}

export default function UnlockButton({ slug, target, priceCents, label, onUnlocked }: Props) {
  const t = useTranslations("movies");
  const router = useRouter();
  const formatPrice = useFormatPrice();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const start = async () => {
    haptic("tap");
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/movies/${slug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(`/auth?next=/movies/${slug}`);
        return;
      }
      if (!res.ok) {
        setNotice(data.error === "price_not_set" ? t("priceComingSoon") : t("error"));
        return;
      }
      if (data.alreadyUnlocked) {
        onUnlocked();
        return;
      }
      setClientSecret(data.clientSecret);
    } catch {
      setNotice(t("error"));
    } finally {
      setBusy(false);
    }
  };

  const onDone = () => {
    setClientSecret(null);
    // Webhook-ul Stripe marchează deblocarea plătită aproape instant; reîncărcăm datele.
    onUnlocked();
  };

  if (clientSecret) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
        <ConfirmForm onDone={onDone} onCancel={() => setClientSecret(null)} amountCents={priceCents ?? 0} />
      </Elements>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={busy || priceCents === null}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-black text-black active:scale-95 disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
        {busy
          ? t("unlocking")
          : priceCents === null
            ? t("priceComingSoon")
            : `${label} · ${formatPrice(priceCents, { sourceCurrency: "RON" })}`}
      </button>
      {notice && <p className="text-center text-xs text-amber-300">{notice}</p>}
    </div>
  );
}
