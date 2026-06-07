"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Pickaxe,
  Flame,
  Users,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Trophy,
  Sparkles,
  ChevronRight,
  Clock,
} from "lucide-react";
import { solveChallenge } from "./solveChallenge";

type Stats = {
  total_mined: string;
  streak_current: number;
  streak_best: number;
  last_tap_at: string | null;
  daily_today: string;
  daily_cap: string;
  current_multiplier: string;
  refs_l1_active: number;
  refs_l2_active: number;
  refs_l3_active: number;
  kyc_face_verified: boolean;
  pioneer_badge: boolean;
  security_circle_count: number;
};

type Multiplier = {
  base: string;
  streak_pct: string;
  kyc_pct: string;
  pioneer_pct: string;
  circle_pct: string;
  refs_l1_pct: string;
  refs_l2_pct: string;
  refs_l3_pct: string;
  stake_pct: string;
  total_multiplier: string;
};

type ClaimResult = {
  reward: string;
  streak: number;
  multiplier: string;
  next_claim_at: string;
};

type ApiError = { error: string; message?: string; retry_at?: string };

function fmt(n: string | number, decimals = 4): string {
  const x = typeof n === "string" ? Number.parseFloat(n) : n;
  if (!Number.isFinite(x)) return "0";
  return x.toFixed(decimals).replace(/\.?0+$/, "");
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "ready";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export default function EarnClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [mult, setMult] = useState<Multiplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [lastClaim, setLastClaim] = useState<ClaimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        fetch("/api/swypik-token/stats", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/swypik-token/multiplier", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (s && !("error" in s)) setStats(s);
      if (m && !("error" in m)) setMult(m);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mine = useCallback(async () => {
    setError(null);
    setMining(true);
    try {
      const chRes = await fetch("/api/swypik-token/mine/challenge", { method: "POST" });
      if (!chRes.ok) {
        const err = (await chRes.json()) as ApiError;
        setError(err.message ?? "Unable to start mining");
        return;
      }
      const ch = (await chRes.json()) as {
        challenge: string;
        difficulty: number;
        issued_at: number;
      };

      const nonce = await solveChallenge(ch.challenge, ch.difficulty);

      const claimRes = await fetch("/api/swypik-token/mine/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge: ch.challenge,
          nonce,
          issued_at: ch.issued_at,
          device_hash: navigator.userAgent.slice(0, 64),
        }),
      });

      if (!claimRes.ok) {
        const err = (await claimRes.json()) as ApiError;
        setError(err.message ?? "Claim failed");
        if (err.retry_at) setRetryAt(err.retry_at);
        return;
      }
      const result = (await claimRes.json()) as ClaimResult;
      setLastClaim(result);
      setRetryAt(result.next_claim_at);
      if ("vibrate" in navigator) navigator.vibrate?.([12, 30, 12]);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMining(false);
    }
  }, [refresh]);

  const canMine = !mining && (!retryAt || new Date(retryAt) <= new Date());

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-950 via-indigo-950 to-slate-950 text-white pb-24">
      {/* HERO */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/account"
            className="text-sm text-violet-300 flex items-center gap-1 hover:text-violet-200"
          >
            <Wallet className="w-4 h-4" />
            Profile
          </Link>
          <Link
            href="/earn/leaderboard"
            className="text-sm text-violet-300 flex items-center gap-1 hover:text-violet-200"
          >
            <Trophy className="w-4 h-4" />
            Top miners
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">Mine $SWYP</h1>
        <p className="text-violet-300 text-sm mt-1">
          Digital cash for real life. Tap daily, spend anywhere.
        </p>
      </div>

      {/* BALANCE / STREAK CARD */}
      <div className="mx-5 rounded-3xl bg-gradient-to-br from-violet-600/40 to-indigo-700/40 backdrop-blur border border-white/10 p-6 shadow-xl">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-violet-300">Total mined</div>
            <div className="text-4xl font-bold mt-1">
              {loading ? "…" : fmt(stats?.total_mined ?? "0", 4)}
            </div>
            <div className="text-violet-300 text-sm mt-1">$SWYP</div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-orange-300">
              <Flame className="w-5 h-5" />
              <span className="text-2xl font-bold">{stats?.streak_current ?? 0}</span>
            </div>
            <div className="text-xs text-violet-300 mt-1">day streak</div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span className="text-violet-200">Current multiplier</span>
          <span className="ml-auto font-bold text-amber-300">
            ×{fmt(stats?.current_multiplier ?? "1.0", 2)}
          </span>
        </div>
      </div>

      {/* MINE BUTTON */}
      <div className="mx-5 mt-8 flex flex-col items-center">
        <button
          type="button"
          onClick={() => void mine()}
          disabled={!canMine}
          className={`
            relative w-44 h-44 rounded-full transition-all duration-200
            ${
              canMine
                ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_0_50px_-5px_rgba(251,146,60,0.7)] hover:scale-105 active:scale-95"
                : "bg-slate-700 cursor-not-allowed opacity-60"
            }
          `}
          aria-label="Tap to mine"
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Pickaxe className={`w-12 h-12 ${canMine ? "text-white" : "text-slate-400"}`} />
            <span className="text-white font-bold text-lg mt-2">
              {mining ? "Mining…" : canMine ? "TAP" : "Wait"}
            </span>
          </div>
        </button>

        <div className="mt-4 text-center">
          {lastClaim && (
            <div className="text-emerald-300 font-bold text-lg">
              +{fmt(lastClaim.reward, 4)} $SWYP
            </div>
          )}
          {retryAt && !canMine && (
            <div className="text-violet-300 text-sm flex items-center justify-center gap-1 mt-2">
              <Clock className="w-4 h-4" />
              Next claim in {timeUntil(retryAt)}
            </div>
          )}
          {error && (
            <div className="text-rose-300 text-sm mt-2">{error}</div>
          )}
        </div>
      </div>

      {/* MULTIPLIER BREAKDOWN */}
      {mult && (
        <div className="mx-5 mt-8 rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-300" />
            <h2 className="font-semibold">Your boost</h2>
          </div>
          <ul className="space-y-2 text-sm">
            <BoostRow label="Base reward" value={`${fmt(mult.base, 2)} $SWYP`} />
            <BoostRow label="Streak bonus" value={`+${fmt(mult.streak_pct, 0)}%`} highlight={Number(mult.streak_pct) > 0} />
            <BoostRow label="KYC verified" value={`+${fmt(mult.kyc_pct, 0)}%`} highlight={Number(mult.kyc_pct) > 0} />
            <BoostRow label="Pioneer badge" value={`+${fmt(mult.pioneer_pct, 0)}%`} highlight={Number(mult.pioneer_pct) > 0} />
            <BoostRow label="Security circle" value={`+${fmt(mult.circle_pct, 0)}%`} highlight={Number(mult.circle_pct) > 0} />
            <BoostRow label="Referrals L1 (direct)" value={`+${fmt(mult.refs_l1_pct, 0)}%`} highlight={Number(mult.refs_l1_pct) > 0} />
            <BoostRow label="Referrals L2" value={`+${fmt(mult.refs_l2_pct, 0)}%`} highlight={Number(mult.refs_l2_pct) > 0} />
            <BoostRow label="Referrals L3" value={`+${fmt(mult.refs_l3_pct, 0)}%`} highlight={Number(mult.refs_l3_pct) > 0} />
            <BoostRow label="Staking" value={`+${fmt(mult.stake_pct, 0)}%`} highlight={Number(mult.stake_pct) > 0} />
            <li className="border-t border-white/10 pt-2 mt-2 flex justify-between font-bold">
              <span>Total multiplier</span>
              <span className="text-amber-300">×{fmt(mult.total_multiplier, 2)}</span>
            </li>
          </ul>
        </div>
      )}

      {/* BOOST ACTIONS */}
      <div className="mx-5 mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ActionCard
          href="#"
          icon={<ShieldCheck className="w-5 h-5" />}
          title="Verify face (KYC)"
          subtitle={stats?.kyc_face_verified ? "Verified — +50% applied" : "Coming soon — +50% boost"}
          done={stats?.kyc_face_verified}
        />
        <ActionCard
          href="/earn/refer"
          icon={<Users className="w-5 h-5" />}
          title="Invite friends"
          subtitle={`${stats?.refs_l1_active ?? 0} active · +10% each (unlimited)`}
        />
      </div>

      {/* DAILY PROGRESS */}
      {stats && (
        <div className="mx-5 mt-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-5">
          <div className="flex justify-between text-xs text-violet-300 mb-2">
            <span>Today&apos;s mining</span>
            <span>
              {fmt(stats.daily_today, 2)} / {fmt(stats.daily_cap, 0)} $SWYP
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
              style={{
                width: `${Math.min(
                  100,
                  (Number.parseFloat(stats.daily_today) / Math.max(1, Number.parseFloat(stats.daily_cap))) * 100,
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* WHAT YOU CAN BUY */}
      <div className="mx-5 mt-8 mb-4 rounded-2xl bg-gradient-to-br from-emerald-600/20 to-teal-700/20 border border-emerald-500/20 p-5">
        <h2 className="font-bold text-lg mb-2">What can I buy with $SWYP?</h2>
        <p className="text-emerald-200 text-sm mb-4">
          The first crypto you actually use. Today and soon.
        </p>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span>🛍️ 14,000+ products (10% discount)</span>
            <span className="text-emerald-300 text-xs">LIVE</span>
          </li>
          <li className="flex items-center justify-between">
            <span>🎬 Tip creators &amp; boost videos</span>
            <span className="text-emerald-300 text-xs">LIVE</span>
          </li>
          <li className="flex items-center justify-between">
            <span>📱 Gift cards (Steam, Netflix, etc.)</span>
            <span className="text-violet-300 text-xs">Q3</span>
          </li>
          <li className="flex items-center justify-between">
            <span>✈️ Flights &amp; hotels</span>
            <span className="text-violet-300 text-xs">Q4</span>
          </li>
          <li className="flex items-center justify-between">
            <span>🏠 Apartments (rent &amp; buy)</span>
            <span className="text-violet-300 text-xs">2027</span>
          </li>
          <li className="flex items-center justify-between">
            <span>💳 Swypik Debit Card (anywhere)</span>
            <span className="text-violet-300 text-xs">2027</span>
          </li>
        </ul>
        <Link
          href="/swypik-token"
          className="mt-4 inline-flex items-center gap-1 text-emerald-300 text-sm font-medium hover:text-emerald-200"
        >
          Read the whitepaper <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

function BoostRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <li className={`flex justify-between ${highlight ? "text-emerald-300" : "text-violet-200"}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </li>
  );
}

function ActionCard({
  href,
  icon,
  title,
  subtitle,
  done,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  done?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`
        rounded-2xl p-4 border transition-colors flex items-start gap-3
        ${done
          ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
          : "bg-white/5 border-white/10 hover:bg-white/10"}
      `}
    >
      <div className={done ? "text-emerald-300" : "text-violet-300"}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-violet-300 mt-0.5">{subtitle}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-violet-400" />
    </Link>
  );
}
