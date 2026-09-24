"use client";

/**
 * Calendar disponibilitate — gazda atinge zilele pe care vrea să le blocheze.
 * Zilele cu rezervări plătite sunt afișate ocupate și nu pot fi selectate.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Lock, Unlock, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

function ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
}

// Data curentă a gazdei în fusul ei orar local (nu UTC) — folosită doar ca
// reper pentru "trecut/viitor", nu pentru construcția grilei calendarului.
function localYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function monthGrid(year: number, month: number): (Date | null)[] {
    const first = new Date(Date.UTC(year, month, 1));
    const start = (first.getUTCDay() + 6) % 7; // luni = 0
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cells: (Date | null)[] = Array(start).fill(null);
    for (let i = 1; i <= days; i++) cells.push(new Date(Date.UTC(year, month, i)));
    return cells;
}

export default function AvailabilityCalendar({
    listingId,
    onClose,
}: {
    listingId: string;
    onClose: () => void;
}) {
    const ts = useTranslations("stays");
    const locale = useLocale();
    const today = new Date();
    const DAYS = [
        ts("weekdayMon"), ts("weekdayTue"), ts("weekdayWed"), ts("weekdayThu"),
        ts("weekdayFri"), ts("weekdaySat"), ts("weekdaySun"),
    ];
    // Cursorul de lună pornește de la ziua locală a gazdei, nu de la
    // echivalentul UTC (care poate cădea în luna anterioară/următoare aproape
    // de miezul nopții pentru fusuri orare la est de UTC).
    const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
    const [blocked, setBlocked] = useState<Set<string>>(new Set());
    const [bookedDays, setBookedDays] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const from = ymd(new Date(Date.UTC(cursor.y, cursor.m, 1)));
            const to = ymd(new Date(Date.UTC(cursor.y, cursor.m + 1, 0)));
            const r = await fetch(`/api/host/listings/${listingId}/availability?from=${from}&to=${to}`, { credentials: "include" });
            if (!r.ok) {
                if (mountedRef.current) setError(ts("loadFailed"));
                return;
            }
            const j = await r.json();
            if (!mountedRef.current) return;
            setBlocked(new Set<string>(j.blockedDays ?? []));
            const bd = new Set<string>();
            for (const range of j.bookedRanges ?? []) {
                const s = new Date(range.check_in), e = new Date(range.check_out);
                for (let d = new Date(s); d < e; d.setUTCDate(d.getUTCDate() + 1)) bd.add(ymd(d));
            }
            setBookedDays(bd);
            setSelected(new Set());
            setError(null);
        } catch {
            if (mountedRef.current) setError(ts("loadFailed"));
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [listingId, cursor, ts]);

    useEffect(() => { load(); }, [load]);

    async function apply(available: boolean) {
        if (!selected.size) return;
        setSaving(true);
        setError(null);
        try {
            const r = await fetch(`/api/host/listings/${listingId}/availability`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dates: [...selected], available }),
            });
            const j = await r.json().catch(() => ({}));
            if (!mountedRef.current) return;
            if (!r.ok) { setError(j.error ?? ts("saveFailed")); return; }
            await load();
        } finally {
            if (mountedRef.current) setSaving(false);
        }
    }

    const cells = monthGrid(cursor.y, cursor.m);
    const monthName = new Date(Date.UTC(cursor.y, cursor.m, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
    const todayStr = localYmd(today);

    return (
        <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-bold">{ts("availabilityTitle")}</h4>
                <button onClick={onClose} aria-label={ts("closeCalendar")} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <X size={16} />
                </button>
            </div>

            <div className="mb-2 flex items-center justify-between">
                <button
                    onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))}
                    aria-label={ts("prevMonth")}
                    className="rounded-lg px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >‹</button>
                <span className="text-sm font-semibold capitalize">{monthName}</span>
                <button
                    onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))}
                    aria-label={ts("nextMonth")}
                    className="rounded-lg px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >›</button>
            </div>

            {loading ? (
                <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-neutral-400" size={20} /></div>
            ) : (
                <>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-neutral-400">
                        {DAYS.map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                    <div className="mt-1 grid grid-cols-7 gap-1">
                        {cells.map((d, i) => {
                            if (!d) return <div key={i} />;
                            const s = ymd(d);
                            const isPast = s < todayStr;
                            const isBooked = bookedDays.has(s);
                            const isBlocked = blocked.has(s);
                            const isSel = selected.has(s);
                            const disabled = isPast || isBooked;
                            const statusLabel = isBooked ? ts("dayBooked") : isBlocked ? ts("dayBlocked") : isSel ? ts("daySelected") : ts("dayFree");
                            return (
                                <button
                                    key={s}
                                    disabled={disabled}
                                    aria-label={`${d.getUTCDate()} ${monthName} — ${statusLabel}`}
                                    onClick={() => setSelected((prev) => {
                                        const n = new Set(prev);
                                        if (n.has(s)) n.delete(s); else n.add(s);
                                        return n;
                                    })}
                                    className={`aspect-square min-h-10 rounded-lg text-xs font-semibold transition ${isBooked ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                                        : isPast ? "text-neutral-300 dark:text-neutral-700"
                                            : isSel ? "bg-emerald-600 text-white"
                                                : isBlocked ? "bg-red-100 text-red-700 line-through dark:bg-red-950 dark:text-red-300"
                                                    : "bg-neutral-50 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                                        }`}
                                    title={statusLabel}
                                >
                                    {d.getUTCDate()}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-neutral-500">
                        <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded bg-sky-200" /> {ts("dayBooked")}</span>
                        <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded bg-red-200" /> {ts("dayBlocked")}</span>
                        <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded bg-emerald-600" /> {ts("daySelected")}</span>
                    </div>

                    {error && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

                    {selected.size > 0 && (
                        <div className="mt-3 flex gap-2">
                            <button onClick={() => apply(false)} disabled={saving}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} {ts("blockDays", { count: selected.size })}
                            </button>
                            <button onClick={() => apply(true)} disabled={saving}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />} {ts("unblockDays")}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
