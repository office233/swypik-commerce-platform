"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Coins, Flame, Gift } from "lucide-react";

type Tx = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  sourceType: string | null;
  createdAt: string;
};

type WalletData = {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  dailyStreak: number;
  canClaim: boolean;
  nextClaimAt: string | null;
  transactions: Tx[];
};

const REASON_LABELS: Record<string, string> = {
  daily_claim: "Recompensă zilnică",
  view_milestone: "Bonus vizualizări",
  purchase: "Cumpărătură",
  spend: "Cheltuit",
  earn: "Câștigat",
  admin_grant: "Acordat de admin",
  admin_deduct: "Reținut de admin",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ro-RO", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function WalletClient() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallet");
      const json = await res.json();
      if (res.ok) setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleClaim = useCallback(async () => {
    setClaiming(true);
    try {
      const res = await fetch("/api/wallet/daily-claim", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setToast(`+${json.amount} SWYP! Streak: ${json.streak}`);
        await load();
      } else if (json.error === "already_claimed") {
        setToast("Ai revendicat deja recompensa azi.");
      } else {
        setToast("Eroare la revendicare.");
      }
    } catch {
      setToast("Eroare de rețea.");
    } finally {
      setClaiming(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, [load]);

  return (
    <main className="min-h-screen bg-black text-white pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-black/80 backdrop-blur border-b border-white/10">
        <Link href="/account" className="p-1 -ml-1">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-lg font-black">Portofel SWYP</h1>
      </header>

      <div className="px-4 pt-5 max-w-2xl mx-auto">
        {loading || !data ? (
          <div className="text-white/50 text-sm">Se încarcă...</div>
        ) : (
          <>
            <section className="rounded-3xl bg-gradient-to-br from-yellow-500/20 via-orange-500/10 to-pink-500/10 border border-yellow-500/30 p-6">
              <div className="flex items-center gap-2 text-yellow-300/90 text-xs uppercase tracking-wider font-bold">
                <Coins size={14} />
                Balanță SWYP
              </div>
              <div className="mt-2 text-5xl font-black tabular-nums">
                {data.balance.toLocaleString("ro-RO")}
                <span className="text-2xl ml-2 text-white/60">SWYP</span>
              </div>
              <div className="mt-3 flex gap-4 text-xs text-white/60">
                <span>Total câștigat: {data.lifetimeEarned.toLocaleString("ro-RO")}</span>
                <span>Cheltuit: {data.lifetimeSpent.toLocaleString("ro-RO")}</span>
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-3">
                <Gift size={20} className="text-pink-400" />
                <div className="flex-1">
                  <h2 className="text-sm md:text-base font-bold">Recompensă zilnică</h2>
                  <p className="text-xs text-white/60 mt-0.5 flex items-center gap-1">
                    <Flame size={12} className="text-orange-400" />
                    Streak: {data.dailyStreak} {data.dailyStreak === 1 ? "zi" : "zile"}
                  </p>
                </div>
              </div>
              <button
                disabled={!data.canClaim || claiming}
                onClick={handleClaim}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-pink-500 to-orange-500 disabled:from-white/10 disabled:to-white/10 disabled:text-white/40 text-white font-bold py-3 text-sm md:text-base transition"
              >
                {claiming
                  ? "Se revendică..."
                  : data.canClaim
                  ? "Revendică recompensa zilnică"
                  : "Revendicat — revino mâine"}
              </button>
              {!data.canClaim && data.nextClaimAt && (
                <p className="mt-2 text-xs text-white/40 text-center">
                  Disponibil din: {formatDate(data.nextClaimAt)}
                </p>
              )}
            </section>

            <section className="mt-6">
              <h2 className="text-sm font-bold text-white/80 mb-3">Tranzacții recente</h2>
              {data.transactions.length === 0 ? (
                <p className="text-sm text-white/50">Nicio tranzacție încă.</p>
              ) : (
                <ul className="rounded-2xl border border-white/10 bg-white/[0.04] divide-y divide-white/5 overflow-hidden">
                  {data.transactions.map((t) => {
                    const isEarn = t.type === "earn" || t.type === "admin_grant";
                    return (
                      <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {REASON_LABELS[t.reason] || REASON_LABELS[t.type] || t.reason}
                          </div>
                          <div className="text-xs text-white/40">{formatDate(t.createdAt)}</div>
                        </div>
                        <div
                          className={`text-sm font-bold tabular-nums ${
                            isEarn ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {isEarn ? "+" : "−"}
                          {t.amount.toLocaleString("ro-RO")} SWYP
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur border border-white/20 px-4 py-2 rounded-full text-sm">
          {toast}
        </div>
      )}
    </main>
  );
}
