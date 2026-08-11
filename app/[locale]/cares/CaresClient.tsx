"use client";

/**
 * Swypik Cares — pagina publică de donații.
 *
 * 2026-08-11 (audit): până acum API-urile /api/campaigns + /api/donations
 * existau dar NU aveau niciun UI public — donațiile erau imposibil de făcut.
 * Flux: listă campanii verificate → alegi suma → Stripe Payment Element
 * (clientSecret din POST /api/donations) → webhook confirmă plata.
 */
import { useCallback, useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { HeartHandshake, X } from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

type Campaign = {
    id: string;
    title: string;
    slug: string | null;
    goal_cents: number;
    raised_cents: number;
    currency: string;
    image_url: string | null;
    donors_count: number;
    cause_name: string;
    cause_kind: string;
    location_city: string | null;
};

const KIND_LABELS: Record<string, string> = {
    ngo: "ONG",
    family: "Familie",
    small_business: "Afacere mică",
    community: "Comunitate",
    emergency: "Urgență",
};

const PRESET_AMOUNTS = [10, 25, 50, 100];

function money(cents: number, currency: string): string {
    return `${(cents / 100).toLocaleString("ro-RO")} ${currency === "RON" ? "lei" : currency}`;
}

function DonateForm({
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
                <button type="button" onClick={onCancel} className="h-12 flex-1 rounded-xl border text-sm font-bold">
                    Renunță
                </button>
                <button
                    type="submit"
                    disabled={!stripe || busy}
                    className="h-12 flex-1 rounded-xl bg-[#E0245E] text-sm font-bold text-white disabled:opacity-50"
                >
                    {busy ? "Se procesează…" : `Donează ${(amountCents / 100).toFixed(0)} lei`}
                </button>
            </div>
        </form>
    );
}

function DonateModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
    const [amount, setAmount] = useState<number>(25);
    const [customAmount, setCustomAmount] = useState("");
    const [donorName, setDonorName] = useState("");
    const [anonymous, setAnonymous] = useState(false);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [pendingNote, setPendingNote] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const effectiveAmount = customAmount ? Number(customAmount.replace(",", ".")) : amount;

    const start = async () => {
        if (!Number.isFinite(effectiveAmount) || effectiveAmount < 5 || effectiveAmount > 50000) {
            setError("Suma trebuie să fie între 5 și 50.000 lei.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const res = await fetch("/api/donations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    campaign_id: campaign.id,
                    amount: effectiveAmount,
                    donor_name: anonymous ? undefined : donorName || undefined,
                    is_anonymous: anonymous,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                setError(json.error || "Nu am putut inițializa donația.");
                return;
            }
            if (json.payment?.clientSecret) {
                setClientSecret(json.payment.clientSecret);
            } else {
                // Stripe indisponibil — donația e înregistrată ca pending.
                setPendingNote(json.payment?.note || "Donația a fost înregistrată.");
            }
        } catch {
            setError("Eroare de rețea. Încearcă din nou.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center" role="dialog" aria-modal="true">
            <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl max-h-[90vh] overflow-y-auto">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-black">Donează — {campaign.title}</h2>
                    <button onClick={onClose} aria-label="Închide" className="rounded-lg p-1 hover:bg-gray-100">
                        <X size={18} />
                    </button>
                </div>

                {done ? (
                    <div className="py-8 text-center">
                        <HeartHandshake size={40} className="mx-auto mb-3 text-[#E0245E]" />
                        <p className="font-bold">Mulțumim pentru donație! 💛</p>
                        <p className="mt-1 text-sm text-gray-500">
                            Donația apare la campanie după confirmarea plății.
                        </p>
                        <button onClick={onClose} className="mt-4 h-11 w-full rounded-xl bg-[#0D0D0D] text-sm font-bold text-white">
                            Închide
                        </button>
                    </div>
                ) : pendingNote ? (
                    <div className="py-8 text-center">
                        <p className="font-bold">{pendingNote}</p>
                        <button onClick={onClose} className="mt-4 h-11 w-full rounded-xl bg-[#0D0D0D] text-sm font-bold text-white">
                            Închide
                        </button>
                    </div>
                ) : clientSecret ? (
                    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
                        <DonateForm
                            amountCents={Math.round(effectiveAmount * 100)}
                            onSuccess={() => setDone(true)}
                            onCancel={onClose}
                        />
                    </Elements>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-4 gap-2">
                            {PRESET_AMOUNTS.map((a) => (
                                <button
                                    key={a}
                                    onClick={() => { setAmount(a); setCustomAmount(""); }}
                                    className={`h-11 rounded-xl border text-sm font-bold ${amount === a && !customAmount ? "border-[#E0245E] bg-[#E0245E]/10 text-[#E0245E]" : "border-gray-200"}`}
                                >
                                    {a} lei
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            placeholder="Altă sumă (lei)"
                            className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
                        />
                        {!anonymous && (
                            <input
                                type="text"
                                value={donorName}
                                onChange={(e) => setDonorName(e.target.value)}
                                placeholder="Numele tău (opțional, apare public)"
                                maxLength={80}
                                className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
                            />
                        )}
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                            Donez anonim
                        </label>
                        {error && <p className="text-sm text-red-600">{error}</p>}
                        <button
                            onClick={start}
                            disabled={busy}
                            className="h-12 w-full rounded-xl bg-[#E0245E] text-sm font-bold text-white disabled:opacity-50"
                        >
                            {busy ? "Se pregătește…" : "Continuă spre plată"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CaresClient() {
    const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
    const [selected, setSelected] = useState<Campaign | null>(null);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/campaigns");
            const json = await res.json();
            setCampaigns(json.campaigns ?? []);
        } catch {
            setError("Nu am putut încărca campaniile.");
            setCampaigns([]);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <main className="mx-auto max-w-5xl px-4 py-8">
            <div className="mb-8 text-center">
                <HeartHandshake size={40} className="mx-auto mb-3 text-[#E0245E]" />
                <h1 className="text-2xl font-black sm:text-3xl">Swypik Cares</h1>
                <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">
                    Donații transparente pentru cauze locale verificate. Fiecare leu e urmărit
                    public — vezi exact unde ajung banii.
                </p>
            </div>

            {error && <p className="text-center text-sm text-red-600">{error}</p>}
            {campaigns === null ? (
                <p className="py-16 text-center text-sm text-gray-400">Se încarcă…</p>
            ) : campaigns.length === 0 ? (
                <p className="py-16 text-center text-sm text-gray-400">
                    Nicio campanie activă momentan. Revino curând!
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {campaigns.map((c) => {
                        const pct = c.goal_cents > 0 ? Math.min(100, Math.round((c.raised_cents / c.goal_cents) * 100)) : 0;
                        return (
                            <div key={c.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                                {c.image_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={c.image_url} alt="" className="h-40 w-full object-cover" />
                                )}
                                <div className="p-4">
                                    <div className="mb-1 flex items-center gap-2 text-[11px] font-bold text-gray-400">
                                        <span>{KIND_LABELS[c.cause_kind] ?? c.cause_kind}</span>
                                        {c.location_city && <span>· {c.location_city}</span>}
                                    </div>
                                    <h2 className="font-black">{c.title}</h2>
                                    <p className="mt-0.5 text-xs text-gray-500">{c.cause_name}</p>
                                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                                        <div className="h-full rounded-full bg-[#E0245E]" style={{ width: `${pct}%` }} />
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-xs">
                                        <span className="font-bold">{money(c.raised_cents, c.currency)}</span>
                                        <span className="text-gray-400">din {money(c.goal_cents, c.currency)} · {c.donors_count} donatori</span>
                                    </div>
                                    <button
                                        onClick={() => setSelected(c)}
                                        className="mt-3 h-11 w-full rounded-xl bg-[#E0245E] text-sm font-bold text-white"
                                    >
                                        Donează
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {selected && <DonateModal campaign={selected} onClose={() => { setSelected(null); void load(); }} />}
        </main>
    );
}
