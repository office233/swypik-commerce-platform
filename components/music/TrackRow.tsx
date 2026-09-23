"use client";
import { useTranslations } from "next-intl";
import { Heart, ListPlus, Music2, Pause, Play } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import type { TrackDto } from "@/lib/music/types";
import { haptic } from "@/lib/haptic";
import { formatDuration } from "./format";
import { useMusicPlayer } from "./MusicPlayerProvider";

type Props = {
  track: TrackDto;
  queue: TrackDto[];
  index: number;
  onLike?: (track: TrackDto) => void;
  onAddToPlaylist?: (track: TrackDto) => void;
};

/**
 * Rând de listă pentru o piesă: copertă 48px, titlu/artist, durată, badge-uri
 * (premium/explicit/youtube) și acțiuni rapide (like, + playlist, folosește în reel).
 */
export default function TrackRow({ track, queue, index, onLike, onAddToPlaylist }: Props) {
  const t = useTranslations("music");
  const { current, playing, play, toggle } = useMusicPlayer();
  const isCurrent = current?.id === track.id;

  const handlePlay = () => {
    haptic("tap");
    if (isCurrent) toggle();
    else play(queue, index);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
      <button
        type="button"
        onClick={handlePlay}
        aria-label={isCurrent && playing ? t("pause") : t("play")}
        className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/10"
      >
        {track.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.coverUrl}
            alt={track.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100">
          {isCurrent && playing ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white" />}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={`truncate text-sm font-bold ${isCurrent ? "text-[#7C3AED]" : "text-white"}`}>{track.title}</p>
          {track.explicit && (
            <span className="shrink-0 rounded bg-white/15 px-1 text-[9px] font-black uppercase tracking-wide text-white/70">{t("explicitBadge")}</span>
          )}
          {track.isPremium && (
            <span className="shrink-0 rounded bg-[#7C3AED]/20 px-1 text-[9px] font-black uppercase tracking-wide text-[#A78BFA]">{t("premium")}</span>
          )}
        </div>
        {track.source === "youtube" ? (
          <span className="block truncate text-xs text-white/60">
            {track.artist.stageName}
          </span>
        ) : (
          <Link href={`/music/artist/${track.artist.slug}`} className="block truncate text-xs text-white/60 hover:text-white/80">
            {track.artist.stageName}
          </Link>
        )}
      </div>

      <span className="shrink-0 text-xs tabular-nums text-white/50">{formatDuration(track.durationMs)}</span>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => { haptic("tap"); onLike?.(track); }}
          aria-label={track.liked ? t("unlike") : t("like")}
          aria-pressed={track.liked}
          className="grid h-8 w-8 place-items-center rounded-full text-white/60 active:scale-95"
        >
          <Heart size={16} className={track.liked ? "fill-[#7C3AED] text-[#7C3AED]" : ""} />
        </button>
        <button
          type="button"
          onClick={() => { haptic("tap"); onAddToPlaylist?.(track); }}
          aria-label={t("addToPlaylist")}
          className="grid h-8 w-8 place-items-center rounded-full text-white/60 active:scale-95"
        >
          <ListPlus size={16} />
        </button>
        {track.audioTrackId !== null && (
          <Link
            href={`/upload?audio=${track.audioTrackId}`}
            aria-label={t("useInReel")}
            className="grid h-8 w-8 place-items-center rounded-full text-white/60 active:scale-95"
          >
            <Music2 size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}
