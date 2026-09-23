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

  const handleTriggerAI = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/cron/news-pipeline", { method: "POST" });
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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* ── BREAKING NEWS TICKER ───────────────────────────────────── */}
      {breakingArticles.length > 0 && (
        <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-2 flex items-center gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-600 text-white font-black tracking-wider uppercase">
            <Radio size={14} className="animate-pulse" /> BREAKING
          </div>
          <div className="flex-1 overflow-hidden whitespace-nowrap text-rose-200">
            <span className="font-semibold">{breakingArticles[0].title}</span>
          </div>
          <Link
            href={`/news/${breakingArticles[0].slug}`}
            className="text-rose-400 hover:text-white font-bold flex items-center gap-1 transition"
          >
            Citește <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* ── HERO BANNER ────────────────────────────────────────────── */}
      <div className="border-b border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 px-4 py-10 sm:px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <Bot size={14} /> Jurnalist AI Autonom
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight mb-2">
              Swypik <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">AI News</span>
            </h1>
            <p className="text-slate-400 text-sm sm:text-base max-w-xl">
              Știri verificate în timp real, redactate și sintetizate autonom de inteligența artificială Swypik din surse globale de top.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTriggerAI}
              disabled={generating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg transition active:scale-95 disabled:opacity-50"
            >
              <Sparkles size={16} className={generating ? "animate-spin" : ""} />
              {generating ? "AI scrie știri noi..." : "Generează Știri AI Acum"}
            </button>
          </div>
        </div>

        {/* ── CATEGORY PILLS ────────────────────────────────────────── */}
        <div className="max-w-6xl mx-auto mt-8 flex items-center gap-2 overflow-x-auto pb-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => setSelectedCat(cat.slug)}
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition whitespace-nowrap ${
                selectedCat === cat.slug
                  ? "bg-cyan-500 text-slate-950 shadow-md"
                  : "bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── MAIN ARTICLE GRID ──────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        {loading ? (
          <div className="py-20 text-center text-slate-400">Se încarcă știrile AI...</div>
        ) : articles.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            Nu sunt știri în această categorie. Apasă „Generează Știri AI Acum” pentru a rula jurnalistul autonom!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((art) => (
              <Link
                key={art.id}
                href={`/news/${art.slug}`}
                className="group flex flex-col bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-2xl overflow-hidden shadow-lg transition duration-200"
              >
                {/* Cover Image */}
                <div className="h-48 w-full overflow-hidden relative">
                  <img
                    src={art.cover_image_url}
                    alt={art.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                  <span className="absolute top-3 left-3 px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-md text-xs font-semibold text-cyan-300 border border-white/10">
                    {art.category_name}
                  </span>
                  <span className="absolute top-3 right-3 px-2 py-0.5 bg-emerald-500/90 text-slate-950 font-extrabold text-[11px] rounded flex items-center gap-1 shadow">
                    <CheckCircle2 size={12} /> {art.fact_check_score}% Factual
                  </span>
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-white group-hover:text-cyan-300 transition line-clamp-2 mb-2">
                      {art.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed mb-4">
                      {art.summary_tldr}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock size={13} /> {art.reading_time_minutes} min lectură
                    </span>
                    <span className="text-cyan-400 font-bold group-hover:translate-x-1 transition flex items-center gap-1">
                      Citește <ArrowRight size={13} />
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
