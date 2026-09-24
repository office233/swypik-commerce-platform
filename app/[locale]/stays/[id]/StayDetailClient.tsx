"use client";

/**
 * Detaliu cazare + rezervare.
 * Fluxul: alegi datele → quote live (preț + disponibilitate) → rezervi
 * (plata din wallet). Prețul e calculat server-side, niciodată din client.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertTriangle, Wallet, CalendarDays } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

type Stay = {
    id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    price_cents: number | null;
    location_city: string | null;
    max_guests: number | null;
    property_type: string | null;
};

export default function StayDetailClient({ stay }: { stay: Stay }) {
    const tx = useTranslations("staysStayDetail");
    const router = useRouter();
    const t = useTranslations("stayDetail");
    const ts = useTranslations("stays");
    const locale = useLocale();
    const lei = (c: number) =>
        new Intl.NumberFormat(locale, { style: "currency", currency: "RON", maximumFractionDigits: 2 }).format(c / 100);
    const plus = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

    const [form, setForm] = useState({ checkIn: plus(14), checkOut: plus(16), guests: 2 });
    const [quote, setQuote] = useState<{ available: boolean; reason: string | null; nights: number; totalCents: number } | null>(null);
    const [checking, setChecking] = useState(false);
    const [booking, setBooking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const checkQuote = useCallback(async () => {
        setChecking(true);
        setError(null);
        try {
            const q = new URLSearchParams({
                quote: "1", productId: stay.id, checkIn: form.checkIn,
                checkOut: form.checkOut, guests: String(form.guests),
            });
            const r = await fetch(`/api/stays/quote?${q}`);
            const j = await r.json().catch(() => ({}));
            if (!mountedRef.current) return;
            setQuote(r.ok ? j : null);
            if (!r.ok) setError(j.error ?? ts("quoteCheckFailed"));
        } catch {
            if (mountedRef.current) { setQuote(null); setError(ts("quoteCheckFailed")); }
        } finally {
            if (mountedRef.current) setChecking(false);
        }
    }, [stay.id, form, ts]);

    useEffect(() => { checkQuote(); }, [checkQuote]);

    async function book() {
        setError(null);
        setBooking(true);
        try {
            const r = await fetch("/api/stays/bookings", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    product_id: stay.id,
                    check_in: form.checkIn,
                    check_out: form.checkOut,
                    guests_count: form.guests,
                    guest_name: guest.name,
                    guest_email: guest.email,
                    guest_phone: guest.phone || undefined,
                }),
            });
            const j = await r.json().catch(() => ({}));
            if (!mountedRef.current) return;
            if (!r.ok || j.success === false) {
                if (r.status === 401) { router.push(`/auth/login?next=/stays/${stay.id}`); return; }
                setError(j.error ?? ts("bookingFailed"));
                return;
            }
            const bookingId = j.booking?.id ?? j.bookingId;
            // plată din wallet
            const p = await fetch(`/api/stays/bookings/${bookingId}/pay`, { method: "POST", credentials: "include" });
            const pj = await p.json().catch(() => ({}));
            if (!mountedRef.current) return;
            if (!p.ok) {
                setError(pj.code === "insufficient_funds"
                    ? ts("insufficientFunds")
                    : (pj.error ?? ts("paymentFailed")));
                setDone(bookingId);
                return;
            }
            setDone(bookingId);
        } catch {
            if (mountedRef.current) setError(ts("bookingFailed"));
        } finally {
            if (mountedRef.current) setBooking(false);
        }
    }

    const inp = "mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800";
    const lbl = "block text-xs font-medium text-neutral-500";

    if (done && !error) {
        return (
            <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <CheckCircle2 size={52} className="mx-auto text-emerald-500" />
                <h1 className="mt-4 text-xl font-bold">{t("confirmed")}</h1>
                <p className="mt-2 text-sm text-neutral-500">
                    {stay.title} · {form.checkIn} → {form.checkOut}
                </p>
                <Link href="/account" className="mt-6 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white">
                    {tx("veziRezervarileMele")}
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-lg pb-24">
            {stay.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stay.image_url} alt={stay.title} width={800} height={224} className="h-56 w-full object-cover" />
            )}
            <div className="px-4 pt-4">
                <h1 className="text-xl font-bold">{stay.title}</h1>
                <p className="mt-0.5 text-sm text-neutral-500">
                    {stay.location_city} {tx("panaLa")} {stay.max_guests ?? 2} {tx("oaspeti")}
                </p>
                <p className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {lei(stay.price_cents ?? 0)}<span className="text-sm font-normal text-neutral-500"> {ts("perNight")}</span>
                </p>
                {stay.description && (
                    <p className="mt-3 whitespace-pre-line text-sm text-neutral-600 dark:text-neutral-400">{stay.description}</p>
                )}

                <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                    <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold">
                        <CalendarDays size={16} /> {ts("choosePeriod")}
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        <label className={lbl}>{ts("checkInLabel")}
                            <input type="date" min={plus(0)} value={form.checkIn}
                                onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className={inp} />
                        </label>
                        <label className={lbl}>{ts("checkOutLabel")}
                            <input type="date" min={form.checkIn} value={form.checkOut}
                                onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className={inp} />
                        </label>
                    </div>
                    <label className={`${lbl} mt-3`}>{tx("oaspeti2")}
                        <select value={form.guests} onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })} className={inp}>
                            {Array.from({ length: stay.max_guests ?? 2 }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>{ts("guestsCount", { count: n })}</option>
                            ))}
                        </select>
                    </label>

                    <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm dark:bg-neutral-800">
                        {checking ? (
                            <span className="flex items-center gap-2 text-neutral-500"><Loader2 size={14} className="animate-spin" /> {t("checking")}</span>
                        ) : quote?.available ? (
                            <div className="flex items-center justify-between">
                                <span className="text-neutral-600 dark:text-neutral-300">{ts("nightsCount", { count: quote.nights })}</span>
                                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{lei(quote.totalCents)}</span>
                            </div>
                        ) : (
                            <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                                <AlertTriangle size={14} /> {quote?.reason ?? ts("unavailable")}
                            </span>
                        )}
                    </div>

                    {quote?.available && (
                        <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                            <label className={lbl}>{ts("fullNameLabel")}
                                <input required value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} className={inp} placeholder={ts("fullNamePlaceholder")} />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className={lbl}>{ts("emailLabel")}
                                    <input required type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} className={inp} />
                                </label>
                                <label className={lbl}>{ts("phoneLabel")}
                                    <input type="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} className={inp} />
                                </label>
                            </div>
                            <button
                                onClick={book}
                                disabled={booking || !guest.name || !guest.email}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 font-semibold text-white shadow disabled:opacity-40"
                            >
                                {booking ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                                {booking ? ts("processing") : ts("bookAndPay", { price: lei(quote.totalCents) })}
                            </button>
                            <p className="text-center text-[11px] text-neutral-400">
                                {tx("plataSeFaceDin")}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
