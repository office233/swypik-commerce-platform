"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Lock, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import UnlockButton, { unitsToSwyp } from "@/components/movies/UnlockButton";
import { MOVIES_SEASON_DISCOUNT_PCT } from "@/lib/movies/config";
import type { EpisodeDto, SeriesDto } from "@/lib/movies/types";

type Payload = {
  series: SeriesDto;
  episodes: EpisodeDto[];
  viewer: { balanceUnits: number | null; hasSeasonUnlock: boolean; isOwner: boolean };
};

export default function SeriesClient({ slug }: { slug: string }) {
  const t = useTranslations("movies");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/movies/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError(true));
  }, [slug]);
  useEffect(load, [load]);

  if (error) return <div className="flex min-h-screen items-center justify-center bg-black text-white/70">{t("loadError")}</div>;
  if (!data) return <div className="min-h-screen bg-black" />;

  const { series, episodes, viewer } = data;
  const inProgress = episodes.find((e) => e.progress && !e.progress.completed);
  const nextUnwatched = episodes.find((e) => !e.progress?.completed);
  const resume = inProgress ?? nextUnwatched ?? episodes[0];
  const lockedCount = episodes.filter((e) => e.locked).length;
  const canBuySeason = lockedCount > 0 && !viewer.hasSeasonUnlock && !viewer.isOwner && series.seasonPriceUnits > 0;

  return (
    <main className="min-h-screen bg-black pb-24 text-white">
      <Link
        href="/movies"
        aria-label={t("back")}
        className="fixed left-4 z-30 rounded-full bg-black/50 p-2.5 ring-1 ring-white/15 backdrop-blur"
        style={{ top: "max(16px, env(safe-area-inset-top))" }}
      >
        <ArrowLeft size={20} />
      </Link>
      <section className="relative h-[70vh]">
        {series.posterUrl && <Image src={series.posterUrl} alt={series.title} fill priority sizes="100vw" className="object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
          {series.owner.isOfficial ? (
            <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-black">{t("official")}</span>
          ) : (
            <span className="text-xs text-white/70">{t("by", { name: series.owner.name })}</span>
          )}
          <h1 className="mt-2 text-4xl font-black leading-[0.95] tracking-tight">{series.title}</h1>
          <p className="mt-2 text-xs font-semibold text-white/60">
            {series.genres.join(" · ")} · {t("episodes", { count: series.episodeCount })}
            {series.isAdult ? ` · ${t("adult")}` : ""}
          </p>
        </div>
      </section>

      <section className="space-y-3 px-5 pt-4">
        {resume && (
          <Link
            href={`/movies/${slug}/${resume.number}`}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-black text-black active:scale-95"
          >
            <Play size={16} fill="currentColor" /> {inProgress ? t("continueEpisode", { n: resume.number }) : t("startEpisode")}
          </Link>
        )}
        {canBuySeason && (
          <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <UnlockButton
              slug={slug}
              target={{ season: true }}
              priceUnits={series.seasonPriceUnits}
              balanceUnits={viewer.balanceUnits}
              label={t("unlockSeason")}
              onUnlocked={load}
            />
            <p className="mt-1 text-center text-[11px] text-white/50">{t("seasonDiscount", { pct: MOVIES_SEASON_DISCOUNT_PCT })}</p>
          </div>
        )}
        <p className="text-sm leading-relaxed text-white/80">{series.synopsis}</p>
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-base font-black uppercase tracking-wider text-white/90">{t("episodes", { count: episodes.length })}</h2>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {episodes.map((e) => (
            <Link
              key={e.id}
              href={`/movies/${slug}/${e.number}`}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-black ring-1 ${
                e.locked ? "bg-neutral-900 text-white/50 ring-white/10" : "bg-white/10 text-white ring-white/20"
              } ${e.progress?.completed ? "opacity-60" : ""}`}
            >
              {e.number}
              {e.locked ? (
                <Lock size={11} className="absolute right-1.5 top-1.5" />
              ) : e.number <= series.freeEpisodes ? (
                <span className="absolute inset-x-1 bottom-1 text-[9px] font-bold uppercase text-emerald-400">{t("free")}</span>
              ) : null}
              {e.locked && <span className="absolute inset-x-1 bottom-1 text-[9px] text-white/40">{unitsToSwyp(e.priceUnits)} SWYP</span>}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
