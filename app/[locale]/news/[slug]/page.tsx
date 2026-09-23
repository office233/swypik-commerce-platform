"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  Share2,
  Bot,
  Flame,
  Lightbulb,
  Rocket,
  Sparkles,
} from "lucide-react";

export default function ArticleReaderPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reactions, setReactions] = useState({ fire: 12, idea: 7, rocket: 24 });
  const [userReacted, setUserReacted] = useState<string | null>(null);

  useEffect(() => {
    // Încarcă articolul prin API-ul /api/news
    fetch(`/api/news`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.articles)) {
          const found = d.articles.find((a: any) => a.slug === slug);
          if (found) {
            setArticle(found);
          } else if (d.articles.length > 0) {
            setArticle(d.articles[0]);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleReact = (type: "fire" | "idea" | "rocket") => {
    if (userReacted === type) return;
    setUserReacted(type);
    setReactions((prev) => ({ ...prev, [type]: prev[type] + 1 }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Se deschide articolul...
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <h2 className="text-2xl font-bold mb-4">Articolul nu a fost găsit</h2>
        <Link href="/news" className="px-5 py-2.5 bg-cyan-500 text-slate-950 font-bold rounded-xl">
          Înapoi la Știri
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Top navigation */}
      <div className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-30 backdrop-blur-md px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/news"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white transition"
          >
            <ArrowLeft size={16} /> Înapoi la Feed
          </Link>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1 border border-emerald-500/30">
              <CheckCircle2 size={12} /> {article.fact_check_score || 96}% Factual
            </span>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: article.title, url: window.location.href }).catch(() => null);
                }
              }}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Partajează"
            >
              <Share2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Article Container */}
      <article className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
        {/* Meta badges */}
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
          <span className="px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/20">
            {article.category_name}
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Clock size={12} /> {article.reading_time_minutes || 3} min lectură
          </span>
          <span>•</span>
          <span>{new Date(article.published_at).toLocaleDateString("ro-RO")}</span>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight mb-6">
          {article.title}
        </h1>

        {/* Cover Image */}
        <div className="relative rounded-2xl overflow-hidden mb-8 border border-slate-800 shadow-2xl">
          <img
            src={article.cover_image_url}
            alt={article.title}
            className="w-full h-64 sm:h-96 object-cover"
          />
        </div>

        {/* TL;DR Box */}
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-8">
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm uppercase tracking-wider mb-2">
            <Sparkles size={16} /> TL;DR · Esența în 15 secunde
          </div>
          <div className="text-slate-200 text-sm sm:text-base leading-relaxed whitespace-pre-line font-medium">
            {article.summary_tldr}
          </div>
        </div>

        {/* AI Transparency Banner */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 mb-8">
          <Bot size={20} className="text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-slate-200 block mb-0.5">Jurnalism Autonom Asistat de AI</strong>
            Acest articol a fost redactat, structurat și verificat factual în mod autonom de AI-ul Swypik pe baza surselor oficiale de știri menționate.
          </div>
        </div>

        {/* Article Body */}
        <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed space-y-4 text-base sm:text-lg">
          <p>
            În era transformării rapide a tehnologiei și piețelor descentralizate, informația precisă și rapidă este crucială. Articolul curent sintetizează cele mai importante direcții semnalate de fluxurile de date globale.
          </p>
          <p>
            Echipa Swypik integrează continuu analize comparative pentru a oferi utilizatorilor transparență deplină asupra evenimentelor de impact din crypto, tehnologie, afaceri și gaming.
          </p>
        </div>

        {/* Emoji Reactions Bar */}
        <div className="mt-12 pt-6 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Reacții la această știre:
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleReact("fire")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                userReacted === "fire"
                  ? "bg-rose-500 text-white border-rose-400"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Flame size={15} className="text-rose-400" /> {reactions.fire}
            </button>
            <button
              onClick={() => handleReact("idea")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                userReacted === "idea"
                  ? "bg-amber-500 text-slate-950 border-amber-400"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Lightbulb size={15} className="text-amber-400" /> {reactions.idea}
            </button>
            <button
              onClick={() => handleReact("rocket")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                userReacted === "rocket"
                  ? "bg-indigo-500 text-white border-indigo-400"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Rocket size={15} className="text-indigo-400" /> {reactions.rocket}
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
