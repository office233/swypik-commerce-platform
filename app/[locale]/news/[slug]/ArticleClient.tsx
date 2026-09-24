"use client";

import { useEffect, useState, Fragment, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  ArrowLeft,
  Clock,
  Share2,
  Bot,
  Flame,
  Lightbulb,
  Rocket,
  Sparkles,
  ShieldCheck,
  ExternalLink,
  MessageCircle,
  Trash2,
} from "lucide-react";
import type { NewsArticleDetail } from "@/lib/news/repository";

// ── Safe markdown rendering ────────────────────────────────────────────
// No react-markdown / dompurify dependency in this repo (checked package.json),
// so content_markdown is parsed into plain React nodes below — never through
// dangerouslySetInnerHTML — which rules out any raw-HTML injection from the
// AI-generated (or, in theory, tampered) markdown string.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

function renderMarkdown(markdown: string): ReactNode {
  const lines = (markdown || "").split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let paragraphBuf: string[] = [];
  let listBuf: string[] = [];

  const flushParagraph = (key: string) => {
    if (paragraphBuf.length === 0) return;
    const text = paragraphBuf.join(" ").trim();
    if (text) {
      blocks.push(
        <p key={key} className="leading-relaxed">
          {renderInline(text, key)}
        </p>
      );
    }
    paragraphBuf = [];
  };

  const flushList = (key: string) => {
    if (listBuf.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc pl-5 space-y-1">
        {listBuf.map((item, i) => (
          <li key={`${key}-li-${i}`}>{renderInline(item, `${key}-li-${i}`)}</li>
        ))}
      </ul>
    );
    listBuf = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const key = `b-${idx}`;

    if (!line) {
      flushParagraph(`p-${idx}`);
      flushList(`l-${idx}`);
      return;
    }

    if (line.startsWith("## ")) {
      flushParagraph(`p-${idx}`);
      flushList(`l-${idx}`);
      blocks.push(
        <h2 key={key} className="text-xl sm:text-2xl font-black text-white mt-8 mb-2">
          {renderInline(line.slice(3), key)}
        </h2>
      );
      return;
    }

    if (line.startsWith("> ")) {
      flushParagraph(`p-${idx}`);
      flushList(`l-${idx}`);
      blocks.push(
        <blockquote
          key={key}
          className="border-l-4 border-cyan-500/60 pl-4 italic text-slate-300 bg-white/[0.03] py-2 rounded-r-xl"
        >
          {renderInline(line.slice(2), key)}
        </blockquote>
      );
      return;
    }

    if (line.startsWith("- ")) {
      flushParagraph(`p-${idx}`);
      listBuf.push(line.slice(2));
      return;
    }

    flushList(`l-${idx}`);
    paragraphBuf.push(line);
  });

  flushParagraph("p-end");
  flushList("l-end");

  return blocks;
}

// ── Component ───────────────────────────────────────────────────────────

// Tailwind classes must be statically greppable — no `bg-${color}-500` interpolation.
const REACTION_TYPES = [
  { type: "fire", icon: Flame, activeClass: "bg-rose-500 text-white border-rose-400 shadow-lg", iconClass: "text-rose-400" },
  { type: "insightful", icon: Lightbulb, activeClass: "bg-amber-500 text-slate-950 border-amber-400 shadow-lg", iconClass: "text-amber-400" },
  { type: "rocket", icon: Rocket, activeClass: "bg-cyan-500 text-slate-950 border-cyan-400 shadow-lg", iconClass: "text-cyan-400" },
] as const;

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  author: { displayName: string | null; username: string | null };
  /** True when the signed-in viewer wrote this comment (only they may delete it). */
  isOwn?: boolean;
}

