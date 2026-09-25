"use client";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import PosterCard from "./PosterCard";
import { MOVIES_DISPLAY_CLASS } from "./fonts";
import { genreLabelKey } from "@/lib/movies/genres";
import type { HomeRow } from "@/lib/movies/home";
import type { SeriesDto } from "@/lib/movies/types";

export function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-5 text-[15px] font-bold text-white/90">{title}</h2>
      <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">{children}</div>
    </section>
  );
}

/** Top 10 Swypik Trending: Card modern de cinema cu badge de ranking gradient Swypik și poster 4K. */
function TopTenCard({ series, rank }: { series: SeriesDto; rank: number }) {
  return (
    <Link href={`/movies/${series.slug}`} className="group relative block w-[38vw] max-w-[160px] shrink-0 snap-start">
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/10 transition-all duration-300 group-hover:scale-105 group-hover:ring-[#7C3AED]/50 group-active:scale-95 shadow-xl">
        {/* Badge Ranking Swypik cu gradient */}
        <div className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#7C3AED] via-[#9333EA] to-[#EC4899] px-2 py-0.5 text-[11px] font-black text-white shadow-[0_0_12px_rgba(124,58,237,0.5)]">
          <span>#{rank}</span>
        </div>

        {/* Badge 4K */}
        <span className="absolute right-2 top-2 z-20 rounded-md bg-black/60 backdrop-blur-md px-1.5 py-0.5 text-[9px] font-black uppercase text-white/90 ring-1 ring-white/20">
          4K
        </span>

        {series.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={series.posterUrl}
            alt={series.title}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const fb = parent.querySelector(".poster-fallback");
                if (fb) (fb as HTMLElement).style.display = "flex";
              }
            }}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : null}

        <div className="poster-fallback absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-900 to-black flex items-center justify-center p-3 text-center text-xs font-bold text-white/80" style={{ display: series.posterUrl ? "none" : "flex" }}>
          {series.title}
        </div>

        {/* Gradient subtil jos cu titlul filmului */}
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/70 to-transparent p-2.5 pt-8">
          <p className="text-xs font-bold text-white line-clamp-1 group-hover:text-[#A78BFA] transition-colors drop-shadow">
            {series.title}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function HomeRows({ rows }: { rows: HomeRow[] }) {
  const t = useTranslations("movies");
  return (
    <>
      {rows.map((row) => {
        switch (row.kind) {
          case "continue":
            return (
              <Row key="continue" title={t("continueWatching")}>
                {row.items.map((c) => (
                  <PosterCard key={c.series.id} series={c.series} href={`/movies/${c.series.slug}/${c.episodeNumber}`} progressPct={c.durationMs ? Math.round((c.positionMs / c.durationMs) * 100) : 0} />
                ))}
              </Row>
            );
          case "mylist":
            return <Row key="mylist" title={t("myList")}>{row.items.map((s) => <PosterCard key={s.id} series={s} href={`/movies/${s.slug}`} />)}</Row>;
          case "top10":
            return <Row key="top10" title={t("top10Today")}>{row.items.map((s, i) => <TopTenCard key={s.id} series={s} rank={i + 1} />)}</Row>;
          case "originals":
            return <Row key="originals" title={t("originals")}>{row.items.map((s) => <PosterCard key={s.id} series={s} href={`/movies/${s.slug}`} />)}</Row>;
          case "latest":
            return <Row key="latest" title={t("newReleases")}>{row.items.map((s) => <PosterCard key={s.id} series={s} href={`/movies/${s.slug}`} />)}</Row>;
          case "genre":
            return <Row key={`genre-${row.genre}`} title={t(genreLabelKey(row.genre))}>{row.items.map((s) => <PosterCard key={s.id} series={s} href={`/movies/${s.slug}`} />)}</Row>;
        }
      })}
    </>
  );
}
