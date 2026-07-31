"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatMoneyCents } from "@/lib/i18n/currency";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EarningsData {
  totalVideos: number;
  totalSalesCents: number;
  totalOrders: number;
  earningsCents: number;
  paidOutCents: number;
  pendingCents: number;
  payoutStatus: {
    paidCents: number;
    pendingCents: number;
    failedCents: number;
    blockedCents: number;
    paidItems: number;
    pendingItems: number;
    failedItems: number;
    blockedItems: number;
  };
  analytics: {
    averageOrderCents: number;
    thisMonthSalesCents: number;
    thisMonthOrders: number;
    thisMonthEarningsCents: number;
  };
}

// ─── Icons (inline SVG) ─────────────────────────────────────────────────────

function VideoIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  );
}

function ShoppingCartIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatLei = (cents: number) => formatMoneyCents(cents, "RON");

// ─── Skeleton loader ────────────────────────────────────────────────────────

function MetricCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#F7F7F8]" />
        <div className="h-4 w-24 rounded-lg bg-[#F7F7F8]" />
      </div>
      <div className="h-8 w-28 rounded-lg bg-[#F7F7F8]" />
    </div>
  );
}

// ─── Main Page Component ────────────────────────────────────────────────────

export default function CreatorEarningsPage() {
  const t = useTranslations("creatorEarnings");
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEarnings() {
      try {
        const res = await fetch("/api/creator/earnings");
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        const json: EarningsData = await res.json();
        setData(json);
      } catch (err: any) {
        console.error("Failed to load earnings:", err);
        setError(err.message || t("errIncarcare"));
      } finally {
        setLoading(false);
      }
    }
    fetchEarnings();
  }, [t]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-black text-[#0D0D0D]">{t("titlu")}</h1>
          <p className="text-[#6E6E80] mt-2">{t("seIncarca")}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-black text-[#0D0D0D]">{t("titlu")}</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-600 font-bold text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition"
          >
            {t("reincearca")}
          </button>
        </div>
      </div>
    );
  }

  const {
    totalVideos = 0,
    totalSalesCents = 0,
    totalOrders = 0,
    earningsCents = 0,
    paidOutCents = 0,
    pendingCents = 0,
    payoutStatus,
    analytics,
  } = data || {};

  const isEmpty = totalVideos === 0 && totalOrders === 0;
  const payout = payoutStatus || {
    paidCents: paidOutCents,
    pendingCents,
    failedCents: 0,
    blockedCents: 0,
    paidItems: 0,
    pendingItems: 0,
    failedItems: 0,
    blockedItems: 0,
  };
  const stats = analytics || {
    averageOrderCents: totalOrders > 0 ? Math.round(totalSalesCents / totalOrders) : 0,
    thisMonthSalesCents: 0,
    thisMonthOrders: 0,
    thisMonthEarningsCents: 0,
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D0D0D]">{t("titlu")}</h1>
          <p className="text-[#6E6E80] mt-1">
            {t("intro")}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/creator/videos"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl text-sm font-bold text-[#0D0D0D] hover:bg-[#EFEFEF] transition-all"
          >
            {t("linkClipuri")} →
          </Link>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0D0D0D] text-white rounded-xl text-sm font-bold hover:bg-[#0E9272] transition-all shadow-sm hover:shadow-md"
          >
            {t("linkUpload")} →
          </Link>
        </div>
      </div>

      {/* ── Empty State ── */}
      {isEmpty && (
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-10 text-center shadow-sm">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#0D0D0D]/10 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0D0D0D"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 8-6 4 6 4V8Z" />
              <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-[#0D0D0D] mb-2">
            {t("emptyTitle")}
          </h2>
          <p className="text-[#6E6E80] text-sm max-w-md mx-auto mb-6">
            {t("emptyHint")}
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0D0D0D] text-white rounded-xl text-sm font-black hover:bg-[#0E9272] transition-all shadow-sm hover:shadow-md"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {t("incarcaClip")}
          </Link>
        </div>
      )}

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1 — Clipuri Active */}
        <div className="group relative overflow-hidden bg-[#0D0D0D] text-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition">
                <VideoIcon />
              </div>
              <p className="text-sm font-bold text-white/60">{t("cardClipuriActive")}</p>
            </div>
            <p className="text-3xl font-black">{totalVideos}</p>
            <p className="text-xs text-white/40 mt-1">
              {totalVideos === 1 ? t("clipPublicat") : t("clipuriPublicate")}
            </p>
          </div>
        </div>

        {/* Card 2 — Vânzări Generate */}
        <div className="group relative overflow-hidden bg-[#0D0D0D] text-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center group-hover:bg-white/25 transition">
                <ShoppingCartIcon />
              </div>
              <p className="text-sm font-bold text-white/70">{t("cardVanzari")}</p>
            </div>
            <p className="text-3xl font-black">{formatLei(totalSalesCents)}</p>
            <p className="text-xs text-white/50 mt-1">
              {totalOrders} {totalOrders === 1 ? t("comanda") : t("comenzi")}
            </p>
          </div>
        </div>

        {/* Card 3 — Comision Câștigat */}
        <div className="group bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm hover:shadow-lg transition-all duration-300">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#0D0D0D]/10 flex items-center justify-center text-[#0D0D0D] group-hover:bg-[#0D0D0D]/15 transition">
              <TrendingUpIcon />
            </div>
            <p className="text-sm font-bold text-[#6E6E80]">{t("cardComision")}</p>
          </div>
          <p className="text-3xl font-black text-[#0D0D0D]">
            {formatLei(earningsCents)}
          </p>
          <p className="text-xs text-[#6E6E80] mt-1">{t("comisionInfo")}</p>
        </div>

        {/* Card 4 — Plătit / De încasat */}
        <div className="group bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm hover:shadow-lg transition-all duration-300">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 group-hover:bg-amber-500/15 transition">
              <WalletIcon />
            </div>
            <p className="text-sm font-bold text-[#6E6E80]">{t("cardPlatitIncasat")}</p>
          </div>
          <div className="flex items-baseline gap-3">
            <div>
              <p className="text-2xl font-black text-[#0D0D0D]">
                {formatLei(paidOutCents)}
              </p>
              <p className="text-[10px] font-bold text-[#6E6E80] uppercase tracking-wide">
                {t("platit")}
              </p>
            </div>
            <span className="text-[#E5E5E5] text-lg font-light">/</span>
            <div>
              <p className="text-2xl font-black text-amber-600">
                {formatLei(pendingCents)}
              </p>
              <p className="text-[10px] font-bold text-amber-600/60 uppercase tracking-wide">
                {t("deIncasat")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── How It Works Section ── */}
      {!isEmpty && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-black text-[#0D0D0D] mb-4">{t("statusPayout")}</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-neutral-100 p-4">
                <p className="text-xs font-bold text-neutral-900 uppercase tracking-wide">{t("platit")}</p>
                <p className="mt-1 text-xl font-black text-neutral-900">{formatLei(payout.paidCents)}</p>
                <p className="text-xs text-neutral-900/70">{t("itemuri", { n: payout.paidItems })}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-4">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">{t("inAsteptare")}</p>
                <p className="mt-1 text-xl font-black text-amber-700">{formatLei(payout.pendingCents)}</p>
                <p className="text-xs text-amber-700/70">{t("itemuri", { n: payout.pendingItems })}</p>
              </div>
              <div className="rounded-xl bg-red-50 p-4">
                <p className="text-xs font-bold text-red-700 uppercase tracking-wide">{t("esuat")}</p>
                <p className="mt-1 text-xl font-black text-red-700">{formatLei(payout.failedCents)}</p>
                <p className="text-xs text-red-700/70">{t("itemuri", { n: payout.failedItems })}</p>
              </div>
              <div className="rounded-xl bg-[#F7F7F8] p-4">
                <p className="text-xs font-bold text-[#6E6E80] uppercase tracking-wide">{t("blocat")}</p>
                <p className="mt-1 text-xl font-black text-[#0D0D0D]">{formatLei(payout.blockedCents)}</p>
                <p className="text-xs text-[#6E6E80]">{t("itemuri", { n: payout.blockedItems })}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-black text-[#0D0D0D] mb-4">{t("analyticsVanzari")}</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#F7F7F8] pb-3">
                <span className="text-sm font-bold text-[#6E6E80]">{t("valoareMedie")}</span>
                <span className="text-base font-black text-[#0D0D0D]">{formatLei(stats.averageOrderCents)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#F7F7F8] pb-3">
                <span className="text-sm font-bold text-[#6E6E80]">{t("vanzariLuna")}</span>
                <span className="text-base font-black text-[#0D0D0D]">{formatLei(stats.thisMonthSalesCents)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#6E6E80]">{t("comisionLuna")}</span>
                <span className="text-base font-black text-[#0D0D0D]">{formatLei(stats.thisMonthEarningsCents)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-8 shadow-sm">
        <h2 className="text-xl font-black text-[#0D0D0D] mb-6">
          {t("cumFunctioneaza")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#0D0D0D]/10 flex items-center justify-center">
              <span className="text-[#0D0D0D] font-black text-sm">1</span>
            </div>
            <div>
              <h3 className="font-bold text-[#0D0D0D] text-sm">
                {t("step1Title")}
              </h3>
              <p className="text-xs text-[#6E6E80] mt-1 leading-relaxed">
                {t("step1Body")}
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#0D0D0D]/10 flex items-center justify-center">
              <span className="text-[#0D0D0D] font-black text-sm">2</span>
            </div>
            <div>
              <h3 className="font-bold text-[#0D0D0D] text-sm">
                {t("step2Title")}
              </h3>
              <p className="text-xs text-[#6E6E80] mt-1 leading-relaxed">
                {t("step2Body")}
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#0D0D0D]/10 flex items-center justify-center">
              <span className="text-[#0D0D0D] font-black text-sm">3</span>
            </div>
            <div>
              <h3 className="font-bold text-[#0D0D0D] text-sm">
                {t("step3Title")}
              </h3>
              <p className="text-xs text-[#6E6E80] mt-1 leading-relaxed">
                {t("step3Body")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
