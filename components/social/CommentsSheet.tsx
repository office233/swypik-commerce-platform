"use client";

import { useTranslations } from "next-intl";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, Loader2, MessageCircle, RefreshCw, Reply, Send, X } from "lucide-react";

type CommentAuthor = {
  id: string | null;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
};

type CommentItem = {
  id: string;
  videoId: string;
  userId: string | null;
  parentCommentId: string | null;
  text: string;
  status: "visible" | "hidden" | "deleted" | "flagged";
  likeCount: number;
  replyCount: number;
  createdAt: string;
  author: CommentAuthor;
  replies: CommentItem[];
};

type Props = {
  open: boolean;
  videoId: string | null;
  initialCount?: string | number | null;
  onClose: () => void;
  onCountChange?: (nextCount: number) => void;
};

function parseCount(value: Props["initialCount"]): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

function displayName(author: CommentAuthor): string {
  return author.displayName || author.username || "Comunitate";
}

function relativeTime(value: string): string {
  const created = new Date(value).getTime();
  if (!Number.isFinite(created)) return "";

  const diffSeconds = Math.max(1, Math.floor((Date.now() - created) / 1000));
  if (diffSeconds < 60) return "acum";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}z`;
}

export default function CommentsSheet({ open, videoId, initialCount, onClose, onCountChange }: Props) {
  const t = useTranslations("commentsSheet");
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [count, setCount] = useState(() => parseCount(initialCount));
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likePending, setLikePending] = useState<Set<string>>(new Set());

  const toggleCommentLike = useCallback(async (commentId: string) => {
    if (likePending.has(commentId)) return;
    setLikePending((s) => { const n = new Set(s); n.add(commentId); return n; });
    const wasLiked = likedIds.has(commentId);
    setLikedIds((s) => { const n = new Set(s); if (wasLiked) n.delete(commentId); else n.add(commentId); return n; });
    setComments((list) => list.map((c) => {
      if (c.id === commentId) return { ...c, likeCount: Math.max(0, c.likeCount + (wasLiked ? -1 : 1)) };
      return { ...c, replies: c.replies.map((r) => r.id === commentId ? { ...r, likeCount: Math.max(0, r.likeCount + (wasLiked ? -1 : 1)) } : r) };
    }));
    try {
      const res = await fetch(`/api/comments/${commentId}/like`, { method: 'POST' });
      if (!res.ok) throw new Error('Like failed');
      const data = await res.json();
      setLikedIds((s) => { const n = new Set(s); if (data.liked) n.add(commentId); else n.delete(commentId); return n; });
      setComments((list) => list.map((c) => {
        if (c.id === commentId) return { ...c, likeCount: data.like_count };
        return { ...c, replies: c.replies.map((r) => r.id === commentId ? { ...r, likeCount: data.like_count } : r) };
      }));
    } catch {
      setLikedIds((s) => { const n = new Set(s); if (wasLiked) n.add(commentId); else n.delete(commentId); return n; });
      setComments((list) => list.map((c) => {
        if (c.id === commentId) return { ...c, likeCount: Math.max(0, c.likeCount + (wasLiked ? 1 : -1)) };
        return { ...c, replies: c.replies.map((r) => r.id === commentId ? { ...r, likeCount: Math.max(0, r.likeCount + (wasLiked ? 1 : -1)) } : r) };
      }));
    } finally {
      setLikePending((s) => { const n = new Set(s); n.delete(commentId); return n; });
    }
  }, [likedIds, likePending]);

  const sheetRef = useRef<HTMLElement | null>(null);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape close + focus trap
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    setTimeout(() => sheetRef.current?.querySelector<HTMLElement>('button, a[href], input, textarea')?.focus(), 50);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setCount(parseCount(initialCount));
  }, [initialCount, open]);

  const loadComments = useCallback(async () => {
    if (!open || !videoId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/videos/${videoId}/comments?limit=30`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || t("errNuAmIncarcat"));

      setComments(Array.isArray(data.comments) ? data.comments : []);
      if (typeof data.totalCount === "number") setCount(data.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errNuAmIncarcat"));
    } finally {
      setLoading(false);
    }
  }, [open, videoId]);

  useEffect(() => {
    if (!open) return;
    setText("");
    setReplyTo(null);
    setNotice(null);
    loadComments();
  }, [loadComments, open]);

  const remaining = useMemo(() => 500 - text.trim().length, [text]);

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!videoId || submitting) return;

    const trimmed = text.trim();
    if (!trimmed) {
      setError(t("errScrieComentariu"));
      return;
    }
    if (trimmed.length > 500) {
      setError(t("errMaxLength"));
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/videos/${videoId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          parent_comment_id: replyTo?.id || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || t("errNuTrimis"));

      const posted = data.comment as CommentItem | undefined;
      const nextCount = Number(data.comment_count);
      if (Number.isFinite(nextCount)) {
        setCount(nextCount);
        onCountChange?.(nextCount);
      }

      if (posted?.status === "visible") {
        if (posted.parentCommentId) {
          setComments((current) =>
            current.map((comment) =>
              comment.id === posted.parentCommentId
                ? {
                    ...comment,
                    replyCount: comment.replyCount + 1,
                    replies: [...comment.replies, posted],
                  }
                : comment,
            ),
          );
        } else {
          setComments((current) => [posted, ...current]);
        }
      } else {
        setNotice(t("trimisLaModerare"));
      }

      setText("");
      setReplyTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errNuTrimis"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !videoId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label={t("inchideAria")} />
      <section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="comments-title" tabIndex={-1} className="relative flex h-[68vh] max-h-[720px] flex-col rounded-t-3xl bg-white text-[#0D0D0D] shadow-2xl animate-feed-slide">
        <header className="flex items-center justify-between border-b border-[#E5E5E5] px-5 py-4">
          <div>
            <h2 id="comments-title" className="text-base font-black">{t("comentarii")}</h2>
            <p className="text-xs font-semibold text-[#6E6E80]">{count} {t("totalLabel")}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-[#F7F7F8] p-2 text-[#6E6E80]" aria-label={t("inchideAria")}>
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center text-[#6E6E80]">
              <Loader2 className="mb-3 animate-spin" size={28} />
              <p className="text-sm font-bold">{t("seIncarca")}</p>
            </div>
          ) : error && comments.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-[#6E6E80]">
              <MessageCircle size={42} className="mb-3 text-[#D1D1D6]" />
              <p className="text-sm font-bold">{error}</p>
              <button type="button" onClick={loadComments} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0D0D0D] px-4 py-2 text-sm font-bold text-white">
                <RefreshCw size={16} />
                {t("reincearca")}
              </button>
            </div>
          ) : comments.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-[#6E6E80]">
              <MessageCircle size={48} className="mb-4 text-[#D1D1D6]" />
              <p className="text-base font-black text-[#0D0D0D]">{t("nuSuntComentarii")}</p>
              <p className="mt-1 text-sm">{t("incepeConversatia")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <CommentBlock key={comment.id} comment={comment} onReply={setReplyTo} onLike={toggleCommentLike} likedIds={likedIds} likingIds={likePending} />
              ))}
            </div>
          )}
        </div>

        {(error && comments.length > 0) || notice ? (
          <div className="mx-5 mb-2 rounded-xl bg-[#F7F7F8] px-3 py-2 text-xs font-semibold text-[#6E6E80]">
            {notice || error}
          </div>
        ) : null}

        {replyTo && (
          <div className="mx-5 mb-2 flex items-center justify-between rounded-xl bg-[#F7F7F8] px-3 py-2 text-xs font-bold text-[#6E6E80]">
            <span>{t("raspunziLui")} {displayName(replyTo.author)}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="text-[#0D0D0D]">
              {t("renunta")}
            </button>
          </div>
        )}

        <form onSubmit={submitComment} className="border-t border-[#E5E5E5] px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={1}
                maxLength={520}
                placeholder={replyTo ? t("scrieRaspuns") : t("adaugaComentariu")}
                className="max-h-28 min-h-[44px] w-full resize-none rounded-2xl border border-[#E5E5E5] bg-[#F7F7F8] px-4 py-3 text-sm font-semibold outline-none focus:border-[#0D0D0D]"
              />
              <p className={`mt-1 text-right text-[11px] font-semibold ${remaining < 0 ? "text-[#EF4444]" : "text-[#8E8E93]"}`}>{remaining}</p>
            </div>
            <button
              type="submit"
              disabled={submitting || text.trim().length === 0 || remaining < 0}
              className="grid h-11 w-11 place-items-center rounded-full bg-[#0D0D0D] text-white disabled:bg-[#C7C7CC]"
              aria-label={t("trimiteComentariul")}
            >
              {submitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CommentBlock({ comment, onReply, onLike, likedIds, likingIds }: { comment: CommentItem; onReply: (comment: CommentItem) => void; onLike: (id: string) => void; likedIds: Set<string>; likingIds: Set<string> }) {
  const t = useTranslations("commentsSheet");
  return (
    <article>
      <div className="flex gap-3">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[#0D0D0D] text-sm font-black text-white">
          {displayName(comment.author).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-black">{displayName(comment.author)}</p>
            <span className="text-xs font-semibold text-[#8E8E93]">{relativeTime(comment.createdAt)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-[#1D1D1F]">{comment.text}</p>
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              aria-label={likedIds.has(comment.id) ? t("anuleazaAprecierea") : t("apreciazaComentariul")}
              aria-pressed={likedIds.has(comment.id)}
              disabled={likingIds.has(comment.id)}
              onClick={() => onLike(comment.id)}
              className={"inline-flex items-center gap-1 text-xs font-black disabled:opacity-60 " + (likedIds.has(comment.id) ? "text-[#FE2C55]" : "text-[#6E6E80]")}
            >
              <Heart size={13} fill={likedIds.has(comment.id) ? "#FE2C55" : "none"} />
              {comment.likeCount > 0 ? comment.likeCount : ""}
            </button>
            <button type="button" onClick={() => onReply(comment)} className="inline-flex items-center gap-1 text-xs font-black text-[#6E6E80]">
              <Reply size={13} />
              {t("raspunde")}
            </button>
          </div>
        </div>
      </div>

      {comment.replies.length > 0 && (
        <div className="ml-12 mt-3 space-y-3 border-l border-[#E5E5E5] pl-3">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex gap-2">
              <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-[#F7F7F8] text-xs font-black text-[#6E6E80]">
                {displayName(reply.author).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs font-black">{displayName(reply.author)}</p>
                  <span className="text-[11px] font-semibold text-[#8E8E93]">{relativeTime(reply.createdAt)}</span>
                </div>
                <p className="mt-1 break-words text-sm leading-5 text-[#1D1D1F]">{reply.text}</p>
                <div className="mt-1 flex items-center gap-4">
                  <button
                    type="button"
                    aria-label={likedIds.has(reply.id) ? t("anuleazaAprecierea") : t("apreciazaRaspunsul")}
                    aria-pressed={likedIds.has(reply.id)}
                    disabled={likingIds.has(reply.id)}
                    onClick={() => onLike(reply.id)}
                    className={"inline-flex items-center gap-1 text-xs font-black disabled:opacity-60 " + (likedIds.has(reply.id) ? "text-[#FE2C55]" : "text-[#6E6E80]")}
                  >
                    <Heart size={12} fill={likedIds.has(reply.id) ? "#FE2C55" : "none"} />
                    {reply.likeCount > 0 ? reply.likeCount : ""}
                  </button>
                  <button type="button" onClick={() => onReply(reply)} className="text-xs font-black text-[#6E6E80]">
                    {t("raspunde")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

