"use client";

/**
 * Rezervările de cazare ale clientului + anulare cu politica afișată clar
 * ÎNAINTE de confirmare (100% / 50% în funcție de zilele până la check-in).
 */
import { useCallback, useEffect, useState } from "react";
import { BedDouble, Loader2, AlertTriangle, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

type Booking = {
    id: string;
    check_in: string;
    check_out: string;
    guests_count: number;
    total_cents: number;
    status: string;
    payment_status: string;
    title: string;
    image_url: string | null;
    location_city: string | null;
};

const lei = (c: number) =>
    new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 2 }).format(c / 100);

const STATUS: Record<string, { label: string; cls: string }> = {
    pending: { label: "În așteptare", cls: "bg-amber-100 text-amber-800" },
    confirmed: { label: "Confirmată", cls: "bg-green-100 text-green-800" },
    cancelled: { label: "Anulată", cls: "bg-red-100 text-red-700" },
    completed: { label: "Încheiată", cls: "bg-neutral-100 text-neutral-600" },
};

const FREE_CANCEL_DAYS = 5; // sincron cu STAYS_FREE_CANCEL_DAYS (afișaj)

export default function MyStayBookingsClient() {
  const tx = useTranslations("staysMyStayBookings");
    const t = useTranslations("staysBookings");
    const [bookings, setBookings] = useState<Booking[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const r = await fetch("/api/stays/bookings?mine=1", { credentials: "include" });
        if (!r.ok) { setBookings([]); return; }
        const j = await r.json();
        setBookings(j.bookings ?? []);
    }, []);

    useEffect(() => { load(); }, [load]);

    async function cancel(b: Booking) {
        const days = Math.floor((new Date(b.check_in).getTime() - Date.now()) / 86400000);
        const pct = days >= FREE_CANCEL_DAYS ? 100 : 50;
        const msg =
            b.payment_status === "paid"
                ? `Anulezi rezervarea?\n\nPrimești înapoi ${pct}% (${lei(Math.round((b.total_cents * pct) / 100))}) în wallet.` +
                (pct === 50 ? `\n\nAnulare gratuită doar cu cel puțin ${FREE_CANCEL_DAYS} zile înainte de check-in.` : "")
                : "Anulezi rezervarea (neplătită)?";
        if (!confirm(msg)) return;

        setBusy(b.id);
        setError(null);
        try {
            const r = await fetch(`/api/stays/bookings/${b.id}/cancel`, { method: "POST", credentials: "include" });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) { setError(j.error ?? "Anularea a eșuat."); return; }
            await load();
        } finally {
            setBusy(null);
        }
    }

    if (bookings === null) {
        return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="animate-spin text-neutral-400" /></div>;
    }

    return (
        <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
            <header className="mb-5 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600">
                    <BedDouble size={20} className="text-white" />
                </div>
                <h1 className="text-xl font-bold">{t("title")}</h1>
            </header>

            {error && (
                <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
                </div>
            )}

            {bookings.length === 0 && (
                <p className="rounded-xl bg-neutral-50 p-6 text-center text-sm text-neutral-500 dark:bg-neutral-900">
                    {t("empty")} <a href="/stays" className="font-semibold text-emerald-600 underline">{t("findStay")}</a>
                </p>
            )}

            <div className="space-y-3">
                {bookings.map((b) => {
                    const st = STATUS[b.status] ?? { label: b.status, cls: "bg-neutral-100 text-neutral-600" };
                    const cancellable =
                        (b.status === "pending" || b.status === "confirmed") &&
                        new Date(b.check_in) > new Date();
                    return (
                        <div key={b.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                            <div className="flex gap-3 p-3">
                                {b.image_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={b.image_url} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="truncate font-bold">{b.title}</h3>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-neutral-500">
                                        {b.location_city} · {b.check_in} → {b.check_out} · {b.guests_count}  {tx("oaspeti")}
                                    </p>
                                    <p className="mt-1 font-extrabold text-emerald-600 dark:text-emerald-400">{lei(b.total_cents)}</p>
                                    {b.payment_status === "refunded" && (
                                        <p className="text-xs text-neutral-500">{t("refundProcessed")}</p>
                                    )}
                                </div>
                            </div>
                            {cancellable && (
                                <div className="border-t border-neutral-100 p-2 dark:border-neutral-800">
                                    <button
                                        onClick={() => cancel(b)}
                                        disabled={busy !== null}
                                        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950"
                                    >
                                        {busy === b.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                        
                                        {tx("anuleazaRezervarea")}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <p className="mt-6 text-center text-[11px] text-neutral-400">
                
                {tx("anulareGratuitaCuCel")} {FREE_CANCEL_DAYS}  {tx("zileInainteDeCheckin")} {FREE_CANCEL_DAYS} zile: refund 50%
            </p>
        </div>
    );
}
