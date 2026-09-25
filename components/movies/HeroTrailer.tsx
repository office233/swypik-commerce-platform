"use client";
import { useState } from "react";
import Link from "next/link";
import { Info, Play, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useHlsVideo } from "@/lib/video/useHlsVideo";
import { genreLabelKey, isMovieGenre } from "@/lib/movies/genres";
import type { SeriesDto } from "@/lib/movies/types";
import { MOVIES_DISPLAY_CLASS } from "./fonts";

/** Billboard stil Netflix: copertă HD/4K, titlu impunător, detalii și redare video HLS local. */
export default function HeroTrailer({ series, playbackUrl }: { series: SeriesDto; playbackUrl: string | null }) {
  const t = useTranslations("movies");
  const [muted, setMuted] = useState(true);

  const isVideoHls = Boolean(playbackUrl && (playbackUrl.includes(".m3u8") || playbackUrl.includes("/stream/")));
  const videoRef = useHlsVideo(isVideoHls ? playbackUrl : null);
  const heroImage = series.coverUrl ?? series.posterUrl;
  const genres = series.genres.filter(isMovieGenre).map((g) => t(genreLabelKey(g)));

  return (
    <section className="relative h-[56vh] sm:h-[68vh] md:h-[75vh] w-full overflow-hidden bg-black">
      {/* Background Image / Backdrop */}
      {heroImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={heroImage}
          alt={series.title}
          referrerPolicy="no-referrer"
          onError={(e) => {
            // Dacă backdropUrl pică, încearcă posterUrl
            if (series.posterUrl && e.currentTarget.src !== series.posterUrl) {
              e.currentTarget.src = series.posterUrl;
            } else {
              e.currentTarget.style.display = "none";
            }
          }}
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
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/30 to-transparent" />

      {/* Content */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-6 sm:px-6 sm:pb-8 max-w-4xl" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded-full bg-gradient-to-r from-[#7C3AED] via-[#9333EA] to-[#EC4899] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-[0_0_16px_rgba(124,58,237,0.6)]">
            {t("brandBadge")}
          </span>
        </div>

        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)] leading-tight line-clamp-2">
          {series.title}
        </h1>

        {series.synopsis && (
          <p className="mt-2 line-clamp-2 text-xs sm:text-sm text-white/80 max-w-2xl leading-relaxed drop-shadow">
            {series.synopsis}
          </p>
        )}

        {genres.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {genres.map((g) => (
              <span key={g} className="rounded-md bg-white/10 backdrop-blur-sm px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-white/70">
                {g}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2.5 sm:gap-3">
          <Link
            href={`/movies/${series.slug}/1`}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#EC4899] px-4 py-2.5 sm:px-6 sm:py-3 text-xs sm:text-sm font-black text-white shadow-[0_0_20px_rgba(124,58,237,0.5)] active:scale-95 hover:brightness-110 transition-all shrink-0"
          >
            <Play size={15} fill="currentColor" /> {t("play")}
          </Link>

          <Link
            href={`/movies/${series.slug}`}
            className="flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 px-3.5 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm font-bold text-white hover:bg-white/20 active:scale-95 transition-all shrink-0"
          >
            <Info size={15} /> {t("moreInfo")}
          </Link>

          {isVideoHls && (
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? t("unmute") : t("mute")}
              className="ml-auto rounded-full bg-black/40 border border-white/20 p-2 text-white hover:bg-black/60 transition-colors"
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
