"use client";

/**
 * Swypik Stays — căutare cazări. Model identic cu Fly: preț final în RON,
 * marja e internă, zero taxe la checkout. Până la activarea Duffel Stays pe
 * cont, API-ul răspunde stays_not_enabled iar UI-ul afișează starea "curând".
 */
import { useEffect, useRef, useState } from "react";
import { BedDouble, Loader2, MapPin, Star, AlertTriangle, CalendarDays, Users } from "lucide-react";

type City = { slug: string; name: string; country: string };
type StayResult = {
    searchResultId: string;
    name: string;
    stars: number | null;
    photoUrl: string | null;
    address: string | null;
    totalCents: number;
    currency: string;
    nights: number;
};

const lei = (cents: number) =>
    new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 2 }).format(cents / 100);

function CityInput({ value, onPick }: { value: City | null; onPick: (c: City | null) => void }) {
    const [text, setText] = useState(value ? value.name : "");
    const [results, setResults] = useState<City[]>([]);
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const search = async (q: string) => {
        setText(q);
        onPick(null);
        if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
        const r = await fetch(`/api/stays/cities?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        setResults(j.cities ?? []);
        setOpen((j.cities ?? []).length > 0);
    };

    return (
        <div ref={boxRef} className="relative">
            <label className="text-xs font-medium text-neutral-500">
                Destinație
                <input
                    value={text}
                    onChange={(e) => search(e.target.value)}
                    placeholder="ex: Brașov, Roma, Santorini"
                    autoComplete="off"
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
                />
            </label>
            {open && (
                <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                    {results.map((c) => (
                        <li key={c.slug}>
                            <button
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); onPick(c); setText(c.name); setOpen(false); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sky-50 dark:hover:bg-sky-950"
                            >
                                <MapPin size={14} className="shrink-0 text-sky-500" />
                                <span className="font-semibold">{c.name}</span>
                                <span className="text-neutral-500">— {c.country}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default function StaysClient() {
    const today = new Date();
    const plus = (d: number) => new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10);

    const [city, setCity] = useState<City | null>(null);
    const [form, setForm] = useState({ checkIn: plus(14), checkOut: plus(16), adults: 2 });
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<StayResult[] | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const search = async () => {
        if (!city) return;
        setLoading(true);
        setError(null);
        setNotice(null);
        setResults(null);
        try {
            const r = await fetch("/api/stays/search", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ city: city.slug, checkIn: form.checkIn, checkOut: form.checkOut, adults: form.adults }),
            });
            const j = await r.json();
            if (j.error === "stays_not_enabled") {
                setNotice("Rezervările de cazări se lansează în curând pe Swypik. Zborurile sunt deja disponibile în Fly! ✈️");
            } else if (!r.ok) {
                setError(j.error ?? "Căutarea a eșuat");
            } else {
                setResults(j.results ?? []);
            }
        } catch {
            setError("Căutarea a eșuat. Încearcă din nou.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
            <header className="mb-5 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600">
                    <BedDouble size={20} className="text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold">Swypik Stays</h1>
                    <p className="text-xs text-neutral-500">Prețul afișat e prețul final. În lei, fără taxe ascunse la plată.</p>
                </div>
            </header>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <CityInput value={city} onPick={setCity} />
                <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-xs font-medium text-neutral-500">
                        Check-in
                        <input
                            type="date"
                            value={form.checkIn}
                            min={plus(0)}
                            onChange={(e) => setForm({ ...form, checkIn: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
                        />
                    </label>
                    <label className="text-xs font-medium text-neutral-500">
                        Check-out
                        <input
                            type="date"
                            value={form.checkOut}
                            min={form.checkIn}
                            onChange={(e) => setForm({ ...form, checkOut: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
                        />
                    </label>
                </div>
                <label className="mt-3 block text-xs font-medium text-neutral-500">
                    Persoane
                    <select
                        value={form.adults}
                        onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })}
                        className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
                    >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>{n} {n === 1 ? "persoană" : "persoane"}</option>
                        ))}
                    </select>
                </label>
                <button
                    onClick={search}
                    disabled={!city || loading}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 font-semibold text-white shadow disabled:opacity-40"
                >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <BedDouble size={16} />}
                    {loading ? "Se caută..." : "Caută cazări"}
                </button>
            </div>

            {notice && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    <CalendarDays size={16} className="mt-0.5 shrink-0" /> {notice}
                </div>
            )}
            {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
                </div>
            )}

            {results && (
                <div className="mt-5 space-y-3">
                    <p className="text-sm text-neutral-500">
                        {results.length} cazări găsite · totalul include tot, fără costuri ascunse
                    </p>
                    {results.map((s) => (
                        <div key={s.searchResultId} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                            {s.photoUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={s.photoUrl} alt={s.name} className="h-40 w-full object-cover" loading="lazy" />
                            )}
                            <div className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <h3 className="font-bold">{s.name}</h3>
                                        {s.stars !== null && (
                                            <span className="mt-0.5 flex items-center gap-0.5 text-xs text-amber-500">
                                                {Array.from({ length: Math.round(s.stars) }).map((_, i) => <Star key={i} size={12} fill="currentColor" />)}
                                            </span>
                                        )}
                                        {s.address && <p className="mt-0.5 text-xs text-neutral-500">{s.address}</p>}
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{lei(s.totalCents)}</div>
                                        <div className="text-xs text-neutral-500">{s.nights} {s.nights === 1 ? "noapte" : "nopți"} · total</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {results.length === 0 && (
                        <p className="rounded-xl bg-neutral-50 p-4 text-center text-sm text-neutral-500 dark:bg-neutral-900">
                            Nicio cazare găsită pentru datele alese. Încearcă alte date.
                        </p>
                    )}
                </div>
            )}

            {!results && !notice && !loading && (
                <p className="mt-6 text-center text-xs text-neutral-400">
                    <Users size={14} className="mr-1 inline" />
                    Cazări din 1M+ proprietăți, cu plata direct pe Swypik.
                </p>
            )}
        </div>
    );
}
