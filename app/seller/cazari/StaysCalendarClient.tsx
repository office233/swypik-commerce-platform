"use client";

/**
 * Panou cazări: calendar de disponibilitate (blochezi/deblochezi zile prin click)
 * + prețuri sezoniere (override pe interval selectat).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

type Stay = {
  id: string;
  title: string;
  currency: string | null;
  vertical_attributes: Record<string, unknown> | null;
};

type DayInfo = {
  day: string;
  is_available: boolean;
  price_cents_override: number | null;
};

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function StaysCalendarClient() {
  const t = useTranslations("sellerStaysCalendar");
  const locale = useLocale();
  const [stays, setStays] = useState<Stay[]>([]);
  const [stayId, setStayId] = useState<string | null>(null);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [days, setDays] = useState<Map<string, DayInfo>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stay = stays.find((s) => s.id === stayId) ?? null;
  const basePriceCents = useMemo(() => {
    const raw = stay?.vertical_attributes?.price_per_night;
    return typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : null;
  }, [stay]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/stays/mine");
      if (res.status === 401) {
        if (!cancelled) setError(t("authRequired"));
        return;
      }
      if (!res.ok) {
        if (!cancelled) setError(t("networkError"));
        return;
      }
      const data = (await res.json()) as { stays?: Stay[] };
      if (!cancelled) {
        const list = data.stays ?? [];
        setStays(list);
        if (list.length > 0) setStayId(list[0].id);
        else setError(t("noStays"));
      }
    })().catch(() => {
      if (!cancelled) setError(t("networkError"));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` provine din useTranslations si e stabil intre randari; includerea lui ar re-rula fetch-ul de fiecare data cand se schimba referinta functiei de traducere (nu se intampla practic), fara niciun beneficiu.
  }, []);

  const monthStart = useMemo(
    () => new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
    [monthDate],
  );
  const monthEnd = useMemo(
    () => new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0),
    [monthDate],
  );

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    [locale],
  );
  const moneyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: stay?.currency ?? "RON" }),
    [locale, stay],
  );
  // Etichete de zi ale săptămânii, Luni-Duminică, în limba curentă — pornim de
  // la un luni de referință fix (2024-01-01) ca formatarea să nu depindă de
  // ziua curentă.
  const weekdayLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return fmt.format(d);
    });
  }, [locale]);

  const loadCalendar = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!stayId) return;
    const res = await fetch(
      `/api/stays/availability?product_id=${stayId}&from=${iso(monthStart)}&to=${iso(monthEnd)}`,
    );
    if (!res.ok || signal?.cancelled) return;
    const data = (await res.json()) as { days?: DayInfo[] };
    if (signal?.cancelled) return;
    const map = new Map<string, DayInfo>();
    for (const d of data.days ?? []) {
      map.set(String(d.day).slice(0, 10), { ...d, day: String(d.day).slice(0, 10) });
    }
    setDays(map);
  }, [stayId, monthStart, monthEnd]);

  useEffect(() => {
    // Fără gardă, o schimbare rapidă de lună (dublu-click pe "→") putea lăsa
    // un răspuns vechi să suprascrie calendarul cu date dintr-o lună greșită.
    const signal = { cancelled: false };
    setSelected(new Set());
    void loadCalendar(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadCalendar]);

  const cells = useMemo(() => {
    const out: (string | null)[] = [];
    // Luni = prima coloană
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= monthEnd.getDate(); d++) {
      out.push(iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), d)));
    }
    return out;
  }, [monthDate, monthStart, monthEnd]);

  function toggleDay(day: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function apply(action: "block" | "unblock" | "price"): Promise<void> {
    if (!stayId || selected.size === 0) return;
    setSaving(true);
    setMsg(null);
    try {
      let payloadDays: { day: string; is_available: boolean; price_cents_override?: number | null }[];
      if (action === "price") {
        const cents = Math.round(Number(price) * 100);
        if (!Number.isFinite(cents) || cents <= 0) {
          setMsg(t("invalidPrice"));
          return;
        }
        payloadDays = [...selected].map((day) => ({
          day,
          is_available: days.get(day)?.is_available ?? true,
          price_cents_override: cents,
        }));
      } else {
        payloadDays = [...selected].map((day) => ({
          day,
          is_available: action === "unblock",
          price_cents_override: days.get(day)?.price_cents_override ?? null,
        }));
      }
      const res = await fetch("/api/stays/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: stayId, days: payloadDays }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (res.ok && data?.success) {
        setMsg(t("calendarUpdated"));
        setSelected(new Set());
        void loadCalendar();
      } else {
        setMsg(data?.error ?? t("saveError"));
      }
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!stay) return <div className="p-8 text-center text-gray-500">{t("loading")}</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t("heading")}</h1>
          <p className="text-sm text-gray-500">
            {t("instructions")}
            {basePriceCents !== null && ` ${t("basePriceNote", { price: moneyFormatter.format(basePriceCents / 100) })}`}
          </p>
        </div>
        {stays.length > 1 && (
          <select className="rounded border px-2 py-1.5 min-h-[40px] text-sm" value={stayId ?? ""}
            onChange={(e) => setStayId(e.target.value)}>
            {stays.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        )}
      </header>

      {msg && <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{msg}</div>}

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <button className="rounded px-3 py-1 min-h-[40px] text-sm hover:bg-gray-100"
            onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}>
            {t("prevMonth")}
          </button>
          <span className="font-semibold capitalize">{monthFormatter.format(monthDate)}</span>
          <button className="rounded px-3 py-1 min-h-[40px] text-sm hover:bg-gray-100"
            onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}>
            {t("nextMonth")}
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500">
          {weekdayLabels.map((w, i) => <div key={`${w}-${i}`} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} />;
            const info = days.get(day);
            const blocked = info ? !info.is_available : false;
            const hasPrice = info?.price_cents_override != null;
            const isSel = selected.has(day);
            return (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`flex min-h-14 flex-col items-center justify-center rounded border text-sm transition ${isSel
                    ? "border-blue-600 bg-blue-100"
                    : blocked
                      ? "border-red-200 bg-red-50 text-red-500"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
              >
                <span className={blocked ? "line-through" : ""}>{Number(day.slice(8, 10))}</span>
                {hasPrice && info && (
                  <span className="text-[10px] text-emerald-600">
                    {moneyFormatter.format((info.price_cents_override ?? 0) / 100)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <span className="text-sm text-gray-600">{t("daysSelected", { count: selected.size })}</span>
        <button
          onClick={() => void apply("block")}
          disabled={saving || selected.size === 0}
          className="rounded bg-red-600 px-4 py-2 min-h-[40px] text-sm font-medium text-white disabled:opacity-40"
        >
          {t("block")}
        </button>
        <button
          onClick={() => void apply("unblock")}
          disabled={saving || selected.size === 0}
          className="rounded bg-green-600 px-4 py-2 min-h-[40px] text-sm font-medium text-white disabled:opacity-40"
        >
          {t("unblock")}
        </button>
        <div className="flex items-center gap-2">
          <input
            className="w-32 rounded border px-3 py-2 min-h-[40px] text-sm"
            placeholder={t("pricePerNight")}
            aria-label={t("pricePerNight")}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button
            onClick={() => void apply("price")}
            disabled={saving || selected.size === 0}
            className="rounded bg-emerald-600 px-4 py-2 min-h-[40px] text-sm font-medium text-white disabled:opacity-40"
          >
            {t("setSeasonalPrice")}
          </button>
        </div>
      </div>
    </div>
  );
}
