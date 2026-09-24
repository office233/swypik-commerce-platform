"use client";

/**
 * FRONT R5 — ecranul de câștiguri al curierului (/courier/earnings).
 *
 * Azi / săptămână / lună, lista livrărilor & curselor cu suma per fiecare
 * (din wallet_ledger_entries), soldul disponibil, cerere de retragere și onboarding
 * Stripe Connect pentru payout automat.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

type Bucket = { eats_cents: number; go_cents: number; tips_cents: number; net_cents: number };
type Entry = {
    id: string;
    kind: "credit" | "debit";
    amount_cents: number;
    ref_type: string;
    ref_id: string;
    description: string | null;
    created_at: string;
    tip_cents: number | null;
};
type Payout = {
    id: string;
    amount_cents: number;
    status: string;
    requested_at: string;
    resolved_at: string | null;
};
type EarningsData = {
    balance_cents: number;
    periods: Record<"today" | "week" | "month", Bucket>;
    entries: Entry[];
    payouts: Payout[];
    currency: string;
};
type ConnectStatus = { connected: boolean; payouts_enabled: boolean; details_submitted?: boolean };

export default function EarningsClient() {
    const t = useTranslations("courierEarnings");
    const locale = useLocale();
    const fmt = useCallback(
        (cents: number, currency: string = "RON") => {
            try {
                return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
            } catch {
                return `${(cents / 100).toLocaleString(locale)} ${currency}`;
            }
        },
        [locale],
    );
    const REF_LABEL: Record<string, string> = {
        ride: t("refRide"),
        order: t("refOrder"),
        payout: t("refPayout"),
        payout_refund: t("refPayoutRefund"),
    };
    const STATUS_LABEL: Record<string, string> = {
        pending: t("statusPending"),
        processing: t("statusProcessing"),
        paid: t("statusPaid"),
        failed: t("statusFailed"),
        rejected: t("statusRejected"),
    };
    const [data, setData] = useState<EarningsData | null>(null);
    const [connect, setConnect] = useState<ConnectStatus | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [amount, setAmount] = useState("");
    const [msg, setMsg] = useState("");

    const load = useCallback(async () => {
        try {
            const [eRes, cRes] = await Promise.all([
                fetch("/api/couriers/earnings"),
                fetch("/api/couriers/connect"),
            ]);
            if (!eRes.ok) {
                const j = await eRes.json().catch(() => null);
                setError(j?.error ?? t("loadDataError"));
                return;
            }
            setData(await eRes.json());
            if (cRes.ok) setConnect(await cRes.json());
        } catch {
            setError(t("networkError"));
        }
    }, [t]);

    useEffect(() => {
        void load();
    }, [load]);

    const requestPayout = async () => {
        setMsg("");
        setError("");
        const cents = Math.round(Number(amount.replace(",", ".")) * 100);
        if (!Number.isFinite(cents) || cents <= 0) {
            setError(t("invalidAmount"));
            return;
        }
        setBusy(true);
        try {
            const res = await fetch("/api/couriers/payouts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount_cents: cents }),
            });
            const j = await res.json().catch(() => null);
            if (!res.ok) {
                setError(j?.error ?? t("payoutRequestFailed"));
            } else {
                setMsg(t("payoutRequestRegistered"));
                setAmount("");
                await load();
            }
        } finally {
            setBusy(false);
        }
    };

    const startOnboarding = async () => {
        setBusy(true);
        setError("");
        try {
            const res = await fetch("/api/couriers/connect", { method: "POST" });
            const j = await res.json().catch(() => null);
            if (res.ok && j?.url) window.location.href = j.url;
            else setError(j?.error ?? t("onboardingUnavailable"));
        } finally {
            setBusy(false);
        }
    };

    if (error && !data) {
        return <main className="mx-auto max-w-md p-6 text-red-600">{error}</main>;
    }
    if (!data) {
        return <main className="mx-auto max-w-md p-6 text-gray-500">{t("loading")}</main>;
    }

    const negative = data.balance_cents < 0;

    return (
        <main className="mx-auto max-w-md space-y-6 p-4 pb-24">
            <header className="flex items-center justify-between">
                <h1 className="text-xl font-bold">{t("title")}</h1>
                <a href="/courier" className="text-sm text-blue-600 underline">
                    ← {t("courierPwaLink")}
                </a>
            </header>

            {/* Sold */}
            <section className="rounded-2xl bg-gray-900 p-5 text-white">
                <p className="text-sm opacity-70">{t("availableBalance")}</p>
                <p className={`text-3xl font-bold ${negative ? "text-red-400" : ""}`}>
                    {fmt(data.balance_cents, data.currency)}
                </p>
                {negative && (
                    <p className="mt-1 text-xs text-red-300">
                        {t("negativeBalanceNote")}
                    </p>
                )}
            </section>

            {/* Perioade */}
            <section className="grid grid-cols-3 gap-2">
                {(["today", "week", "month"] as const).map((p) => (
                    <div key={p} className="rounded-xl border p-3 text-center">
                        <p className="text-xs text-gray-500">
                            {p === "today" ? t("periodToday") : p === "week" ? t("periodWeek") : t("periodMonth")}
                        </p>
                        <p className="font-semibold">{fmt(data.periods[p]?.net_cents ?? 0, data.currency)}</p>
                        <p className="text-[10px] text-gray-400">
                            Eats {fmt(data.periods[p]?.eats_cents ?? 0, data.currency)} · Go {fmt(data.periods[p]?.go_cents ?? 0, data.currency)}
                        </p>
                    </div>
                ))}
            </section>

            {/* Stripe Connect */}
            <section className="rounded-xl border p-4">
                <h2 className="mb-2 font-semibold">{t("autoPayTitle")}</h2>
                {connect?.payouts_enabled ? (
                    <p className="flex items-center gap-1.5 text-sm text-green-600"><CheckCircle2 size={16} /> {t("stripeActive")}</p>
                ) : connect?.connected ? (
                    <div className="space-y-2">
                        <p className="text-sm text-amber-600">{t("stripeIncomplete")}</p>
                        <button onClick={startOnboarding} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                            {t("continueVerification")}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-sm text-gray-500">
                            {t("connectStripeNote")}
                        </p>
                        <button onClick={startOnboarding} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                            {t("configurePayments")}
                        </button>
                    </div>
                )}
            </section>

            {/* Retragere */}
            <section className="rounded-xl border p-4">
                <h2 className="mb-2 font-semibold">{t("withdrawal")}</h2>
                <div className="flex gap-2">
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder={t("amountMinPlaceholder")}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="flex-1 rounded-lg border px-3 py-2 text-sm"
                    />
                    <button
                        onClick={requestPayout}
                        disabled={busy || data.balance_cents < 5000}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                        {t("withdrawBtn")}
                    </button>
                </div>
                {msg && <p className="mt-2 text-sm text-green-600">{msg}</p>}
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                {data.payouts.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm">
                        {data.payouts.map((p) => (
                            <li key={p.id} className="flex justify-between border-t pt-1">
                                <span>{new Date(p.requested_at).toLocaleDateString(locale)}</span>
                                <span>{fmt(p.amount_cents, data.currency)}</span>
                                <span className="text-gray-500">{STATUS_LABEL[p.status] ?? p.status}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Istoric livrări & curse */}
            <section className="rounded-xl border p-4">
                <h2 className="mb-2 font-semibold">{t("lastTransactions")}</h2>
                {data.entries.length === 0 ? (
                    <p className="text-sm text-gray-500">{t("emptyTransactions")}</p>
                ) : (
                    <ul className="space-y-1 text-sm">
                        {data.entries.map((e) => (
                            <li key={e.id} className="flex items-center justify-between border-t py-1">
                                <div>
                                    <p>{REF_LABEL[e.ref_type] ?? e.ref_type} <span className="text-gray-400">#{e.ref_id.slice(0, 8)}</span></p>
                                    <p className="text-[10px] text-gray-400">
                                        {new Date(e.created_at).toLocaleString(locale)}
                                        {e.tip_cents ? ` · ${t("tipLabel")} ${fmt(Number(e.tip_cents), data.currency)}` : ""}
                                    </p>
                                </div>
                                <span className={e.kind === "credit" ? "font-medium text-green-600" : "font-medium text-red-600"}>
                                    {e.kind === "credit" ? "+" : "−"}{fmt(e.amount_cents, data.currency)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}
