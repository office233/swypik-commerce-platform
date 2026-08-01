"use client";

/**
 * FRONT R5 — Tab „Câștiguri" în PWA curier.
 *  - sold curent (poate fi negativ = datorie comision cash);
 *  - câștiguri azi/săptămână/lună, defalcate Eats / Go / bacșiș;
 *  - cerere de retragere (min 50 RON) + istoricul cererilor.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { UtensilsCrossed, CarTaxiFront, Gift } from "lucide-react";

type Bucket = { eats_cents: number; go_cents: number; tips_cents: number; net_cents: number };
type Payout = {
  id: string;
  amount_cents: number;
  status: "pending" | "paid" | "rejected";
  requested_at: string;
  resolved_at: string | null;
};
type EarningsData = {
  balance_cents: number;
  periods: { today: Bucket; week: Bucket; month: Bucket };
  payouts: Payout[];
};

const MIN_PAYOUT_CENTS = 5000;
const ron = (c: number) => (c / 100).toFixed(2);

const PERIOD_LABELS: Record<string, string> = { today: "Azi", week: "Săptămâna asta", month: "Luna asta" };
const STATUS_LABELS: Record<string, string> = { pending: "în așteptare", paid: "plătită", rejected: "respinsă" };

export default function EarningsTab() {
  const t = useTranslations("courierEarningsTab");
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [iban, setIban] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/couriers/earnings");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Eroare la încărcare.");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestPayout() {
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < MIN_PAYOUT_CENTS) {
      setMsg(`Suma minimă e ${MIN_PAYOUT_CENTS / 100} RON.`);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/couriers/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: cents, iban: iban || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Cererea a eșuat.");
      setMsg("Cerere trimisă");
      setAmount("");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">{t("loading")}</div>;
  if (error) return <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!data) return null;

  const negative = data.balance_cents < 0;

  return (
    <div className="space-y-4">
      {/* Sold */}
      <div className={`rounded-2xl p-5 text-white shadow-md ${negative ? "bg-red-600" : "bg-emerald-600"}`}>
        <div className="text-sm opacity-80">Sold disponibil</div>
        <div className="text-3xl font-bold">{ron(data.balance_cents)} RON</div>
        {negative && (
          <div className="mt-1 text-xs opacity-90">
            Sold negativ = comision datorat din încasările cash. Se stinge automat din câștigurile viitoare.
          </div>
        )}
      </div>

      {/* Perioade */}
      {(["today", "week", "month"] as const).map((p) => {
        const b = data.periods[p];
        return (
          <div key={p} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{PERIOD_LABELS[p]}</h3>
              <span className={`font-bold ${b.net_cents < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {ron(b.net_cents)} RON
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-gray-500">
              <div className="rounded-lg bg-gray-50 p-2">
                <div className="font-semibold text-gray-800">{ron(b.eats_cents)}</div>
                <span className="inline-flex items-center gap-1"><UtensilsCrossed size={12} /> Eats</span>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <div className="font-semibold text-gray-800">{ron(b.go_cents)}</div>
                <span className="inline-flex items-center gap-1"><CarTaxiFront size={12} /> Go</span>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <div className="font-semibold text-gray-800">{ron(b.tips_cents)}</div>
                <span className="inline-flex items-center gap-1"><Gift size={12} /> {t("tip")}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Retragere */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h3 className="font-semibold">Retrage bani</h3>
        <p className="mt-1 text-xs text-gray-500">Minim {MIN_PAYOUT_CENTS / 100} RON. Se aprobă manual.</p>
        <div className="mt-3 space-y-2">
          <input
            inputMode="decimal"
            placeholder="Suma (RON)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <input
            placeholder={t("ibanPlaceholder")}
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
          />
          <button
            onClick={() => void requestPayout()}
            disabled={busy}
            className="w-full rounded-lg bg-black py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Cere retragere
          </button>
          {msg && <div className="text-center text-xs text-gray-600">{msg}</div>}
        </div>
      </div>

      {/* Istoric payout */}
      {data.payouts.length > 0 && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="font-semibold">Retrageri recente</h3>
          <ul className="mt-2 divide-y text-sm">
            {data.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>{ron(p.amount_cents)} RON</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${p.status === "pending"
                      ? "bg-amber-100 text-amber-700"
                      : p.status === "paid"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                >
                  {STATUS_LABELS[p.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
