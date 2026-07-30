"use client";

/**
 * FRONT R5 — ecranul de câștiguri al curierului (/courier/earnings).
 *
 * Azi / săptămână / lună, lista livrărilor & curselor cu suma per fiecare
 * (din wallet_ledger), soldul disponibil, cerere de retragere și onboarding
 * Stripe Connect pentru payout automat.
 */
import { useCallback, useEffect, useState } from "react";

type Bucket = { eats_cents: number; go_cents: number; tips_cents: number; net_cents: number };
type Entry = {
  id: string;
  kind: "credit" | "debit";
  amount_cents: number;
  ref_type: string;
  ref_id: string;
  description: string | null;
  created_at: string;
  tip_cents: number | null;
};
type Payout = {
  id: string;
  amount_cents: number;
  status: string;
  requested_at: string;
  resolved_at: string | null;
};
type EarningsData = {
  balance_cents: number;
  periods: Record<"today" | "week" | "month", Bucket>;
  entries: Entry[];
  payouts: Payout[];
  currency: string;
};
type ConnectStatus = { connected: boolean; payouts_enabled: boolean; details_submitted?: boolean };

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("ro-RO", { style: "currency", currency: "RON" });

const REF_LABEL: Record<string, string> = {
  ride: "Cursă",
  order: "Livrare",
  payout: "Retragere",
  payout_refund: "Retragere respinsă (recreditare)",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "în așteptare",
  processing: "în procesare",
  paid: "plătit",
  failed: "eșuat",
  rejected: "respins",
};

export default function EarningsClient() {
  const [data, setData] = useState<EarningsData | null>(null);
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [eRes, cRes] = await Promise.all([
        fetch("/api/couriers/earnings"),
        fetch("/api/couriers/connect"),
      ]);
      if (!eRes.ok) {
        const j = await eRes.json().catch(() => null);
        setError(j?.error ?? "Nu am putut încărca datele.");
        return;
      }
      setData(await eRes.json());
      if (cRes.ok) setConnect(await cRes.json());
    } catch {
      setError("Eroare de rețea.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requestPayout = async () => {
    setMsg("");
    setError("");
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError("Introdu o sumă validă.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/couriers/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: cents }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? "Cererea a eșuat.");
      } else {
        setMsg("Cererea de retragere a fost înregistrată.");
        setAmount("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const startOnboarding = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/couriers/connect", { method: "POST" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.url) window.location.href = j.url;
      else setError(j?.error ?? "Onboarding indisponibil.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return <main className="mx-auto max-w-md p-6 text-red-600">{error}</main>;
  }
  if (!data) {
    return <main className="mx-auto max-w-md p-6 text-gray-500">Se încarcă…</main>;
  }

  const negative = data.balance_cents < 0;

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Câștigurile mele</h1>
        <a href="/courier" className="text-sm text-blue-600 underline">
          ← PWA curier
        </a>
      </header>

      {/* Sold */}
      <section className="rounded-2xl bg-gray-900 p-5 text-white">
        <p className="text-sm opacity-70">Sold disponibil</p>
        <p className={`text-3xl font-bold ${negative ? "text-red-400" : ""}`}>
          {fmt(data.balance_cents)}
        </p>
        {negative && (
          <p className="mt-1 text-xs text-red-300">
            Sold negativ = comision datorat platformei din încasările cash. Se stinge
            automat din următoarele câștiguri card.
          </p>
        )}
      </section>

      {/* Perioade */}
      <section className="grid grid-cols-3 gap-2">
        {(["today", "week", "month"] as const).map((p) => (
          <div key={p} className="rounded-xl border p-3 text-center">
            <p className="text-xs text-gray-500">
              {p === "today" ? "Azi" : p === "week" ? "Săptămâna" : "Luna"}
            </p>
            <p className="font-semibold">{fmt(data.periods[p]?.net_cents ?? 0)}</p>
            <p className="text-[10px] text-gray-400">
              Eats {fmt(data.periods[p]?.eats_cents ?? 0)} · Go {fmt(data.periods[p]?.go_cents ?? 0)}
            </p>
          </div>
        ))}
      </section>

      {/* Stripe Connect */}
      <section className="rounded-xl border p-4">
        <h2 className="mb-2 font-semibold">Plăți automate (Stripe)</h2>
        {connect?.payouts_enabled ? (
          <p className="text-sm text-green-600">✓ Cont Stripe activ — retragerile se plătesc automat.</p>
        ) : connect?.connected ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-600">Contul Stripe există dar nu e complet.</p>
            <button onClick={startOnboarding} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              Continuă verificarea
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              Conectează un cont Stripe ca să primești banii automat. Fără el, retragerile se
              plătesc manual (durează mai mult).
            </p>
            <button onClick={startOnboarding} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              Configurează plățile
            </button>
          </div>
        )}
      </section>

      {/* Retragere */}
      <section className="rounded-xl border p-4">
        <h2 className="mb-2 font-semibold">Retragere</h2>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Suma (RON), min. 50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          <button
            onClick={requestPayout}
            disabled={busy || data.balance_cents < 5000}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Retrage
          </button>
        </div>
        {msg && <p className="mt-2 text-sm text-green-600">{msg}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {data.payouts.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {data.payouts.map((p) => (
              <li key={p.id} className="flex justify-between border-t pt-1">
                <span>{new Date(p.requested_at).toLocaleDateString("ro-RO")}</span>
                <span>{fmt(p.amount_cents)}</span>
                <span className="text-gray-500">{STATUS_LABEL[p.status] ?? p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Istoric livrări & curse */}
      <section className="rounded-xl border p-4">
        <h2 className="mb-2 font-semibold">Ultimele tranzacții</h2>
        {data.entries.length === 0 ? (
          <p className="text-sm text-gray-500">Nimic încă — acceptă o livrare sau o cursă.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between border-t py-1">
                <div>
                  <p>{REF_LABEL[e.ref_type] ?? e.ref_type} <span className="text-gray-400">#{e.ref_id.slice(0, 8)}</span></p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(e.created_at).toLocaleString("ro-RO")}
                    {e.tip_cents ? ` · bacșiș ${fmt(Number(e.tip_cents))}` : ""}
                  </p>
                </div>
                <span className={e.kind === "credit" ? "font-medium text-green-600" : "font-medium text-red-600"}>
                  {e.kind === "credit" ? "+" : "−"}{fmt(e.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
