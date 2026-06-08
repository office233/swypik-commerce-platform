"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Coins,
  Flame,
  Gift,
  History,
  ArrowDownCircle,
  ArrowUpCircle,
  Trophy,
  Repeat,
  ChevronRight,
} from "lucide-react";

type Tx = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  sourceType: string | null;
  createdAt: string;
};

type Challenge = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  reward: number;
  endsAt: string;
};

type WalletData = {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  dailyStreak: number;
  canClaim: boolean;
  nextClaimAt: string | null;
  transactions: Tx[];
  challenges: Challenge[];
};

function buildReasonLabels(tr: (k: string) => string): Record<string, string> {
  return {
    daily_claim: tr("reasonDailyClaim"),
    view_milestone: tr("reasonViewMilestone"),
    purchase: tr("reasonPurchase"),
    spend: tr("reasonSpend"),
    earn: tr("reasonEarn"),
    admin_grant: tr("reasonAdminGrant"),
    admin_deduct: tr("reasonAdminDeduct"),
    challenge_reward: tr("reasonChallengeReward"),
    referral: tr("reasonReferral"),
  };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ro-RO", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Bucharest",
    });
  } catch {
    return iso;
  }
}

function formatCountdown(targetIso: string, nowMs: number): string {
  const diff = new Date(targetIso).getTime() - nowMs;
  if (diff <= 0) return "acum";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function WalletClient() {
  const t = useTranslations("wallet");
  const REASON_LABELS = buildReasonLabels(t);
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleClaim = useCallback(async () => {
    setClaiming(true);
    try {
      const res = await fetch("/api/wallet/daily-claim", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setToast(`+${json.amount} SWYP! Streak: ${json.streak} 🔥`);
        await load();
      } else if (json.error === "already_claimed") {
        setToast(t("aiRevendicatDejaAzi"));
      } else if (json.error === "unauth") {
        setToast(t("trebuieSaFiiAutentificat"));
      } else {
        setToast(t("eroareLaRevendicare"));
      }
    } catch {
      setToast(t("eroareDeRetea"));
    } finally {
      setClaiming(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, [load]);

  const countdown = useMemo(() => {
    if (!data?.nextClaimAt) return null;
    return formatCountdown(data.nextClaimAt, now);
  }, [data?.nextClaimAt, now]);

  return (
    <main className="min-h-screen bg-black text-white pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-black/80 backdrop-blur border-b border-white/10">
        <Link href="/account" className="p-1 -ml-1" aria-label={t("inapoi")}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-lg font-black">{t("portofelSwyp")}</h1>
      </header>

      <div className="px-4 pt-5 max-w-2xl mx-auto">
        {loading || !data ? (
          <div className="text-white/50 text-sm">{t("seIncarca")}</div>
        ) : (
          <>
            {/* Hero balance */}
            <section className="rounded-3xl bg-gradient-to-br from-yellow-500/20 via-orange-500/10 to-pink-500/10 border border-yellow-500/30 p-6">
              <div className="flex items-center gap-2 text-yellow-300/90 text-xs uppercase tracking-wider font-bold">
                <Coins size={14} />
                
                {t("balantaSwypCoins")}
              </div>
              <div className="mt-2 text-5xl font-black tabular-nums flex items-baseline gap-2">
                <Coins size={36} className="text-yellow-400" />
                {data.balance.toLocaleString("ro-RO")}
                <span className="text-xl text-white/60">SWYP</span>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <Flame size={16} className="text-orange-400" />
                <span className="font-semibold">
                  {t("zileStreak", { count: data.dailyStreak })}  {t("laRand")}
                </span>
              </div>
              <div className="mt-3 flex gap-4 text-xs text-white/60">
                <span className="flex items-center gap-1">
                  <ArrowUpCircle size={12} className="text-green-400" />
                  {t("totalLabel")}: {data.lifetimeEarned.toLocaleString("ro-RO")}
                </span>
                <span className="flex items-center gap-1">
                  <ArrowDownCircle size={12} className="text-red-400" />
                  {t("cheltuitLabel")}: {data.lifetimeSpent.toLocaleString("ro-RO")}
                </span>
              </div>
            </section>

            {/* Daily claim */}
            <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-3">
                <Gift size={20} className="text-pink-400" />
                <div className="flex-1">
                  <h2 className="text-sm md:text-base font-bold">{t("recompensaZilnica")}</h2>
                  <p className="text-xs text-white/60 mt-0.5">
                    
                    {t("10CoinsZiua1")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={!data.canClaim || claiming}
                onClick={handleClaim}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-pink-500 to-orange-500 disabled:from-white/10 disabled:to-white/10 disabled:text-white/40 text-white font-bold py-3 text-sm md:text-base transition"
              >
                {claiming
                  ? t("seRevendica")
                  : data.canClaim
                  ? t("revendicaRecompensa")
                  : countdown
                  ? t("disponibilIn", { countdown })
                  : t("revendicat")}
              </button>
            </section>

            {/* Active challenges */}
            <section className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-white/80 flex items-center gap-2">
                  <Trophy size={16} className="text-yellow-400" />
                  
                  {t("provocariActive")}
                </h2>
                <Link
                  href="/challenges"
                  className="text-xs text-pink-400 font-semibold flex items-center gap-0.5 hover:text-pink-300"
                >
                  {t("toate")} <ChevronRight size={14} />
                </Link>
              </div>
              {data.challenges.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/50">
                  
                  {t("nicioProvocareActivaMomentan")}
                </div>
              ) : (
                <ul className="space-y-2">
                  {data.challenges.map((c) => (
                    <li key={c.id}>
                      <Link
                        href="/challenges"
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] p-4 transition"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold truncate">{c.title}</div>
                          {c.description && (
                            <div className="text-xs text-white/50 truncate mt-0.5">
                              {c.description}
                            </div>
                          )}
                          <div className="text-[11px] text-white/40 mt-1">
                            
                            {t("seIncheie")} {formatDate(c.endsAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-300 font-bold text-sm shrink-0">
                          <Coins size={14} />+{c.reward}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Transactions */}
            <section className="mt-6">
              <h2 className="text-sm font-bold text-white/80 mb-3 flex items-center gap-2">
                <History size={16} />
                
                {t("tranzactiiRecente")}
              </h2>
              {data.transactions.length === 0 ? (
                <p className="text-sm text-white/50">{t("nicioTranzactieInca")}</p>
              ) : (
                <ul className="rounded-2xl border border-white/10 bg-white/[0.04] divide-y divide-white/5 overflow-hidden">
                  {data.transactions.map((tx) => {
                    const isEarn = tx.type === "earn" || tx.type === "admin_grant";
                    return (
                      <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                        <div
                          className={`shrink-0 ${
                            isEarn ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {isEarn ? (
                            <ArrowUpCircle size={20} />
                          ) : (
                            <ArrowDownCircle size={20} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {REASON_LABELS[tx.reason] || REASON_LABELS[tx.type] || tx.reason}
                          </div>
                          <div className="text-xs text-white/40">
                            {formatDate(tx.createdAt)}
                          </div>
                        </div>
                        <div
                          className={`text-sm font-bold tabular-nums ${
                            isEarn ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {isEarn ? "+" : "−"}
                          {tx.amount.toLocaleString("ro-RO")} SWYP
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Convert to RON placeholder */}
            <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center gap-3">
                <Repeat size={20} className="text-white/30" />
                <div className="flex-1">
                  <h2 className="text-sm font-bold text-white/60">
                    
                    {t("conversieInRon")}
                  </h2>
                  <p className="text-xs text-white/40 mt-0.5">
                    
                    {t("inCurandVeiPutea")}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold bg-white/5 text-white/40 px-2 py-1 rounded-full">
                  
                  {t("curand")}
                </span>
              </div>
            </section>
          </>
        )}
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur border border-white/20 px-4 py-2 rounded-full text-sm whitespace-nowrap"
        >
          {toast}
        </div>
      )}
    </main>
  );
}
