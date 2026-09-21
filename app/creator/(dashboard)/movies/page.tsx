"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clapperboard, Plus } from "lucide-react";
import { unitsToSwyp } from "@/components/movies/UnlockButton";
import { MOVIES_DEFAULT_EPISODE_PRICE_UNITS, MOVIES_DEFAULT_FREE_EPISODES, MOVIES_MAX_FREE_EPISODES, SWYP_UNITS_PER_COIN } from "@/lib/movies/config";
import type { MovieEpisodeRow, MovieSeriesRow, SeriesStatus } from "@/lib/movies/types";
import { MOVIE_GENRES, genreLabelKey, type MovieGenre } from "@/lib/movies/genres";

type Overview = { publisher: boolean; series: Array<MovieSeriesRow & { episode_count: number }>; earnings: { total_units: number; unlocks: number } };
type Video = { id: string; title: string | null; status: string; duration_ms: number | null };
type StatusKey = "statusDraft" | "statusPendingReview" | "statusPublished" | "statusArchived";

const STATUS_KEY: Record<SeriesStatus, StatusKey> = {
  draft: "statusDraft",
  pending_review: "statusPendingReview",
  published: "statusPublished",
  archived: "statusArchived",
};
const INPUT = "w-full rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#0D0D0D]";
const JSON_HEADERS = { "Content-Type": "application/json" };

