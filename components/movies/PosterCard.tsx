"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { genreLabelKey, isMovieGenre } from "@/lib/movies/genres";
import type { SeriesDto } from "@/lib/movies/types";

const PROGRESS_MIN_VISIBLE_PCT = 2;

export default function PosterCard({
  series,
  href,
  progressPct,
  rank,
}: {
  series: SeriesDto;
  href: string;
  progressPct?: number;
  rank?: number;
}) {
  const t = useTranslations("movies");
  return (
    <Link href={href} className="group relative block w-[40vw] max-w-[170px] shrink-0 snap-start">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10 transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.8)]">
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
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

        {/* Badge 4K */}
        <span className="absolute right-2 top-2 rounded bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-black uppercase text-white/90 ring-1 ring-white/20">
          4K
        </span>

        {rank !== undefined && (
          <div className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#7C3AED] via-[#9333EA] to-[#EC4899] px-2 py-0.5 text-[11px] font-black text-white shadow-[0_0_12px_rgba(124,58,237,0.5)]">
            <span>#{rank}</span>
          </div>
        )}

        {series.isAdult && (
          <span className="absolute left-2 top-2 rounded-md bg-gradient-to-r from-red-600 to-pink-600 px-1.5 py-0.5 text-[10px] font-black text-white">
            18+
          </span>
        )}

        {progressPct !== undefined && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div
              className="h-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899]"
              style={{ width: `${Math.min(100, Math.max(PROGRESS_MIN_VISIBLE_PCT, progressPct))}%` }}
            />
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-1 text-xs sm:text-sm font-bold leading-tight text-white group-hover:text-[#A78BFA] transition-colors">
        {series.title}
      </p>
      {series.genres.length > 0 && (
        <p className="text-[11px] text-white/50 line-clamp-1">
          {series.genres
            .slice(0, 2)
            .map((g) => (isMovieGenre(g) ? t(genreLabelKey(g)) : g))
            .join(" • ")}
        </p>
      )}
    </Link>
  );
}
