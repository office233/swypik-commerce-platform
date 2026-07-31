"use client";

/**
 * Rezervările primite de gazdă — listă cu contact client + anulare.
 * Anularea de către gazdă = refund integral pentru client și retragerea
 * sumei din portofelul gazdei (politica e afișată înainte de confirmare).
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Loader2, Phone, Mail, XCircle, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

type HostBooking = {
    id: string;
    check_in: string;
    check_out: string;
    guests_count: number;
    total_cents: number;
    status: string;
    payment_status: string;
    guest_name: string;
    guest_email: string | null;
    guest_phone: string | null;
    listing_title: string;
    created_at: string;
};

const lei = (c: number) =>
    new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 2 }).format(c / 100);

const STATUS_CLS: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    confirmed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-700",
    completed: "bg-neutral-100 text-neutral-600",
};

export default function HostBookings() {
    const t = useTranslations("hostBookings");
    const [bookings, setBookings] = useState<HostBooking[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const r = await fetch("/api/host/bookings", { credentials: "include" });
        if (!r.ok) { setBookings([]); return; }
        setBookings((await r.json()).bookings ?? []);
    }, []);

    useEffect(() => { load(); }, [load]);

    async function cancel(b: HostBooking) {
        const warn =
            b.payment_status === "paid"
                ? t("cancelWarnPaid", { name: b.guest_name, amount: lei(b.total_cents) })
                : t("cancelWarnUnpaid", { name: b.guest_name });
        if (!confirm(warn)) return;
        setBusy(b.id);
        setError(null);
        try {
            const r = await fetch(`/api/stays/bookings/${b.id}/cancel`, { method: "POST", credentials: "include" });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) { setError(j.error ?? t("cancelFailed")); return; }
            await load();
        } finally {
            setBusy(null);
        }
    }

    if (bookings === null) {
        return <div className="mt-6 grid place-items-center"><Loader2 className="animate-spin text-neutral-400" size={20} /></div>;
    }
    if (bookings.length === 0) return null;

    const upcoming = bookings.filter((b) => b.status !== "cancelled" && b.status !== "completed");
    const past = bookings.filter((b) => b.status === "cancelled" || b.status === "completed");

    return (
        <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-1.5 text-lg font-bold">
                <CalendarCheck size={18} /> {t("title")}
            </h2>

            {error && (
                <div className="mb-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
                </div>
            )}

            <div className="space-y-3">
                {[...upcoming, ...past].map((b) => {
                    const st = {
                        label: STATUS_CLS[b.status] ? t(`status.${b.status}`) : b.status,
                        cls: STATUS_CLS[b.status] ?? "bg-neutral-100 text-neutral-600",
                    };
                    const cancellable = b.status === "pending" || b.status === "confirmed";
                    return (
                        <div key={b.id} className="rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="truncate text-sm font-bold">{b.listing_title}</h3>
                                    <p className="text-xs text-neutral-500">
                                        {b.check_in} → {b.check_out} · {t("guests", { count: b.guests_count })}
                                    </p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-300">
                                <span className="font-semibold">{b.guest_name}</span>
                                {b.guest_phone && (
                                    <a href={`tel:${b.guest_phone}`} className="flex items-center gap-1 text-sky-600">
                                        <Phone size={12} /> {b.guest_phone}
                                    </a>
                                )}
                                {b.guest_email && (
                                    <a href={`mailto:${b.guest_email}`} className="flex items-center gap-1 text-sky-600">
                                        <Mail size={12} /> {b.guest_email}
                                    </a>
                                )}
                            </div>

                            <div className="mt-2 flex items-center justify-between">
                                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                                    {lei(b.total_cents)}
                                    {b.payment_status === "paid" && <span className="ml-1 text-[10px] font-normal text-neutral-400">{t("paid")}</span>}
                                    {b.payment_status === "refunded" && <span className="ml-1 text-[10px] font-normal text-neutral-400">{t("refunded")}</span>}
                                </span>
                                {cancellable && (
                                    <button
                                        onClick={() => cancel(b)}
                                        disabled={busy !== null}
                                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950"
                                    >
                                        {busy === b.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                                        Anulează
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