export default function CreatorMoviesPage() {
  const t = useTranslations("movies");
  const [data, setData] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<{ series: MovieSeriesRow; episodes: MovieEpisodeRow[] } | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "", synopsis: "", genres: [] as MovieGenre[], posterUrl: "", coverUrl: "",
    freeEpisodes: MOVIES_DEFAULT_FREE_EPISODES, priceSwyp: MOVIES_DEFAULT_EPISODE_PRICE_UNITS / SWYP_UNITS_PER_COIN,
    licenseNote: "", isAdult: false,
  });
  const [episodeForm, setEpisodeForm] = useState({ videoId: "", title: "" });

  const load = useCallback(() => {
    fetch("/api/creator/movies").then((r) => r.json()).then(setData).catch(() => setMsg(t("error")));
  }, [t]);
  useEffect(load, [load]);
  useEffect(() => {
    fetch("/api/creator/videos")
      .then((r) => r.json())
      .then((d) => setVideos(((d.videos ?? []) as Video[]).filter((v) => v.status === "ready")))
      .catch(() => undefined);
  }, []);

  const openSeries = (id: string) => fetch(`/api/creator/movies/${id}`).then((r) => r.json()).then(setSelected);

  const createSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/creator/movies", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        title: form.title,
        synopsis: form.synopsis,
        genres: form.genres,
        posterUrl: form.posterUrl || null,
        coverUrl: form.coverUrl || null,
        freeEpisodes: form.freeEpisodes,
        episodePriceUnits: Math.round(form.priceSwyp * SWYP_UNITS_PER_COIN),
        licenseNote: form.licenseNote || null,
        isAdult: form.isAdult,
      }),
    });
    setMsg(res.ok ? t("saved") : t("error"));
    if (res.ok) load();
  };

  const addEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setMsg(null);
    const res = await fetch(`/api/creator/movies/${selected.series.id}/episodes`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(episodeForm) });
    setMsg(res.ok ? t("saved") : t("error"));
    if (res.ok) {
      setEpisodeForm({ videoId: "", title: "" });
      void openSeries(selected.series.id);
      load();
    }
  };

  const submitReview = async () => {
    if (!selected) return;
    const res = await fetch(`/api/creator/movies/${selected.series.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ status: "pending_review" }) });
    setMsg(res.ok ? t("saved") : t("error"));
    if (res.ok) {
      void openSeries(selected.series.id);
      load();
    }
  };

  if (!data) return <div className="p-6 text-sm text-neutral-500">…</div>;
  if (!data.publisher) return <div className="m-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{t("notPublisher")}</div>;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-black"><Clapperboard size={22} /> {t("studio")}</h1>
        <p className="text-sm text-neutral-600">{t("studioIntro")}</p>
      </header>
      <div className="rounded-2xl bg-[#0D0D0D] p-4 text-white">
        <p className="text-xs uppercase tracking-wider text-white/60">{t("earnings")}</p>
        <p className="text-2xl font-black">{unitsToSwyp(data.earnings.total_units)} SWYP</p>
        <p className="text-xs text-white/60">{t("earningsUnlocks", { count: data.earnings.unlocks })}</p>
      </div>
      {msg && <p className="text-sm font-semibold text-emerald-700">{msg}</p>}

      <section className="grid gap-3 sm:grid-cols-2">
        {data.series.map((s) => (
          <button key={s.id} type="button" onClick={() => openSeries(s.id)} className="rounded-2xl border border-[#E5E5E5] p-4 text-left hover:border-[#0D0D0D]">
            <p className="font-bold">{s.title}</p>
            <p className="text-xs text-neutral-500">{t(STATUS_KEY[s.status])} · {t("episodes", { count: s.episode_count })}</p>
          </button>
        ))}
      </section>

      {selected && (
        <section className="space-y-3 rounded-2xl border border-[#E5E5E5] p-4">
          <h2 className="font-black">{selected.series.title}</h2>
          <ol className="space-y-1 text-sm">
            {selected.episodes.map((e) => <li key={e.id}>{t("episode", { n: e.episode_number })} — {e.title}</li>)}
          </ol>
          <form onSubmit={addEpisode} className="grid gap-2 sm:grid-cols-3">
            <select required value={episodeForm.videoId} onChange={(e) => setEpisodeForm({ ...episodeForm, videoId: e.target.value })} className={INPUT}>
              <option value="">{t("pickVideo")}</option>
              {videos.map((v) => <option key={v.id} value={v.id}>{v.title ?? v.id.slice(0, 8)}</option>)}
            </select>
            <input required value={episodeForm.title} onChange={(e) => setEpisodeForm({ ...episodeForm, title: e.target.value })} placeholder={t("episodeTitle")} className={INPUT} />
            <button type="submit" className="rounded-xl bg-[#0D0D0D] px-4 py-2 text-sm font-bold text-white"><Plus size={14} className="inline" /> {t("addEpisode")}</button>
          </form>
          {selected.series.status === "draft" && (
            <button type="button" onClick={submitReview} className="rounded-xl border border-[#0D0D0D] px-4 py-2 text-sm font-bold">{t("submitReview")}</button>
          )}
        </section>
      )}

      <form onSubmit={createSeries} className="space-y-2 rounded-2xl border border-[#E5E5E5] p-4">
        <h2 className="font-black">{t("newSeries")}</h2>
        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("seriesTitle")} className={INPUT} />
        <textarea value={form.synopsis} onChange={(e) => setForm({ ...form, synopsis: e.target.value })} placeholder={t("seriesSynopsis")} rows={3} className={INPUT} />
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-xs text-neutral-600">{t("genres")}</legend>
          {MOVIE_GENRES.map((g) => {
            const on = form.genres.includes(g);
            return (
              <label key={g} className={`cursor-pointer rounded-full px-3 py-1 text-xs font-bold ring-1 ${on ? "bg-[#0D0D0D] text-white ring-[#0D0D0D]" : "bg-white text-neutral-700 ring-[#E5E5E5]"}`}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => setForm({ ...form, genres: on ? form.genres.filter((x) => x !== g) : [...form.genres, g] })} />
                {t(genreLabelKey(g))}
              </label>
            );
          })}
        </fieldset>
        <input value={form.posterUrl} onChange={(e) => setForm({ ...form, posterUrl: e.target.value })} placeholder={t("posterUrl")} className={INPUT} />
        <input value={form.coverUrl} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })} placeholder={t("coverUrl")} className={INPUT} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">{t("freeEpisodesField")}
            <input type="number" min={0} max={MOVIES_MAX_FREE_EPISODES} value={form.freeEpisodes} onChange={(e) => setForm({ ...form, freeEpisodes: Number(e.target.value) })} className={INPUT} />
          </label>
          <label className="text-xs">{t("episodePrice")}
            <input type="number" min={1} step={0.5} value={form.priceSwyp} onChange={(e) => setForm({ ...form, priceSwyp: Number(e.target.value) })} className={INPUT} />
          </label>
        </div>
        <textarea value={form.licenseNote} onChange={(e) => setForm({ ...form, licenseNote: e.target.value })} placeholder={t("licenseNote")} rows={2} className={INPUT} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isAdult} onChange={(e) => setForm({ ...form, isAdult: e.target.checked })} /> {t("isAdultField")}
        </label>
        <button type="submit" className="rounded-xl bg-[#0D0D0D] px-4 py-2 text-sm font-bold text-white">{t("create")}</button>
      </form>
    </div>
  );
}
