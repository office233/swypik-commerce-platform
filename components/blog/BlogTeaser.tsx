"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

type BlogArticleSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
};

type Props = {
  /** Called when user taps "Read" — typically setActiveTab("blog") in ChatInterface. */
  onOpenHub?: () => void;
};

/**
 * BlogTeaser — purple gradient card inserted on Home tab, between quick prompts
 * and trending grid. Promotes the newest published article and routes the user
 * to the in-app Blog tab.
 *
 * Falls back silently (renders null) if no articles are available — keeps the
 * Home tab clean during the bootstrap period.
 */
export default function BlogTeaser({ onOpenHub }: Props) {
  const [latest, setLatest] = useState<BlogArticleSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/blog/articles?limit=1", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        const first: BlogArticleSummary | undefined = data.articles?.[0];
        if (first) setLatest(first);
        else setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (failed || !latest) return null;

  return (
    <div className="px-4 mt-5">
      <button
        type="button"
        onClick={onOpenHub}
        className="relative w-full overflow-hidden rounded-2xl p-4 text-left text-white active:scale-[0.98] transition shadow-lg"
        style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
          boxShadow: "0 8px 30px rgba(124,58,237,.35)",
        }}
      >
        <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/10" />
        <div className="absolute -right-2 -top-2 w-16 h-16 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur grid place-items-center text-2xl">
            📖
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                ✨ NOU
              </span>
              <span className="text-[10px] opacity-90">azi</span>
            </div>
            <div className="font-extrabold text-base leading-tight mt-1 truncate">
              Ghiduri & Recenzii produse
            </div>
            <div className="text-xs opacity-90 truncate">{latest.title}</div>
          </div>
          <ChevronRight className="w-5 h-5 shrink-0" />
        </div>
      </button>
    </div>
  );
}
