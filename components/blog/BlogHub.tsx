"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { translateBlogCategory } from "@/lib/blog/categoryLabel";
import Image from "next/image";
import { Link } from "@/lib/i18n/navigation";
import { ChevronRight, Sparkles, Search } from "lucide-react";
import { useTranslations } from "next-intl";

type BlogArticleSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  category: string | null;
  tags: string[];
  authorName: string;
  authorAvatar: string | null;
  readTimeMin: number;
  viewCount: number;
  publishedAt: string | null;
  linkedProductCount: number;
};



/**
 * BlogHub — mounted inside ChatInterface when activeTab === "blog".
 *
 * Mirrors the home tab layout language (cards, pills, gradients) so it feels
 * native rather than bolted-on. Uses /api/blog/articles with category + search
 * filters. Article click → Link to /blog/[slug] (SEO-friendly full page).
 */
export default function BlogHub() {
  const t = useTranslations("blogHub");
  const tBlogHub = useTranslations("blogHub");
  const tCat = useTranslations("blogCategory");
  const CATEGORY_PILLS: Array<{ key: string | null; label: string; emoji: string }> = [
    { key: null,       label: tBlogHub("toate"),   emoji: "✨" },
    { key: "casa",     label: tBlogHub("casa"),    emoji: "🏠" },
    { key: "tech",     label: tBlogHub("tech"),    emoji: "💻" },
    { key: "beauty",   label: tBlogHub("beauty"),  emoji: "💄" },
    { key: "moda",     label: tBlogHub("moda"),    emoji: "👗" },
    { key: "fitness",  label: tBlogHub("fitness"), emoji: "🏋️" },
    { key: "cadouri",  label: tBlogHub("cadouri"), emoji: "🎁" },
    { key: "animale",  label: tBlogHub("animale"), emoji: "🐾" },
  ];
  const [articles, setArticles] = useState<BlogArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const fetchArticles = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory) params.set("category", activeCategory);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "12");
      params.set("offset", reset ? "0" : String(offset));

      const res = await fetch(`/api/blog/articles?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: BlogArticleSummary[] = data.articles || [];

      setArticles((prev) => (reset ? items : [...prev, ...items]));
      setHasMore(!!data.hasMore);
      setOffset((prev) => (reset ? items.length : prev + items.length));
    } catch (err) {
      console.warn("[BlogHub] fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, search, offset]);

  // Reset + refetch when filters change
  useEffect(() => {
    setOffset(0);
    void fetchArticles(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, search]);

  const featured = articles[0];
  const rest = articles.slice(1);

  return (
    <div className="pb-24">
      {/* ===== Hero compact ===== */}
      <div className="relative px-4 pt-5 pb-4 overflow-hidden">
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            background: `
              radial-gradient(at 20% 20%, rgba(124,58,237,.6) 0px, transparent 50%),
              radial-gradient(at 80% 60%, rgba(236,72,153,.5) 0px, transparent 50%)
            `,
          }}
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-100 text-[10px] font-bold uppercase tracking-wider">
            <Sparkles size={10} />  {t("nouPeSwypik")}
          </span>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight">
            <span
              style={{
                background: "linear-gradient(135deg,#7C3AED,#EC4899)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Ghiduri & Recenzii
            </span>
          </h1>
          <p className="text-sm text-zinc-600 mt-1">

            {t("citesteInainteSaCumperi")}
          </p>
        </div>
      </div>

      {/* ===== Search ===== */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("cautaGhiduri")}
            className="w-full h-11 pl-11 pr-4 rounded-2xl bg-[#F4F4F5] text-sm font-medium placeholder:text-[#A1A1AA] outline-none"
          />
        </div>
      </div>

      {/* ===== Category pills ===== */}
      <div className="px-4 pb-3">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {CATEGORY_PILLS.map((cat) => {
            const active = cat.key === activeCategory;
            return (
              <button
                key={cat.label}
                onClick={() => setActiveCategory(cat.key)}
                className={`shrink-0 px-3 h-8 rounded-full text-xs font-bold whitespace-nowrap transition ${
                  active
                    ? "text-white shadow-md"
                    : "bg-zinc-100 text-[#0D0D0D] hover:bg-zinc-200"
                }`}
                style={
                  active
                    ? { background: "linear-gradient(135deg,#7C3AED,#EC4899)" }
                    : undefined
                }
              >
                {cat.emoji} {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Empty state ===== */}
      {!loading && articles.length === 0 && (
        <div className="px-4 py-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm text-zinc-600 font-medium">

            {t("niciunArticolGasitIncearca")}
          </p>
        </div>
      )}

      {/* ===== Featured article (first item) ===== */}
      {featured && (
        <div className="px-4">
          <Link
            href={`/blog/${featured.slug}` as any}
            className="block rounded-2xl overflow-hidden border border-zinc-200 bg-white active:scale-[0.98] transition"
          >
            <div className="relative aspect-[16/9] overflow-hidden bg-zinc-100">
              {featured.heroImageUrl ? (
                <Image
                  src={featured.heroImageUrl}
                  alt={featured.heroImageAlt || featured.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
              <span
                className="absolute top-3 left-3 px-2 py-1 rounded-full text-white text-[10px] font-bold"
                style={{ background: "linear-gradient(135deg,#7C3AED,#EC4899)" }}
              >
                🔥 TRENDING
              </span>
              <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                <div className="text-[10px] opacity-90 mb-1">
                  {featured.category ? featured.category.toUpperCase() + " • " : ""}
                  {featured.readTimeMin} min citire
                </div>
                <h3 className="text-lg font-extrabold leading-tight line-clamp-2">
                  {featured.title}
                </h3>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* ===== Grid 2-col rest ===== */}
      {rest.length > 0 && (
        <div className="px-4 mt-4">
          <h2 className="font-bold mb-3 text-[#0D0D0D]">📚 Articole noi</h2>
          <div className="grid grid-cols-2 gap-3">
            {rest.map((a) => (
              <Link
                key={a.id}
                href={`/blog/${a.slug}` as any}
                className="block rounded-xl overflow-hidden border border-zinc-200 bg-white active:scale-[0.98] transition"
              >
                <div className="relative aspect-square overflow-hidden bg-zinc-100">
                  {a.heroImageUrl ? (
                    <Image
                      src={a.heroImageUrl}
                      alt={a.heroImageAlt || a.title}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="p-2.5">
                  <div className="text-[10px] text-zinc-500 mb-1">
                    {a.category ? translateBlogCategory(a.category, tCat) + " • " : ""}{a.readTimeMin} min
                  </div>
                  <h4 className="text-xs font-bold leading-tight line-clamp-2">
                    {a.title}
                  </h4>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ===== Load more / loading skeleton ===== */}
      {loading && articles.length === 0 && (
        <div className="px-4 mt-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
              <div className="aspect-square bg-zinc-100 animate-pulse" />
              <div className="p-2.5 space-y-2">
                <div className="h-2 bg-zinc-100 rounded animate-pulse w-1/2" />
                <div className="h-3 bg-zinc-100 rounded animate-pulse" />
                <div className="h-3 bg-zinc-100 rounded animate-pulse w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <div className="px-4 mt-4">
          <button
            onClick={() => void fetchArticles(false)}
            className="w-full rounded-xl bg-[#0D0D0D] py-3 font-bold text-white text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >

            {t("incarcaMaiMulte")} <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
