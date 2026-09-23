"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useHlsVideo } from "@/lib/video/useHlsVideo";
import PaywallSlide from "@/components/movies/PaywallSlide";
import { moviesDisplayFont, MOVIES_DISPLAY_CLASS } from "@/components/movies/fonts";
import type { EpisodeDto, SeriesDto } from "@/lib/movies/types";

type SeriesPayload = { series: SeriesDto; episodes: EpisodeDto[]; viewer: { balanceUnits: number | null } };
type PlayOk = { videoId: string; playbackUrl: string; poster: string | null };
type PlayLocked = { error: "locked"; priceUnits: number; seasonPriceUnits: number; balanceUnits: number | null; requireAuth: boolean };
type PlayState = { kind: "loading" } | { kind: "ok"; data: PlayOk } | { kind: "locked"; data: PlayLocked } | { kind: "error" };

const PROGRESS_INTERVAL_MS = 5000;
const SWIPE_THRESHOLD_PX = 80;
const PROGRESS_DOTS_MAX = 40;

function EpisodeVideo({
  src, poster, muted, onEnded, onTime, onError, resumeMs,
}: {
  src: string; poster: string | null; muted: boolean; onEnded: () => void; onTime: (ms: number, durationMs: number) => void; onError: () => void; resumeMs: number;
}) {
  const ref = useHlsVideo(src);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const seek = () => {
      if (resumeMs > 0 && v.currentTime < resumeMs / 1000) v.currentTime = resumeMs / 1000;
    };
    v.addEventListener("loadedmetadata", seek, { once: true });
    v.play().catch(() => undefined);
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [ref, src, resumeMs]);
  return (
    <video
      ref={ref}
      className="h-full w-full object-cover"
      playsInline
      muted={muted}
      poster={poster ?? undefined}
      onEnded={onEnded}
      onError={onError}
      onTimeUpdate={(e) => onTime(e.currentTarget.currentTime * 1000, e.currentTarget.duration * 1000)}
    />
  );
}

export default function PlayerClient({ slug, initialEpisode }: { slug: string; initialEpisode: number }) {
  const t = useTranslations("movies");
  const [payload, setPayload] = useState<SeriesPayload | null>(null);
  const [current, setCurrent] = useState(initialEpisode);
  const [play, setPlay] = useState<PlayState>({ kind: "loading" });
  const [muted, setMuted] = useState(false);
  const lastSentRef = useRef(0);

  const loadSeries = useCallback(
    () => fetch(`/api/movies/${slug}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setPayload).catch(() => setPlay({ kind: "error" })),
    [slug],
  );
  useEffect(() => { void loadSeries(); }, [loadSeries]);

  const loadPlay = useCallback(async (n: number) => {
    setPlay({ kind: "loading" });
    const res = await fetch(`/api/movies/${slug}/episodes/${n}/play`).catch(() => null);
    if (!res) { setPlay({ kind: "error" }); return; }
    const data = await res.json();
    if (res.ok) setPlay({ kind: "ok", data });
    else if (res.status === 402) setPlay({ kind: "locked", data });
    else setPlay({ kind: "error" });
  }, [slug]);
  useEffect(() => {
    void loadPlay(current);
    window.history.replaceState(null, "", `/movies/${slug}/${current}`);
  }, [current, loadPlay, slug]);

  const episode = payload?.episodes.find((e) => e.number === current) ?? null;
  const total = payload?.episodes.length ?? 0;

  const sendProgress = useCallback((positionMs: number, completed: boolean) => {
    // Vizitatorii anonimi nu au progres (nu există user în DB).
    if (!episode || !payload?.viewer || payload.viewer.balanceUnits === null) return;
    const body = JSON.stringify({ episodeId: episode.id, positionMs: Math.round(positionMs), completed });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/movies/progress", new Blob([body], { type: "application/json" }));
    else void fetch("/api/movies/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  }, [episode, payload]);

  const onTime = useCallback((ms: number) => {
    const now = Date.now();
    if (now - lastSentRef.current > PROGRESS_INTERVAL_MS) {
      lastSentRef.current = now;
      sendProgress(ms, false);
    }
  }, [sendProgress]);

  const goNext = useCallback(() => {
    sendProgress(episode?.durationMs ?? 0, true);
    if (current < total) setCurrent((c) => c + 1);
  }, [current, total, episode, sendProgress]);

  // Swipe vertical: sus = următorul, jos = anteriorul.
  const touchStart = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientY; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStart.current;
    touchStart.current = null;
    if (dy < -SWIPE_THRESHOLD_PX && current < total) setCurrent((c) => c + 1);
    if (dy > SWIPE_THRESHOLD_PX && current > 1) setCurrent((c) => c - 1);
  };

  return (
    <div className={`${moviesDisplayFont.variable} fixed inset-0 bg-black text-white`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {play.kind === "ok" && episode && (
        <EpisodeVideo
          src={play.data.playbackUrl}
          poster={play.data.poster}
          muted={muted}
          onEnded={goNext}
          onTime={onTime}
          onError={() => void loadPlay(current)}
          resumeMs={episode.progress?.completed ? 0 : episode.progress?.positionMs ?? 0}
        />
      )}
      {play.kind === "locked" && episode && payload && (
        <PaywallSlide
          slug={slug}
          episodeId={episode.id}
          episodeNumber={current}
          totalEpisodes={total}
          priceUnits={play.data.priceUnits}
          seasonPriceUnits={play.data.seasonPriceUnits}
          balanceUnits={play.data.balanceUnits}
          poster={payload.series.posterUrl}
          onUnlocked={() => { void loadSeries(); void loadPlay(current); }}
        />
      )}
      {play.kind === "error" && <div className="flex h-full items-center justify-center text-white/70">{t("loadError")}</div>}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <Link href={`/movies/${slug}`} aria-label={t("back")} className="pointer-events-auto rounded-full bg-black/50 p-2.5 backdrop-blur">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex flex-1 gap-1">
          {payload?.episodes.slice(0, PROGRESS_DOTS_MAX).map((e) => (
            <span key={e.id} className={`h-0.5 flex-1 rounded ${e.number < current ? "bg-white" : e.number === current ? "bg-gradient-to-r from-[#7C3AED] to-[#EC4899]" : "bg-white/25"}`} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? t("unmute") : t("mute")}
          className="pointer-events-auto rounded-full bg-black/50 p-2.5 backdrop-blur"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {payload && episode && play.kind === "ok" && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-5 pt-16"
          style={{ paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}
        >
          <p className={`${MOVIES_DISPLAY_CLASS} text-lg tracking-wider text-white/80`}>{payload.series.title}</p>
          <h2 className="text-lg font-black">{t("episodeOf", { n: current, total })} · {episode.title}</h2>
          {current < total && (
            <button type="button" onClick={goNext} className="mt-3 rounded-xl bg-white/15 px-4 py-2 text-xs font-bold backdrop-blur active:scale-95">
              {t("nextEpisode")} ↓
            </button>
          )}
        </div>
      )}
    </div>
  );
}
