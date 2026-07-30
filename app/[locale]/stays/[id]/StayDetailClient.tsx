"use client";

/**
 * Detaliu cazare + rezervare.
 * Fluxul: alegi datele → quote live (preț + disponibilitate) → rezervi
 * (plata din wallet). Prețul e calculat server-side, niciodată din client.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, Users, Loader2, CheckCircle2, AlertTriangle, Wallet, CalendarDays } from "lucide-react";

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

const lei = (c: number) =>
    new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 2 }).format(c / 100);

export default function StayDetailClient({ stay }: { stay: Stay }) {
    const router = useRouter();
    const plus = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

    const [form, setForm] = useState({ checkIn: plus(14), checkOut: plus(16), guests: 2 });
    const [quote, setQuote] = useState<{ available: boolean; reason: string | null; nights: number; totalCents: number } | null>(null);
    const [checking, setChecking] = useState(false);
    const [booking, setBooking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [guest, setGuest] = useState({ name: "", email: "", phone: "" });

    const checkQuote = useCallback(async () => {
        setChecking(true);
        setError(null);
        try {
            const q = new URLSearchParams({
                quote: "1", productId: stay.id, checkIn: form.checkIn,
                checkOut: form.checkOut, guests: String(form.guests),
            });
            const r = await fetch(`/api/stays/quote?${q}`);
            const j = await r.json();
            setQuote(r.ok ? j : null);
            if (!r.ok) setError(j.error ?? "Verificare eșuată");
        } catch {
            setError("Verificare eșuată");
        } finally {
            setChecking(false);
        }
    }, [stay.id, form]);

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
            const j = await r.json();
            if (!r.ok || j.success === false) {
                if (r.status === 401) { router.push(`/auth/login?next=/stays/${stay.id}`); return; }
                setError(j.error ?? "Rezervarea a eșuat.");
                return;
            }
            const bookingId = j.booking?.id ?? j.bookingId;
            // plată din wallet
            const p = await fetch(`/api/stays/bookings/${bookingId}/pay`, { method: "POST", credentials: "include" });
            const pj = await p.json();
            if (!p.ok) {
                setError(pj.code === "insufficient_funds"
                    ? "Fonduri insuficiente în wallet. Alimentează și reia plata din „Rezervările mele”."
                    : (pj.error ?? "Plata a eșuat."));
                setDone(bookingId);
                return;
            }
            setDone(bookingId);
        } catch {
            setError("Rezervarea a eșuat.");
        } finally {
            setBooking(false);
        }
    }

    const inp = "mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800";
    const lbl = "block text-xs font-medium text-neutral-500";

    if (done && !error) {
        return (
            <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <CheckCircle2 size={52} className="mx-auto text-emerald-500" />
                <h1 className="mt-4 text-xl font-bold">Rezervare confirmată!</h1>
                <p className="mt-2 text-sm text-neutral-500">
                    {stay.title} · {form.checkIn} → {form.checkOut}
                </p>
                <Link href="/account" className="mt-6 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white">
                    Vezi rezervările mele
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-lg pb-24">
            {stay.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stay.image_url} alt={stay.title} className="h-56 w-full object-cover" />
            )}
            <div className="px-4 pt-4">
                <h1 className="text-xl font-bold">{stay.title}</h1>
                <p className="mt-0.5 text-sm text-neutral-500">
                    {stay.location_city} · până la {stay.max_guests ?? 2} oaspeți
                </p>
                <p className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {lei(stay.price_cents ?? 0)}<span className="text-sm font-normal text-neutral-500"> / noapte</span>
                </p>
                {stay.description && (
                    <p className="mt-3 whitespace-pre-line text-sm text-neutral-600 dark:text-neutral-400">{stay.description}</p>
                )}

                <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                    <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold">
                        <CalendarDays size={16} /> Alege perioada
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        <label className={lbl}>Check-in
                            <input type="date" min={plus(0)} value={form.checkIn}
                                onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className={inp} />
                        </label>
                        <label className={lbl}>Check-out
                            <input type="date" min={form.checkIn} value={form.checkOut}
                                onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className={inp} />
                        </label>
                    </div>
                    <label className={`${lbl} mt-3`}>Oaspeți
                        <select value={form.guests} onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })} className={inp}>
                            {Array.from({ length: stay.max_guests ?? 2 }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>{n} {n === 1 ? "oaspete" : "oaspeți"}</option>
                            ))}
                        </select>
                    </label>

                    <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm dark:bg-neutral-800">
                        {checking ? (
                            <span className="flex items-center gap-2 text-neutral-500"><Loader2 size={14} className="animate-spin" /> Se verifică...</span>
                        ) : quote?.available ? (
                            <div className="flex items-center justify-between">
                                <span className="text-neutral-600 dark:text-neutral-300">{quote.nights} {quote.nights === 1 ? "noapte" : "nopți"}</span>
                                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{lei(quote.totalCents)}</span>
                            </div>
                        ) : (
                            <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                                <AlertTriangle size={14} /> {quote?.reason ?? "Indisponibil"}
                            </span>
                        )}
                    </div>

                    {quote?.available && (
                        <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                            <label className={lbl}>Nume complet
                                <input required value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} className={inp} placeholder="Ion Popescu" />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className={lbl}>Email
                                    <input required type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} className={inp} />
                                </label>
                                <label className={lbl}>Telefon
                                    <input type="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} className={inp} />
                                </label>
                            </div>
                            <button
                                onClick={book}
                                disabled={booking || !guest.name || !guest.email}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 font-semibold text-white shadow disabled:opacity-40"
                            >
                                {booking ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                                {booking ? "Se procesează..." : `Rezervă și plătește ${lei(quote.totalCents)}`}
                            </button>
                            <p className="text-center text-[11px] text-neutral-400">
                                Plata se face din wallet-ul Swypik. Prețul afișat e final.
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
