"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  Radio,
  Clock,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Bot,
  RefreshCw,
  TrendingUp,
  ShieldCheck,
  Zap,
} from "lucide-react";

interface Article {
  id: string;
  slug: string;
  title: string;
  summary_tldr: string;
  cover_image_url: string;
  is_breaking: boolean;
  reading_time_minutes: number;
  fact_check_score: number;
  published_at: string;
  category_name: string;
  category_slug: string;
}

const CATEGORY_SLUGS = ["all", "tech-ai", "crypto", "gaming", "business", "science"] as const;
const CATEGORY_ICONS: Record<(typeof CATEGORY_SLUGS)[number], string> = {
  all: "🌐",
  "tech-ai": "⚡",
  crypto: "🪙",
  gaming: "🎮",
  business: "📈",
  science: "🔬",
};

export default function NewsListClient({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("news");
  const locale = useLocale();

  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedCat, setSelectedCat] = useState<(typeof CATEGORY_SLUGS)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadArticles = (cat: string) => {
    setLoading(true);
    fetch(`/api/news?category=${cat}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.articles)) {
          setArticles(d.articles);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadArticles(selectedCat);
  }, [selectedCat]);

  // Manual trigger stays admin-only: the pipeline calls Gemini per article,
  // so exposing it to every visitor is an unbounded-cost bug, not a feature.
  const handleTriggerAI = async (catToGen?: string) => {
    if (!isAdmin) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/cron/news-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: catToGen || (selectedCat !== "all" ? selectedCat : undefined),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        loadArticles(selectedCat);
      }
    } finally {
      setGenerating(false);
    }
  };

  const breakingArticles = articles.filter((a) => a.is_breaking);
  const heroArticle = articles[0];
  const secondaryArticles = articles.slice(1);

  return (
    <div
      className="min-h-screen bg-[#06080D] text-slate-100 font-sans selection:bg-cyan-500 selection:text-black"
      style={{ paddingBottom: "max(96px, calc(80px + env(safe-area-inset-bottom, 0px)))" }}
    >
      {/* ── LIVE BREAKING WIRE TICKER ───────────────────────────────── */}
      {breakingArticles.length > 0 && (
        <div className="bg-gradient-to-r from-rose-950/90 via-red-900/80 to-rose-950/90 border-b border-rose-500/30 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs shadow-lg shadow-rose-950/30 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest shadow-sm animate-pulse flex-shrink-0">
              <Radio size={12} /> {t("liveWire")}
            </span>
            <p className="truncate text-rose-100 font-medium text-xs sm:text-sm">
              {breakingArticles[0].title}
            </p>
          </div>
          <Link
            href={`/${locale}/news/${breakingArticles[0].slug}`}
            className="flex-shrink-0 px-3 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/40 text-rose-200 font-bold text-xs flex items-center gap-1 transition"
          >
            {t("readFlash")} <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* ── HERO EDITORIAL BANNER ───────────────────────────────────── */}
      <div className="relative border-b border-white/[0.08] bg-gradient-to-b from-[#0B0F17] via-[#080B12] to-[#06080D] px-4 sm:px-8 pt-8 pb-6 sm:pb-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
              <Zap size={14} className="text-cyan-400" /> {t("badge")}
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-none">
              {t("titleLine1")}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">
                {t("titleLine2")}
              </span>
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm max-w-2xl leading-relaxed">
              {t("subtitle")}
            </p>
          </div>

          {/* Butoane Acțiune AI — vizibile doar pentru admin (declanșare pipeline pe cerere) */}
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => handleTriggerAI("all")}
                disabled={generating}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-cyan-500/20 active:scale-95 transition-all disabled:opacity-50"
              >
                <Sparkles size={16} className={generating ? "animate-spin" : ""} />
                {generating ? t("generating") : t("refreshFeedAdmin")}
              </button>
              {selectedCat !== "all" && (
                <button
                  onClick={() => handleTriggerAI(selectedCat)}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-cyan-300 font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 backdrop-blur-md"
                >
                  <RefreshCw size={13} className={generating ? "animate-spin" : ""} />
                  {t("refreshOnly", { category: t(`categories.${selectedCat}`) })}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── CATEGORY PILLS (Horizontal Scroll) ────────────────────── */}
        <div className="max-w-7xl mx-auto mt-8 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORY_SLUGS.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap active:scale-95 ${
                selectedCat === cat
                  ? "bg-white text-slate-950 shadow-lg shadow-white/10 ring-2 ring-cyan-400/50"
                  : "bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <span>{CATEGORY_ICONS[cat]}</span>
              <span>{t(`categories.${cat}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── MAIN CONTENT: EDITORIAL LAYOUT ──────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-10">
        {loading ? (
          <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
            <span className="text-sm font-semibold tracking-wide">{t("syncing")}</span>
          </div>
        ) : articles.length === 0 ? (
          <div className="py-20 text-center max-w-md mx-auto bg-white/[0.02] border border-white/[0.08] rounded-3xl p-8 backdrop-blur-md">
            <Bot size={44} className="mx-auto text-cyan-400 mb-4 opacity-90 animate-bounce" />
            <h3 className="text-lg font-bold text-white mb-2">{t("emptyTitle")}</h3>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              {isAdmin ? t("emptyBodyAdmin") : t("emptyBody")}
            </p>
            {isAdmin && (
              <button
                onClick={() => handleTriggerAI(selectedCat !== "all" ? selectedCat : "all")}
                disabled={generating}
                className="w-full py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition shadow-lg shadow-cyan-500/20"
              >
                {t("launchAi")}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ── HERO LEAD STORY (Featured Top Article) ────────────── */}
            {heroArticle && (
              <div className="relative group rounded-3xl overflow-hidden border border-white/[0.12] bg-[#0E131E] shadow-2xl transition hover:border-cyan-500/40">
                <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[380px]">
                  <div className="lg:col-span-7 relative h-64 sm:h-80 lg:h-full overflow-hidden bg-slate-950">
                    <img
                      src={heroArticle.cover_image_url}
                      alt={heroArticle.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0E131E] via-[#0E131E]/20 to-transparent lg:hidden" />
                    <span className="absolute top-4 left-4 px-3 py-1 bg-black/80 backdrop-blur-md rounded-xl text-xs font-black text-cyan-300 border border-white/10 uppercase tracking-wider">
                      {heroArticle.category_name}
                    </span>
                    <span className="absolute top-4 right-4 px-2.5 py-1 bg-emerald-500 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1 shadow-lg">
                      <ShieldCheck size={14} /> {t("verifiedPct", { pct: heroArticle.fact_check_score })}
                    </span>
                  </div>

                  <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold uppercase text-[10px]">
                          {t("firstToReport")}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> {t("readMinutes", { minutes: heroArticle.reading_time_minutes })}
                        </span>
                      </div>
                      <h2 className="text-xl sm:text-3xl font-black text-white group-hover:text-cyan-300 transition-colors leading-tight">
                        {heroArticle.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-3">
                        {heroArticle.summary_tldr}
                      </p>
                    </div>

                    <Link
                      href={`/${locale}/news/${heroArticle.slug}`}
                      className="inline-flex items-center justify-between w-full px-5 py-3.5 rounded-2xl bg-white text-slate-950 hover:bg-cyan-400 font-black text-xs sm:text-sm transition-all group-hover:shadow-lg group-hover:shadow-cyan-400/20"
                    >
                      <span>{t("readInvestigation")}</span>
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* ── GRID ARTICOLE SECUNDARE ──────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <TrendingUp size={18} className="text-cyan-400" /> {t("recentFeeds")}
                </h3>
                <span className="text-xs text-slate-400">
                  {t("articlesVerified", { count: articles.length })}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {secondaryArticles.map((art) => (
                  <Link
                    key={art.id}
                    href={`/${locale}/news/${art.slug}`}
                    className="group flex flex-col bg-[#0C101A] border border-white/[0.08] hover:border-cyan-500/50 rounded-3xl overflow-hidden shadow-lg hover:shadow-cyan-500/5 transition-all duration-300 active:scale-[0.99]"
                  >
                    {/* Cover Image */}
                    <div className="h-48 sm:h-52 w-full overflow-hidden relative bg-slate-950">
                      <img
                        src={art.cover_image_url}
                        alt={art.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0C101A] via-transparent to-transparent" />
                      <span className="absolute top-3 left-3 px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-lg text-[11px] font-bold text-cyan-300 border border-white/10">
                        {art.category_name}
                      </span>
                      <span className="absolute top-3 right-3 px-2 py-0.5 bg-emerald-500/90 text-slate-950 font-black text-[10px] rounded-md flex items-center gap-1 shadow">
                        <CheckCircle2 size={11} /> {art.fact_check_score}%
                      </span>
                    </div>

                    {/* Content */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <h4 className="font-bold text-base sm:text-lg text-white group-hover:text-cyan-300 transition-colors line-clamp-2 leading-snug">
                          {art.title}
                        </h4>
                        <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                          {art.summary_tldr}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] text-xs text-slate-400">
                        <span className="flex items-center gap-1 text-[11px]">
                          <Clock size={12} /> {t("readMinutes", { minutes: art.reading_time_minutes })}
                        </span>
                        <span className="text-cyan-400 font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1 text-xs">
                          {t("read")} <ArrowRight size={12} />
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