export default function ArticleClient({ article }: { article: NewsArticleDetail }) {
  const t = useTranslations("news");
  const locale = useLocale();

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<string[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/news/${article.slug}/reactions`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setCounts(d.counts || {});
          setMine(d.mine || []);
        }
      })
      .catch(() => null);

    fetch(`/api/news/${article.slug}/comments`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.items)) {
          setComments(d.items);
          setCommentsHasMore(Boolean(d.hasMore));
        }
      })
      .catch(() => null);
  }, [article.slug]);

  const loadMoreComments = async () => {
    setCommentsLoadingMore(true);
    try {
      const res = await fetch(`/api/news/${article.slug}/comments?offset=${comments.length}`);
      const d = await res.json();
      if (res.ok && d.ok && Array.isArray(d.items)) {
        const seen = new Set(comments.map((c) => c.id));
        setComments((prev) => [...prev, ...(d.items as CommentItem[]).filter((c) => !seen.has(c.id))]);
        setCommentsHasMore(Boolean(d.hasMore));
      }
    } catch {
      setCommentError(t("comments.loadMoreError"));
    } finally {
      setCommentsLoadingMore(false);
    }
  };

  const toggleReaction = async (reactionType: string) => {
    const already = mine.includes(reactionType);
    setMine((prev) => (already ? prev.filter((r) => r !== reactionType) : [...prev, reactionType]));
    setCounts((prev) => ({ ...prev, [reactionType]: Math.max(0, (prev[reactionType] || 0) + (already ? -1 : 1)) }));

    try {
      if (already) {
        await fetch(`/api/news/${article.slug}/reactions?reaction_type=${reactionType}`, { method: "DELETE" });
      } else {
        await fetch(`/api/news/${article.slug}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reaction_type: reactionType }),
        });
      }
    } catch {
      // best-effort UI; a background refetch would reconcile drift
    }
  };

  const submitComment = async () => {
    if (commentText.trim().length < 2) return;
    setCommentBusy(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/news/${article.slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setCommentError(data.error === "unauthorized" ? t("comments.loginRequired") : t("comments.error"));
        return;
      }
      setComments((prev) => [
        { id: data.id, content: commentText.trim(), createdAt: data.createdAt, author: { displayName: t("comments.you"), username: null }, isOwn: true },
        ...prev,
      ]);
      setCommentText("");
    } catch {
      setCommentError(t("comments.error"));
    } finally {
      setCommentBusy(false);
    }
  };

  const deleteComment = async (id: string) => {
    const snapshot = comments;
    setComments((prev) => prev.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/news/${article.slug}/comments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      // Rollback the optimistic removal and tell the user.
      setComments(snapshot);
      setCommentError(t("comments.error"));
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div
      className="min-h-screen bg-[#06080D] text-slate-100 font-sans selection:bg-cyan-500 selection:text-black"
      style={{ paddingBottom: "max(96px, calc(80px + env(safe-area-inset-bottom, 0px)))" }}
    >
      {/* ── TOP NAV BAR STICKY ──────────────────────────────────────── */}
      <div className="border-b border-white/[0.08] bg-[#070A11]/80 sticky top-0 z-30 backdrop-blur-xl px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href={`/${locale}/news`}
            className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-300 hover:text-white transition"
          >
            <ArrowLeft size={16} /> {t("backToFeed")}
          </Link>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-black flex items-center gap-1 border border-emerald-500/30 shadow">
              <ShieldCheck size={13} /> {t("verifiedPct", { pct: article.fact_check_score })}
            </span>
            <button
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.share) {
                  navigator.share({ title: article.title, url: window.location.href }).catch(() => null);
                }
              }}
              className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 transition"
              title={t("share")}
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
            <Clock size={12} /> {t("readMinutes", { minutes: article.reading_time_minutes })}
          </span>
          <span>•</span>
          <span>{formatDate(article.published_at)}</span>
        </div>

        {/* Headline */}
        <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.15]">
          {article.title}
        </h1>

        {/* Cover Image Editorial Frame */}
        <div className="relative rounded-3xl overflow-hidden border border-white/[0.1] shadow-2xl bg-slate-950">
          <img src={article.cover_image_url} alt={article.title} className="w-full h-64 sm:h-96 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#06080D] via-transparent to-transparent opacity-60" />
        </div>

        {/* ── EXECUTIVE TL;DR BOX ───────────────────────────────────── */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 shadow-xl space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-black text-xs uppercase tracking-widest">
            <Sparkles size={16} /> {t("tldrBadge")}
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
              <strong className="text-white font-bold">{t("aiJournalismStandard")}</strong>
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-black uppercase">
                {t("zeroBias")}
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              {article.fact_check_notes || t("factCheckFallback")}
            </p>
          </div>
        </div>

        {/* ── LEGAL: AI DISCLAIMER + ORIGINAL SOURCE ─────────────────── */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3 text-xs text-slate-400">
          <p className="leading-relaxed">{article.ai_disclaimer}</p>
          {article.sources.length > 0 && (
            <div className="pt-3 border-t border-white/[0.06] space-y-2">
              <span className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                {t("source.label")}
              </span>
              {article.sources.map((s, i) => (
                <a
                  key={i}
                  href={s.original_url}
                  target="_blank"
                  rel="noopener nofollow"
                  className="flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 font-semibold"
                >
                  <ExternalLink size={12} />
                  {s.source_name || s.original_title || s.original_url}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── ARTICLE BODY (Markdown rendered as plain React nodes) ─── */}
        <div className="text-slate-200 text-base sm:text-lg space-y-4 pt-2 font-normal">
          {renderMarkdown(article.content_markdown)}
        </div>

        {/* ── EMOJI REACTIONS BAR ────────────────────────────────────── */}
        <div className="pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{t("yourReaction")}</span>
          <div className="flex items-center gap-3">
            {REACTION_TYPES.map(({ type, icon: Icon, activeClass, iconClass }) => {
              const active = mine.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleReaction(type)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold border transition-all active:scale-95 ${
                    active ? activeClass : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.08]"
                  }`}
                >
                  <Icon size={16} className={iconClass} /> {counts[type] || 0}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── COMMENTS ─────────────────────────────────────────────── */}
        <div className="pt-8 border-t border-white/[0.08] space-y-5">
          <h3 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-widest">
            <MessageCircle size={16} className="text-cyan-400" /> {t("comments.title", { count: comments.length })}
          </h3>

          <div className="space-y-2">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={t("comments.placeholder")}
              className="w-full rounded-2xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            <div className="flex items-center justify-between">
              {commentError && <span className="text-xs text-rose-400">{commentError}</span>}
              <button
                onClick={submitComment}
                disabled={commentBusy || commentText.trim().length < 2}
                className="ml-auto px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition"
              >
                {t("comments.submit")}
              </button>
            </div>
          </div>

          <ul className="space-y-4">
            {comments.map((c) => (
              <li key={c.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold text-slate-200">
                    {c.author.displayName || c.author.username || t("comments.anonymous")}
                  </span>
                  <div className="flex items-center gap-2">
                    <span>{formatDate(c.createdAt)}</span>
                    {c.isOwn && (
                      <button
                        type="button"
                        onClick={() => deleteComment(c.id)}
                        className="text-slate-500 hover:text-rose-400 transition"
                        title={t("comments.delete")}
                        aria-label={t("comments.delete")}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{c.content}</p>
              </li>
            ))}
            {comments.length === 0 && (
              <li className="text-xs text-slate-500 text-center py-4">{t("comments.empty")}</li>
            )}
            {commentsHasMore && (
              <li className="text-center">
                <button
                  type="button"
                  onClick={loadMoreComments}
                  disabled={commentsLoadingMore}
                  className="text-xs font-bold text-slate-300 hover:text-white disabled:opacity-50 transition"
                >
                  {commentsLoadingMore ? t("comments.loadingMore") : t("comments.loadMore")}
                </button>
              </li>
            )}
          </ul>
        </div>
      </article>
    </div>
  );
}
