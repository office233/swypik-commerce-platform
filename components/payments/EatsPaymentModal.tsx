"use client";

/**
 * FRONT R5 — plata cu cardul a unei comenzi Eats (Stripe Payment Element).
 *
 * Primește client_secret-ul PaymentIntent-ului creat server-side la plasarea
 * comenzii (POST /api/local-orders cu payment_method='card_online') și
 * confirmă plata fără redirect (redirect: "if_required" — 3DS deschide
 * automat modalul Stripe când e nevoie).
 *
 * Confirmarea "oficială" a plății vine prin webhook (payment_intent.succeeded)
 * — UI-ul doar raportează rezultatul imediat.
 */
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

function PayForm({
    amountCents,
    onSuccess,
    onCancel,
}: {
    amountCents: number;
    onSuccess: () => void;
    onCancel: () => void;
}) {
    const stripe = useStripe();
    const elements = useElements();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        setError("");
        const { error: err, paymentIntent } = await stripe.confirmPayment({
            elements,
            redirect: "if_required",
        });
        setBusy(false);
        if (err) {
            setError(err.message ?? "Plata a eșuat.");
            return;
        }
        if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
            onSuccess();
        } else {
            setError("Plata nu a fost finalizată.");
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <PaymentElement />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="h-12 flex-1 rounded-xl border text-sm font-bold"
                >
                    Renunță
                </button>
                <button
                    type="submit"
                    disabled={!stripe || busy}
                    className="h-12 flex-1 rounded-xl bg-[#2DBE60] text-sm font-bold text-white disabled:opacity-50"
                >
                    {busy ? "Se procesează…" : `Plătește ${(amountCents / 100).toFixed(2)} lei`}
                </button>
            </div>
        </form>
    );
}

export default function EatsPaymentModal({
    clientSecret,
    amountCents,
    onSuccess,
    onCancel,
}: {
    clientSecret: string;
    amountCents: number;
    onSuccess: () => void;
    onCancel: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center">
            <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
                <h2 className="mb-4 text-lg font-black">Plata comenzii</h2>
                <Elements
                    stripe={stripePromise}
                    options={{ clientSecret, appearance: { theme: "stripe" } }}
                >
                    <PayForm amountCents={amountCents} onSuccess={onSuccess} onCancel={onCancel} />
                </Elements>
            </div>
        </div>
    );
}
