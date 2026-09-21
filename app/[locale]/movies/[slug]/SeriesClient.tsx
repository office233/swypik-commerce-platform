"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Check, Lock, Play, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import UnlockButton, { unitsToSwyp } from "@/components/movies/UnlockButton";
import MoviesBrand from "@/components/movies/MoviesBrand";
import { moviesDisplayFont, MOVIES_DISPLAY_CLASS } from "@/components/movies/fonts";
import { genreLabelKey, isMovieGenre } from "@/lib/movies/genres";
import type { EpisodeDto, SeriesDto } from "@/lib/movies/types";

type Payload = {
  series: SeriesDto;
  episodes: EpisodeDto[];
  viewer: { balanceUnits: number | null; hasSeasonUnlock: boolean; isOwner: boolean; inWatchlist: boolean };
};

const MS_PER_MINUTE = 60_000;

export default function SeriesClient({ slug }: { slug: string }) {
  const t = useTranslations("movies");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [listBusy, setListBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/movies/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError(true));
  }, [slug]);
  useEffect(load, [load]);

  const toggleList = async () => {
    if (!data) return;
    if (data.viewer.balanceUnits === null) { window.location.assign(`/auth?next=/movies/${slug}`); return; }
    setListBusy(true);
    try {
      const res = await fetch(`/api/movies/${slug}/watchlist`, { method: data.viewer.inWatchlist ? "DELETE" : "POST" });
      if (res.ok) {
        const d = await res.json();
        setData({ ...data, viewer: { ...data.viewer, inWatchlist: Boolean(d.inWatchlist) } });
      }
    } finally {
      setListBusy(false);
    }
  };

  if (error) return <div className="flex min-h-screen items-center justify-center bg-black text-white/70">{t("loadError")}</div>;
  if (!data) return <div className="min-h-screen bg-black" />;

  const { series, episodes, viewer } = data;
  const inProgress = episodes.find((e) => e.progress && !e.progress.completed);
  const nextUnwatched = episodes.find((e) => !e.progress?.completed);
  const resume = inProgress ?? nextUnwatched ?? episodes[0];
  const lockedCount = episodes.filter((e) => e.locked).length;
  const canBuySeason = lockedCount > 0 && !viewer.hasSeasonUnlock && !viewer.isOwner && series.seasonPriceUnits > 0;
  const genres = series.genres.filter(isMovieGenre).map((g) => t(genreLabelKey(g)));

  return (
    <main className={`${moviesDisplayFont.variable} min-h-screen bg-black pb-24 text-white`}>
      <header className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/90 to-transparent px-4 pb-3" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
        <Link href="/movies" aria-label={t("back")} className="rounded-full bg-black/40 p-2 ring-1 ring-white/15"><ArrowLeft size={18} /></Link>
        <MoviesBrand />
      </header>

      <section className="relative h-[62vh]">
        {series.posterUrl && <Image src={series.posterUrl} alt={series.title} fill priority sizes="100vw" className="object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-5 pb-4">
          {series.owner.isOfficial ? (
            <p className={`${MOVIES_DISPLAY_CLASS} text-sm tracking-[0.3em] text-[#E50914]`}>{t("official").toUpperCase()}</p>
          ) : (
            <p className="text-xs text-white/70">{t("by", { name: series.owner.name })}</p>
          )}
          <h1 className={`${MOVIES_DISPLAY_CLASS} mt-1 text-6xl leading-[0.9] drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]`}>{series.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/70">
            <span>{t("episodes", { count: series.episodeCount })}</span>
            <span className="rounded border border-white/30 px-1.5 py-0.5 text-[10px] text-emerald-300">{t("freeBadge", { n: series.freeEpisodes })}</span>
            {series.isAdult && <span className="rounded border border-red-500/60 px-1.5 py-0.5 text-[10px] text-red-400">{t("adult")}</span>}
          </div>
        </div>
      </section>

      <section className="space-y-3 px-5 pt-2">
        <div className="flex gap-2">
          {resume && (
            <Link href={`/movies/${slug}/${resume.number}`} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-5 py-3 text-base font-bold text-black active:scale-95">
              <Play size={20} fill="currentColor" /> {inProgress ? t("resume") : t("play")}
            </Link>
          )}
          <button
            type="button"
            onClick={toggleList}
            disabled={listBusy}
            aria-pressed={viewer.inWatchlist}
            className="flex items-center justify-center gap-2 rounded-md bg-white/15 px-4 py-3 text-sm font-bold text-white backdrop-blur active:scale-95 disabled:opacity-50"
          >
            {viewer.inWatchlist ? <Check size={18} /> : <Plus size={18} />}
            {viewer.inWatchlist ? t("inList") : t("myList")}
          </button>
        </div>
        {canBuySeason && (
          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <UnlockButton slug={slug} target={{ season: true }} priceUnits={series.seasonPriceUnits} balanceUnits={viewer.balanceUnits} label={t("unlockSeason")} onUnlocked={load} />
            <p className="mt-1 text-center text-[11px] text-white/50">{t("seasonDiscount", { pct: series.seasonDiscountPct })}</p>
          </div>
        )}
        <p className="text-sm leading-relaxed text-white/85">{series.synopsis}</p>
        {genres.length > 0 && <p className="text-xs text-white/50"><span className="text-white/70">{t("genres")}:</span> {genres.join(", ")}</p>}
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-[15px] font-bold text-white/90">{t("episodesTitle")}</h2>
        <ol className="space-y-3">
          {episodes.map((e) => (
            <li key={e.id}>
              <Link href={`/movies/${slug}/${e.number}`} className="flex gap-3 rounded-lg active:bg-white/5">
                <div className="relative aspect-[9/16] w-[72px] shrink-0 overflow-hidden rounded-md bg-neutral-900 ring-1 ring-white/10">
                  {e.thumbnailUrl && <Image src={e.thumbnailUrl} alt="" fill sizes="72px" className={`object-cover ${e.locked ? "opacity-50" : ""}`} />}
                  {e.locked && <Lock size={16} className="absolute inset-0 m-auto text-white" />}
                  {e.progress && !e.progress.completed && e.durationMs ? (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><div className="h-full bg-[#E50914]" style={{ width: `${Math.min(100, Math.round((e.progress.positionMs / e.durationMs) * 100))}%` }} /></div>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="text-sm font-bold"><span className="text-white/50">{e.number}.</span> {e.title}</p>
                  <p className="mt-0.5 text-xs text-white/50">
                    {e.durationMs ? t("minutes", { n: Math.max(1, Math.round(e.durationMs / MS_PER_MINUTE)) }) : ""}
                    {e.locked ? ` · ${unitsToSwyp(e.priceUnits)} SWYP` : e.number <= series.freeEpisodes ? ` · ${t("free")}` : ""}
                    {e.progress?.completed ? " · ✓" : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
