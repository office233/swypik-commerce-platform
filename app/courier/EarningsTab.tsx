"use client";

/**
 * FRONT R5 — Tab „Câștiguri" în PWA curier.
 *  - sold curent (poate fi negativ = datorie comision cash);
 *  - câștiguri azi/săptămână/lună, defalcate Eats / Go / bacșiș;
 *  - cerere de retragere (min 50 RON) + istoricul cererilor.
 */
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
  min_payout_cents?: number;
};

// 2026-08-11 (audit): fallback local; valoarea reală vine din API
// (min_payout_cents, sincronizată cu env PAYOUT_MIN_CENTS pe server).
const MIN_PAYOUT_CENTS_FALLBACK = 5000;

export default function EarningsTab() {
  const t = useTranslations("courierEarningsTab");
  const locale = useLocale();
  const ron = useCallback(
    (c: number) => {
      try {
        return new Intl.NumberFormat(locale, { style: "currency", currency: "RON" }).format(c / 100);
      } catch {
        return `${(c / 100).toFixed(2)} RON`;
      }
    },
    [locale],
  );
  const PERIOD_LABELS: Record<string, string> = { today: t("periodToday"), week: t("periodWeek"), month: t("periodMonth") };
  const STATUS_LABELS: Record<string, string> = { pending: t("statusPending"), paid: t("statusPaid"), rejected: t("statusRejected") };
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
      if (!res.ok) throw new Error(json.error || t("loadError"));
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const minPayoutCents = data?.min_payout_cents ?? MIN_PAYOUT_CENTS_FALLBACK;

  async function requestPayout() {
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < minPayoutCents) {
      setMsg(t("minAmountNote", { amount: ron(minPayoutCents) }));
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
      if (!res.ok) throw new Error(json.error || t("requestFailed"));
      setMsg(t("requestSent"));
      setAmount("");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("genericError"));
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
        <div className="text-sm opacity-80">{t("availableBalance")}</div>
        <div className="text-3xl font-bold">{ron(data.balance_cents)}</div>
        {negative && (
          <div className="mt-1 text-xs opacity-90">
            {t("negativeBalanceNote")}
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
                {ron(b.net_cents)}
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
        <h3 className="font-semibold">{t("withdrawMoney")}</h3>
        <p className="mt-1 text-xs text-gray-500">{t("minAmountApprovalNote", { amount: ron(minPayoutCents) })}</p>
        <div className="mt-3 space-y-2">
          <input
            inputMode="decimal"
            placeholder={t("amountPlaceholder")}
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
            {t("requestWithdrawal")}
          </button>
          {msg && <div className="text-center text-xs text-gray-600">{msg}</div>}
        </div>
      </div>

      {/* Istoric payout */}
      {data.payouts.length > 0 && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="font-semibold">{t("recentWithdrawals")}</h3>
          <ul className="mt-2 divide-y text-sm">
            {data.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>{ron(p.amount_cents)}</span>
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
