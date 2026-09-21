"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Info, Play, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useHlsVideo } from "@/lib/video/useHlsVideo";
import { genreLabelKey, isMovieGenre } from "@/lib/movies/genres";
import type { SeriesDto } from "@/lib/movies/types";
import { MOVIES_DISPLAY_CLASS } from "./fonts";

/** Billboard: trailerul (ep. 1) redat mut în loop, titlu în fontul de afișare, Redă / Detalii. */
export default function HeroTrailer({ series, playbackUrl }: { series: SeriesDto; playbackUrl: string | null }) {
  const t = useTranslations("movies");
  const [muted, setMuted] = useState(true);
  const videoRef = useHlsVideo(playbackUrl);
  const heroImage = series.coverUrl ?? series.posterUrl;
  const genres = series.genres.filter(isMovieGenre).map((g) => t(genreLabelKey(g)));
  return (
    <section className="relative h-[88vh] w-full overflow-hidden bg-black">
      {playbackUrl ? (
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted={muted} playsInline poster={heroImage ?? undefined} />
      ) : heroImage ? (
        <Image src={heroImage} alt="" fill priority sizes="100vw" className="object-cover" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/40" />
      <div className="absolute inset-x-0 bottom-0 px-5" style={{ paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}>
        {series.owner.isOfficial && (
          <p className={`${MOVIES_DISPLAY_CLASS} mb-1 text-sm tracking-[0.3em] text-[#E50914]`}>{t("official").toUpperCase()}</p>
        )}
        <h1 className={`${MOVIES_DISPLAY_CLASS} text-6xl leading-[0.9] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] sm:text-8xl`}>{series.title}</h1>
        {genres.length > 0 && <p className="mt-2 text-xs font-semibold text-white/80">{genres.join(" · ")}</p>}
        <p className="mt-1 text-xs text-white/60">{t("episodes", { count: series.episodeCount })} · {t("freeBadge", { n: series.freeEpisodes })}</p>
        <div className="mt-4 flex items-center gap-2">
          <Link href={`/movies/${series.slug}/1`} className="flex items-center gap-2 rounded-md bg-white px-6 py-2.5 text-base font-bold text-black active:scale-95">
            <Play size={20} fill="currentColor" /> {t("play")}
          </Link>
          <Link href={`/movies/${series.slug}`} className="flex items-center gap-2 rounded-md bg-white/25 px-5 py-2.5 text-base font-bold text-white backdrop-blur active:scale-95">
            <Info size={20} /> {t("moreInfo")}
          </Link>
          {playbackUrl && (
            <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? t("unmute") : t("mute")} className="ml-auto rounded-full border border-white/40 p-2.5 text-white">
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
