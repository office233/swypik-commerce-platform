"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Flame,
  Radio,
  Clock,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Filter,
  Bot,
  RefreshCw,
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

const CATEGORIES = [
  { slug: "all", name: "Toate Știrile" },
  { slug: "tech-ai", name: "Tehnologie & AI" },
  { slug: "crypto", name: "Crypto & Web3" },
  { slug: "gaming", name: "Gaming" },
  { slug: "business", name: "Business" },
  { slug: "science", name: "Știință & Spațiu" },
];

export default function NewsFeedPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedCat, setSelectedCat] = useState("all");
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

  const handleTriggerAI = async (catToGen?: string) => {
    setGenerating(true);
    try {
      const res = await fetch("/api/cron/news-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: catToGen || (selectedCat !== "all" ? selectedCat : undefined) }),
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

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100"
      style={{ paddingBottom: "max(84px, calc(72px + env(safe-area-inset-bottom, 0px)))" }}
    >
      {/* ── BREAKING NEWS TICKER ───────────────────────────────────── */}
      {breakingArticles.length > 0 && (
        <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-2 flex items-center gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-600 text-white font-black tracking-wider uppercase flex-shrink-0 text-[10px] sm:text-xs">
            <Radio size={13} className="animate-pulse" /> BREAKING
          </div>
          <div className="flex-1 overflow-hidden whitespace-nowrap text-rose-200 truncate">
            <span className="font-semibold">{breakingArticles[0].title}</span>
          </div>
          <Link
            href={`/news/${breakingArticles[0].slug}`}
            className="text-rose-400 hover:text-white font-bold flex items-center gap-1 transition flex-shrink-0 text-xs"
          >
            Citește <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* ── HERO BANNER ────────────────────────────────────────────── */}
      <div className="border-b border-slate-800/80 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 px-4 py-6 sm:py-10 sm:px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[11px] font-semibold uppercase tracking-wider mb-2.5">
              <Bot size={13} /> Jurnalist AI Autonom Multi-Categorie
            </div>
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-2">
              Swypik <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">AI News</span>
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm max-w-xl leading-relaxed">
              Știri sintetizate și verificate factual în timp real de AI-ul Swypik pe Tech, Crypto, Gaming, Business și Știință.
            </p>
          </div>

          {/* Butoane generare AI */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleTriggerAI("all")}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-cyan-500/20 transition active:scale-95 disabled:opacity-50"
            >
              <Sparkles size={15} className={generating ? "animate-spin" : ""} />
              {generating ? "AI generează știri..." : "Generează Toate Categoriile"}
            </button>
            {selectedCat !== "all" && (
              <button
                onClick={() => handleTriggerAI(selectedCat)}
                disabled={generating}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-400 font-bold text-xs shadow transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={13} className={generating ? "animate-spin" : ""} />
                Doar această categorie
              </button>
            )}
          </div>
        </div>

        {/* ── CATEGORY PILLS (Mobile-first horizontal scroll) ─────── */}
        <div className="max-w-6xl mx-auto mt-6 flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => setSelectedCat(cat.slug)}
              className={`px-3.5 py-2 rounded-full text-xs sm:text-sm font-bold transition whitespace-nowrap active:scale-95 ${
                selectedCat === cat.slug
                  ? "bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-md shadow-cyan-500/10"
                  : "bg-slate-900/90 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── MAIN ARTICLE GRID ──────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
            <span>Se încarcă știrile AI...</span>
          </div>
        ) : articles.length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800/80 p-8 max-w-lg mx-auto">
            <Bot size={36} className="mx-auto text-cyan-400 mb-3 opacity-80" />
            <h3 className="font-bold text-white text-base mb-1">Niciun articol în această categorie încă</h3>
            <p className="text-xs text-slate-400 mb-4">Apasă butonul de mai sus pentru ca jurnalistul AI autonom să genereze știri proaspete.</p>
            <button
              onClick={() => handleTriggerAI(selectedCat !== "all" ? selectedCat : "all")}
              disabled={generating}
              className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition"
            >
              Lansează Jurnalistul AI
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {articles.map((art) => (
              <Link
                key={art.id}
                href={`/news/${art.slug}`}
                className="group flex flex-col bg-slate-900/90 border border-slate-800/90 hover:border-cyan-500/50 rounded-2xl overflow-hidden shadow-lg hover:shadow-cyan-500/5 transition duration-200 active:scale-[0.99]"
              >
                {/* Cover Image */}
                <div className="h-44 sm:h-48 w-full overflow-hidden relative bg-slate-950">
                  <img
                    src={art.cover_image_url}
                    alt={art.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                  <span className="absolute top-3 left-3 px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-md text-[11px] font-bold text-cyan-300 border border-white/10">
                    {art.category_name}
                  </span>
                  <span className="absolute top-3 right-3 px-2 py-0.5 bg-emerald-500/95 text-slate-950 font-black text-[10px] rounded flex items-center gap-1 shadow">
                    <CheckCircle2 size={11} /> {art.fact_check_score}% Factual
                  </span>
                </div>

                {/* Content */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-white group-hover:text-cyan-300 transition line-clamp-2 mb-2 leading-snug">
                      {art.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed mb-4">
                      {art.summary_tldr}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                    <span className="flex items-center gap-1 text-[11px]">
                      <Clock size={12} /> {art.reading_time_minutes} min lectură
                    </span>
                    <span className="text-cyan-400 font-bold group-hover:translate-x-1 transition flex items-center gap-1 text-xs">
                      Citește <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
