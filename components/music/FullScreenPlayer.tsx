"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { ChevronDown, Heart, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, Radio } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMusicPlayer } from "./MusicPlayerProvider";
import { formatDuration } from "./format";
import StationBadge from "./StationBadge";
import { haptic } from "@/lib/haptic";
import { setTrackLiked } from "@/app/[locale]/music/_lib/track-actions";

type Props = {
    isOpen: boolean;
    onClose: () => void;
};

/** Surse externe fără like server-side — Swypik nu are ce persista pentru ele. */
const NON_LIKEABLE_SOURCES = new Set(["radio", "audius", "jamendo", "podcast"]);

export default function FullScreenPlayer({ isOpen, onClose }: Props) {
    const t = useTranslations("music");
    const {
        current,
        playing,
        positionMs,
        durationMs,
        toggle,
        next,
        prev,
        seek,
        shuffle,
        toggleShuffle,
        repeat,
        cycleRepeat,
        volume,
        muted,
        setVolume,
        setMuted,
    } = useMusicPlayer();
    const [isLiked, setIsLiked] = useState(false);
    const [likeBusy, setLikeBusy] = useState(false);

    useEffect(() => {
        if (current) setIsLiked(Boolean(current.liked));
    }, [current]);

    if (!isOpen || !current) return null;

    const pct = durationMs > 0 ? Math.min(100, Math.max(0, (positionMs / durationMs) * 100)) : 0;
    const canLike = !NON_LIKEABLE_SOURCES.has(current.source ?? "swypik");
    const showShuffleRepeat = !current.isLive;

    const handleSeek = (event: MouseEvent<HTMLDivElement>) => {
        if (durationMs <= 0 || current.isLive) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        seek(ratio * durationMs);
    };

    const toggleLike = async () => {
        if (!canLike || likeBusy) return;
        haptic("tap");
        const nextLiked = !isLiked;
        setIsLiked(nextLiked);
        setLikeBusy(true);
        const ok = await setTrackLiked(current.slug, nextLiked);
        setLikeBusy(false);
        if (!ok) setIsLiked(!nextLiked); // rollback — API-ul a eșuat
    };

    const repeatLabel =
        repeat === "one" ? t("audio.repeatOne") : repeat === "all" ? t("audio.repeatAll") : t("audio.repeatOff");

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-between bg-gradient-to-b from-[#1E1736] via-[#0E0C18] to-black px-6 py-6 text-white animate-in slide-in-from-bottom duration-300">
            <div>
                {/* Top Bar stil Spotify */}
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => { haptic("tap"); onClose(); }}
                        aria-label={t("close")}
                        className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 active:scale-95 transition-all"
                    >
                        <ChevronDown size={22} />
                    </button>
                    <div className="text-center">
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/50">
                            {current.isLive ? t("audio.radioLive") : t("title")}
                        </p>
                        <p className="text-xs font-black text-white/90 truncate max-w-[200px]">
                            {current.artist.stageName || t("title")}
                        </p>
                    </div>
                    {/* Slot simetric cu butonul din stânga, pentru centrarea titlului — fără acțiune de „opțiuni" încă neimplementată */}
                    <div className="h-9 w-9" aria-hidden="true" />
                </div>
            </div>

            {/* Artwork Mare Centrat */}
            <div className="my-auto flex flex-col items-center">
                <div className="relative aspect-square w-[75vw] max-w-[320px] overflow-hidden rounded-3xl bg-neutral-900 shadow-[0_24px_64px_rgba(124,58,237,0.35)] ring-1 ring-white/15">
                    {current.source === "radio" ? (
                            <div className="h-full w-full flex items-center justify-center p-8 bg-gradient-to-br from-[#1C162E] to-black">
                                <StationBadge slug={current.slug} title={current.title} coverUrl={current.coverUrl} size="lg" />
                            </div>
                        ) : current.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={current.coverUrl}
                                alt={current.title}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#7C3AED] to-[#EC4899] p-4 text-center">
                                <Radio size={48} className="text-white/80 mb-2" />
                                <span className="text-sm font-bold text-white line-clamp-2">{current.title}</span>
                            </div>
                        )}

                        {current.isLive && (
                            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600/90 backdrop-blur-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                                <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                {t("audio.liveAudio")}
                            </span>
                        )}
                    </div>
                </div>

            {/* Informații Piesă & Like */}
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-xl sm:text-2xl font-black text-white truncate drop-shadow">
                            {current.title}
                        </h2>
                        <p className="text-sm font-semibold text-white/60 truncate">
                            {current.artist.stageName}
                        </p>
                    </div>
                    {canLike && (
                        <button
                            type="button"
                            onClick={() => void toggleLike()}
                            aria-label={isLiked ? t("unlike") : t("like")}
                            disabled={likeBusy}
                            className="rounded-full p-2 text-white/70 hover:text-white active:scale-90 transition-transform disabled:opacity-60"
                        >
                            <Heart size={24} className={isLiked ? "fill-[#EC4899] text-[#EC4899]" : ""} />
                        </button>
                    )}
                </div>

                {/* Scrubber / Bară de Progres stil Spotify */}
                <div>
                    {current.isLive ? (
                        <div className="flex items-center justify-between py-2 px-1">
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping" />
                                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">{t("audio.liveStreamRadio")}</span>
                            </div>
                            <span className="text-xs font-mono text-white/50">{t("audio.direct")}</span>
                        </div>
                    ) : (
                        <>
                            <div
                                role="slider"
                                aria-label={t("nowPlaying")}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(pct)}
                                tabIndex={0}
                                onClick={handleSeek}
                                className="group relative h-2 w-full cursor-pointer rounded-full bg-white/15 py-1"
                            >
                                <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] via-[#A855F7] to-[#EC4899]" style={{ width: `${pct}%` }}>
                                    <div className="absolute right-0 top-1/2 -mt-1.5 h-3 w-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-white/50">
                                <span>{formatDuration(positionMs)}</span>
                                <span>{formatDuration(durationMs)}</span>
                            </div>
                        </>
                    )}
                </div>

                {/* Comenzi de Redare Principale stil Spotify */}
                <div className="flex items-center justify-between pt-2">
                    {showShuffleRepeat ? (
                        <button
                            type="button"
                            onClick={() => { haptic("tap"); toggleShuffle(); }}
                            aria-label={t("shuffle")}
                            aria-pressed={shuffle}
                            className={`p-2 transition-colors ${shuffle ? "text-[#A78BFA]" : "text-white/40 hover:text-white"}`}
                        >
                            <Shuffle size={20} />
                        </button>
                    ) : (
                        <div className="h-9 w-9" aria-hidden="true" />
                    )}

                    <button
                        type="button"
                        onClick={() => { haptic("tap"); prev(); }}
                        aria-label={t("previous")}
                        className="p-2 text-white/80 hover:text-white active:scale-95 transition-all"
                    >
                        <SkipBack size={26} />
                    </button>

                    <button
                        type="button"
                        onClick={() => { haptic("tap"); toggle(); }}
                        aria-label={playing ? t("pause") : t("play")}
                        className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-[#7C3AED] via-[#9333EA] to-[#EC4899] text-white shadow-[0_0_28px_rgba(124,58,237,0.6)] active:scale-90 hover:scale-105 transition-all"
                    >
                        {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                    </button>

                    <button
                        type="button"
                        onClick={() => { haptic("tap"); next(); }}
                        aria-label={t("next")}
                        className="p-2 text-white/80 hover:text-white active:scale-95 transition-all"
                    >
                        <SkipForward size={26} />
                    </button>

                    {showShuffleRepeat ? (
                        <button
                            type="button"
                            onClick={() => { haptic("tap"); cycleRepeat(); }}
                            aria-label={repeatLabel}
                            title={repeatLabel}
                            className={`p-2 transition-colors ${repeat !== "off" ? "text-[#A78BFA]" : "text-white/40 hover:text-white"}`}
                        >
                            {repeat === "one" ? <Repeat1 size={20} /> : <Repeat size={20} />}
                        </button>
                    ) : (
                        <div className="h-9 w-9" aria-hidden="true" />
                    )}
                </div>

                {/* Control Volum */}
                <div className="flex items-center gap-3 pt-2 px-2 text-white/40">
                    <button
                        type="button"
                        onClick={() => setMuted(!muted)}
                        aria-label={t("audio.mute")}
                        className="hover:text-white transition-colors"
                    >
                        {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={muted ? 0 : volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-[#7C3AED]"
                    />
                </div>
            </div>
        </div>
    );
}
