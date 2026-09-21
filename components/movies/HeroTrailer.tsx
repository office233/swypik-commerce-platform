"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Play, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useHlsVideo } from "@/lib/video/useHlsVideo";
import type { SeriesDto } from "@/lib/movies/types";

/** Hero ~100vh: trailerul (sau ep. 1) redat mut în loop, gradient spre negru, CTA. */
export default function HeroTrailer({ series, playbackUrl }: { series: SeriesDto; playbackUrl: string | null }) {
  const t = useTranslations("movies");
  const [muted, setMuted] = useState(true);
  const videoRef = useHlsVideo(playbackUrl);
  const heroImage = series.coverUrl ?? series.posterUrl;
  return (
    <section className="relative h-[92vh] w-full overflow-hidden bg-black">
      {playbackUrl ? (
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted={muted} playsInline poster={heroImage ?? undefined} />
      ) : heroImage ? (
        <Image src={heroImage} alt="" fill priority sizes="100vw" className="object-cover" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />
      <div className="absolute inset-x-0 bottom-0 px-5" style={{ paddingBottom: "max(40px, env(safe-area-inset-bottom))" }}>
        {series.owner.isOfficial && (
          <span className="mb-2 inline-block rounded-md bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-black">{t("official")}</span>
        )}
        <h1 className="text-4xl font-black leading-[0.95] tracking-tight text-white drop-shadow-lg sm:text-6xl">{series.title}</h1>
        <p className="mt-2 line-clamp-2 max-w-md text-sm text-white/80">{series.synopsis}</p>
        <p className="mt-1 text-xs font-semibold text-white/60">
          {t("episodes", { count: series.episodeCount })} · {t("freeEpisodesLabel", { n: series.freeEpisodes })}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Link href={`/movies/${series.slug}/1`} className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-black active:scale-95">
            <Play size={16} fill="currentColor" /> {t("watchNow")}
          </Link>
          <Link href={`/movies/${series.slug}`} className="rounded-xl bg-white/15 px-4 py-3 text-sm font-bold text-white backdrop-blur active:scale-95">
            {t("synopsis")}
          </Link>
          {playbackUrl && (
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? t("unmute") : t("mute")}
              className="ml-auto rounded-full bg-black/50 p-2.5 text-white ring-1 ring-white/20"
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
