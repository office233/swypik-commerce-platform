"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { genreLabelKey, isMovieGenre } from "@/lib/movies/genres";
import type { TrailerItem } from "@/lib/movies/tmdb";
import { Row } from "./HomeRows";

/** Card pentru un trailer TMDB — nu e un poster de serial: fără progres, fără badge 4K, fără preț. */
function TrailerCard({ item, onOpen }: { item: TrailerItem; onOpen: (item: TrailerItem) => void }) {
  const t = useTranslations("movies");
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group relative block w-[40vw] max-w-[170px] shrink-0 snap-start text-left"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10 transition-all duration-300 group-hover:scale-105">
        {item.posterUrl ? (
          <Image
            src={item.posterUrl}
            alt={item.title}
            fill
            sizes="170px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-black p-3 text-center text-xs font-bold text-white/80">
            {item.title}
          </div>
        )}
        <span className="absolute right-2 top-2 rounded bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-black uppercase text-white/90 ring-1 ring-white/20">
          {t("tmdbRatingLabel", { rating: item.voteAverage.toFixed(1) })}
        </span>
      </div>
      <p className="mt-2 line-clamp-1 text-xs sm:text-sm font-bold leading-tight text-white group-hover:text-[#A78BFA] transition-colors">
        {item.title}
      </p>
    </button>
  );
}

/** Rândul „Trailere populare” (TMDB) + modal de redare + atribuirea cerută de termenii TMDB. */
export default function TrailerRow({ items }: { items: TrailerItem[] }) {
  const t = useTranslations("movies");
  const [active, setActive] = useState<TrailerItem | null>(null);
  if (items.length === 0) return null;

  return (
    <>
      <Row title={t("trailersRow")}>
        {items.map((item) => (
          <TrailerCard key={item.id} item={item} onOpen={setActive} />
        ))}
      </Row>
      <p className="px-5 -mt-4 mb-2 text-[10px] text-white/40">
        {t("tmdbAttribution")}{" "}
        <Link href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/70">
          TMDB
        </Link>
      </p>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={() => setActive(null)}>
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-black border border-white/20 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label={t("close")}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/70 p-2 text-white/80 hover:text-white hover:bg-black"
            >
              <X size={20} />
            </button>
            <div className="aspect-video w-full">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${active.youtubeKey}?autoplay=1&rel=0`}
                title={active.title}
                className="h-full w-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="p-4 sm:p-5">
              <h3 className="text-lg font-black text-white">
                {active.title} {active.releaseYear && <span className="text-white/50 font-semibold">({active.releaseYear})</span>}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/60">
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-bold text-yellow-400">
                  {t("tmdbRatingLabel", { rating: active.voteAverage.toFixed(1) })}
                </span>
                {active.genres.filter(isMovieGenre).map((g) => (
                  <span key={g}>{t(genreLabelKey(g))}</span>
                ))}
              </div>
              {active.overview && <p className="mt-2 text-sm text-white/70 leading-relaxed">{active.overview}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
