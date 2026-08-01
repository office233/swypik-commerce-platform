"use client";

/**
 * Panou cazări: calendar de disponibilitate (blochezi/deblochezi zile prin click)
 * + prețuri sezoniere (override pe interval selectat).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

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

const MONTHS_RO = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];
const WEEKDAYS = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function StaysCalendarClient() {
  const t = useTranslations("sellerStaysCalendar");
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
        if (!cancelled) setError("Autentifică-te ca seller pentru a-ți administra cazările.");
        return;
      }
      const data = (await res.json()) as { stays?: Stay[] };
      if (!cancelled) {
        const list = data.stays ?? [];
        setStays(list);
        if (list.length > 0) setStayId(list[0].id);
        else setError("Nu ai nicio cazare (vacation-rentals) publicată.");
      }
    })().catch(() => {
      if (!cancelled) setError("Eroare de rețea.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const monthStart = useMemo(
    () => new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
    [monthDate],
  );
  const monthEnd = useMemo(
    () => new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0),
    [monthDate],
  );

  const loadCalendar = useCallback(async () => {
    if (!stayId) return;
    const res = await fetch(
      `/api/stays/availability?product_id=${stayId}&from=${iso(monthStart)}&to=${iso(monthEnd)}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as { days?: DayInfo[] };
    const map = new Map<string, DayInfo>();
    for (const d of data.days ?? []) {
      map.set(String(d.day).slice(0, 10), { ...d, day: String(d.day).slice(0, 10) });
    }
    setDays(map);
  }, [stayId, monthStart, monthEnd]);

  useEffect(() => {
    setSelected(new Set());
    void loadCalendar();
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
          setMsg("Introdu un preț valid (lei/noapte).");
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
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (res.ok && data.success) {
        setMsg("Calendar actualizat.");
        setSelected(new Set());
        void loadCalendar();
      } else {
        setMsg(data.error ?? "Eroare la salvare.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!stay) return <div className="p-8 text-center text-gray-500">{t("loading")}</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Calendar disponibilitate</h1>
          <p className="text-sm text-gray-500">
            Click pe zile pentru a le selecta, apoi blochează sau setează preț sezonier.
            {basePriceCents !== null && ` Preț de bază: ${(basePriceCents / 100).toFixed(0)} lei/noapte.`}
          </p>
        </div>
        {stays.length > 1 && (
          <select className="rounded border px-2 py-1 text-sm" value={stayId ?? ""}
            onChange={(e) => setStayId(e.target.value)}>
            {stays.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        )}
      </header>

      {msg && <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{msg}</div>}

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <button className="rounded px-3 py-1 text-sm hover:bg-gray-100"
            onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}>
            ← Luna anterioară
          </button>
          <span className="font-semibold">{MONTHS_RO[monthDate.getMonth()]} {monthDate.getFullYear()}</span>
          <button className="rounded px-3 py-1 text-sm hover:bg-gray-100"
            onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}>
            Luna următoare →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500">
          {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
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
                    {((info.price_cents_override ?? 0) / 100).toFixed(0)} lei
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <span className="text-sm text-gray-600">{selected.size} zile selectate</span>
        <button
          onClick={() => void apply("block")}
          disabled={saving || selected.size === 0}
          className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Blochează
        </button>
        <button
          onClick={() => void apply("unblock")}
          disabled={saving || selected.size === 0}
          className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Deblochează
        </button>
        <div className="flex items-center gap-2">
          <input
            className="w-32 rounded border px-3 py-2 text-sm"
            placeholder={t("pricePerNight")}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button
            onClick={() => void apply("price")}
            disabled={saving || selected.size === 0}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Setează preț sezonier
          </button>
        </div>
      </div>
    </div>
  );
}
