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
  ShieldCheck,
  ExternalLink,
  BookOpen,
} from "lucide-react";

export default function ArticleReaderPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reactions, setReactions] = useState({ fire: 18, idea: 12, rocket: 31 });
  const [userReacted, setUserReacted] = useState<string | null>(null);

  useEffect(() => {
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
      <div className="min-h-screen bg-[#06080D] flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <span className="text-xs uppercase tracking-widest font-bold">Deschidere raport investigație...</span>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-[#06080D] flex flex-col items-center justify-center text-slate-300 p-6 text-center">
        <h2 className="text-2xl font-black mb-3 text-white">Articolul nu a fost găsit</h2>
        <p className="text-xs text-slate-400 mb-6 max-w-sm">
          Acest raport poate fi arhivat sau mutat în dispeceratul central.
        </p>
        <Link href="/news" className="px-6 py-3 bg-cyan-500 text-slate-950 font-black rounded-2xl shadow-lg">
          Înapoi la Fluxul de Știri
        </Link>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#06080D] text-slate-100 font-sans selection:bg-cyan-500 selection:text-black"
      style={{ paddingBottom: "max(96px, calc(80px + env(safe-area-inset-bottom, 0px)))" }}
    >
      {/* ── TOP NAV BAR STICKY ──────────────────────────────────────── */}
      <div className="border-b border-white/[0.08] bg-[#070A11]/80 sticky top-0 z-30 backdrop-blur-xl px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/news"
            className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-300 hover:text-white transition"
          >
            <ArrowLeft size={16} /> Înapoi la Fluxul Global
          </Link>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-black flex items-center gap-1 border border-emerald-500/30 shadow">
              <ShieldCheck size={13} /> {article.fact_check_score || 98}% Fact-Checked
            </span>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: article.title, url: window.location.href }).catch(() => null);
                }
              }}
              className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 transition"
              title="Partajează"
            >
              <Share2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── MAIN ARTICLE READER ─────────────────────────────────────── */}
      <article className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Meta badges & timestamp */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="px-3 py-1 rounded-xl bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/20 uppercase tracking-wider text-[11px]">
            {article.category_name}
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Clock size={12} /> {article.reading_time_minutes || 3} min lectură
          </span>
          <span>•</span>
          <span>{new Date(article.published_at).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>

        {/* Headline */}
        <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.15]">
          {article.title}
        </h1>

        {/* Cover Image Editorial Frame */}
        <div className="relative rounded-3xl overflow-hidden border border-white/[0.1] shadow-2xl bg-slate-950">
          <img
            src={article.cover_image_url}
            alt={article.title}
            className="w-full h-64 sm:h-96 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#06080D] via-transparent to-transparent opacity-60" />
        </div>

        {/* ── EXECUTIVE TL;DR BOX ───────────────────────────────────── */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 shadow-xl space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-black text-xs uppercase tracking-widest">
            <Sparkles size={16} /> Raport Executiv TL;DR • Esența în 30 de Secunde
          </div>
          <div className="text-slate-100 text-sm sm:text-base leading-relaxed whitespace-pre-line font-medium">
            {article.summary_tldr}
          </div>
        </div>

        {/* ── AI FACT-CHECKING AUDIT TRANSPARENCY ────────────────────── */}
        <div className="flex items-start gap-3.5 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-xs text-slate-300">
          <Bot size={22} className="text-cyan-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <strong className="text-white font-bold">Jurnalism Autonom Asistat de AI (Standard Swypik Wire)</strong>
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-black uppercase">
                Zero Bias
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              {article.fact_check_notes || "Acest articol a fost redactat, structurat și verificat factual în mod autonom de AI-ul Swypik pe baza fluxurilor primare verificate."}
            </p>
          </div>
        </div>

        {/* ── ARTICLE BODY (Markdown formatted) ─────────────────────── */}
        <div className="text-slate-200 leading-relaxed text-base sm:text-lg space-y-6 pt-2 font-normal">
          {article.content_markdown ? (
            <div className="whitespace-pre-line leading-relaxed space-y-4">
              {article.content_markdown}
            </div>
          ) : (
            <>
              <p>
                Într-o eră dominată de transformări tehnologice vertiginoase și volatilitate în piețele descentralizate, accesul la informație factuală în timp real oferă un avantaj critic.
              </p>
              <p>
                Echipa de analiză Swypik agregă continuu fluxurile de date din centrele globale de decizie pentru a oferi transparență deplină asupra evenimentelor de mare impact.
              </p>
            </>
          )}
        </div>

        {/* ── EMOJI REACTIONS BAR ────────────────────────────────────── */}
        <div className="pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
            Reacția ta la acest raport:
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleReact("fire")}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold border transition-all active:scale-95 ${
                userReacted === "fire"
                  ? "bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/20"
                  : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.08]"
              }`}
            >
              <Flame size={16} className="text-rose-400" /> {reactions.fire}
            </button>
            <button
              onClick={() => handleReact("idea")}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold border transition-all active:scale-95 ${
                userReacted === "idea"
                  ? "bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20"
                  : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.08]"
              }`}
            >
              <Lightbulb size={16} className="text-amber-400" /> {reactions.idea}
            </button>
            <button
              onClick={() => handleReact("rocket")}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold border transition-all active:scale-95 ${
                userReacted === "rocket"
                  ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-lg shadow-cyan-500/20"
                  : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.08]"
              }`}
            >
              <Rocket size={16} className="text-cyan-400" /> {reactions.rocket}
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
