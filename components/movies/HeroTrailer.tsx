"use client";
import { useState } from "react";
import Link from "next/link";
import { Info, Play, Volume2, VolumeX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useHlsVideo } from "@/lib/video/useHlsVideo";
import { genreLabelKey, isMovieGenre } from "@/lib/movies/genres";
import type { SeriesDto } from "@/lib/movies/types";
import { MOVIES_DISPLAY_CLASS } from "./fonts";

/** Billboard stil Netflix: copertă HD/4K, titlu impunător, detalii și redare trailer 4K. */
export default function HeroTrailer({ series, playbackUrl }: { series: SeriesDto; playbackUrl: string | null }) {
  const t = useTranslations("movies");
  const [muted, setMuted] = useState(true);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  
  const isVideoHls = Boolean(playbackUrl && (playbackUrl.includes(".m3u8") || playbackUrl.includes("/stream/")));
  const videoRef = useHlsVideo(isVideoHls ? playbackUrl : null);
  const heroImage = series.coverUrl ?? series.posterUrl;
  const genres = series.genres.filter(isMovieGenre).map((g) => t(genreLabelKey(g)));
  const trailerKey = series.trailerVideoId;

  return (
    <section className="relative h-[78vh] sm:h-[85vh] w-full overflow-hidden bg-black">
      {/* Background Image / Backdrop */}
      {heroImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={heroImage}
          alt={series.title}
          className="absolute inset-0 h-full w-full object-cover object-top opacity-85 transition-opacity duration-700"
        />
      )}

      {/* Video HLS local dacă există */}
      {isVideoHls && (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          loop
          muted={muted}
          playsInline
        />
      )}

      {/* Cinematic Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent" />

      {/* Content */}
      <div className="absolute inset-x-0 bottom-0 px-5 pb-8 max-w-4xl" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded bg-[#E50914] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
            CINEMA 4K
          </span>
          <span className="text-xs font-bold text-yellow-400 flex items-center gap-1">
            ★ {series.slug.includes("dune") ? "8.6" : "8.4"} TMDB
          </span>
        </div>

        <h1 className={`${MOVIES_DISPLAY_CLASS} text-5xl sm:text-7xl font-black leading-[0.9] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]`}>
          {series.title}
        </h1>

        {series.synopsis && (
          <p className="mt-3 line-clamp-2 sm:line-clamp-3 text-xs sm:text-sm text-white/80 max-w-2xl leading-relaxed drop-shadow">
            {series.synopsis}
          </p>
        )}

        {genres.length > 0 && (
          <p className="mt-2 text-xs font-semibold text-white/60">
            {genres.join(" • ")}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          {trailerKey ? (
            <button
              type="button"
              onClick={() => setShowTrailerModal(true)}
              className="flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-sm sm:text-base font-bold text-black shadow-xl active:scale-95 transition-transform"
            >
              <Play size={18} fill="currentColor" /> Redă Trailer 4K
            </button>
          ) : (
            <Link
              href={`/movies/${series.slug}/1`}
              className="flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-sm sm:text-base font-bold text-black shadow-xl active:scale-95 transition-transform"
            >
              <Play size={18} fill="currentColor" /> {t("play")}
            </Link>
          )}

          <Link
            href={`/movies/${series.slug}`}
            className="flex items-center gap-2 rounded-lg bg-white/20 px-5 py-2.5 text-sm sm:text-base font-bold text-white backdrop-blur-md hover:bg-white/30 active:scale-95 transition-all"
          >
            <Info size={18} /> {t("moreInfo")}
          </Link>

          {isVideoHls && (
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? t("unmute") : t("mute")}
              className="ml-auto rounded-full bg-black/40 border border-white/20 p-2.5 text-white hover:bg-black/60 transition-colors"
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}
        </div>
      </div>

      {/* Modal Trailer 4K */}
      {showTrailerModal && trailerKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-2xl bg-black border border-white/20 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowTrailerModal(false)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/70 p-2 text-white/80 hover:text-white hover:bg-black"
            >
              <X size={20} />
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
              title={series.title}
              className="h-full w-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </section>
  );
}
