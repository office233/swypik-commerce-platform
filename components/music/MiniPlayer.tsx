"use client";

import { useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { Maximize2, Pause, Play, SkipForward, Tv, X } from "lucide-react";
import { usePathname } from "@/lib/i18n/navigation";
import { haptic } from "@/lib/haptic";
import StationBadge from "./StationBadge";
import FullScreenPlayer from "./FullScreenPlayer";
import { useMusicPlayer } from "./MusicPlayerProvider";

const BOTTOM_NAV_HIDDEN_PATHS = [
    "/movies", "/music", "/go", "/checkout", "/reels/record", "/seller", "/sellers",
    "/creator", "/admin", "/auth", "/upload", "/product", "/courier", "/developers",
];
const BOTTOM_NAV_HEIGHT_PX = 56;

const MINI_PLAYER_HIDDEN_PREFIXES = ["/go", "/checkout", "/kids"];
const MOVIES_PLAYER_PATH = /^\/movies\/[^/]+\/\d+/;

export default function MiniPlayer() {
    const t = useTranslations("music");
    const pathname = usePathname();
    const { current, playing, positionMs, durationMs, toggle, next, seek, close, isVideoExpanded, toggleVideoExpanded } = useMusicPlayer();
    const [showFullScreen, setShowFullScreen] = useState(false);

    if (!current) return null;

    const hiddenHere = MINI_PLAYER_HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)) || MOVIES_PLAYER_PATH.test(pathname);
    if (hiddenHere) return null;

    const bottomNavVisible = !BOTTOM_NAV_HIDDEN_PATHS.some((p) => pathname.startsWith(p));
    const pct = durationMs > 0 ? Math.min(100, Math.max(0, (positionMs / durationMs) * 100)) : 0;

    const handleSeek = (event: MouseEvent<HTMLDivElement>) => {
        if (durationMs <= 0 || current.isLive) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        seek(ratio * durationMs);
    };

    return (
        <>
            <div
                className="fixed left-2 right-2 sm:left-auto sm:right-4 sm:w-[420px] z-40 rounded-2xl bg-[#110F1C]/95 backdrop-blur-2xl border border-white/15 shadow-[0_12px_36px_rgba(0,0,0,0.7)] overflow-hidden transition-all"
                style={{
                    bottom: bottomNavVisible
                        ? `calc(${BOTTOM_NAV_HEIGHT_PX}px + 8px)`
                        : "max(12px, env(safe-area-inset-bottom, 12px))",
                }}
            >
                {/* Spotify Scrubber Bar */}
                <div
                    role="slider"
                    aria-label={t("nowPlaying")}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(pct)}
                    tabIndex={0}
                    onClick={handleSeek}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowRight") seek(Math.min(durationMs, positionMs + 5_000));
                        if (event.key === "ArrowLeft") seek(Math.max(0, positionMs - 5_000));
                    }}
                    className="h-1 w-full cursor-pointer bg-white/10"
                >
                    <div
                        className="h-full bg-gradient-to-r from-[#7C3AED] via-[#9333EA] to-[#EC4899] transition-[width] duration-200"
                        style={{ width: current.isLive ? "100%" : `${pct}%` }}
                    />
                </div>

                <div className="flex items-center gap-3 px-3 py-2.5">
                    {/* Thumbnail / Artwork (Click to expand full screen player) */}
                    <button
                        type="button"
                        onClick={() => {
                            haptic("tap");
                            setShowFullScreen(true);
                        }}
                        className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/10 cursor-pointer active:scale-95 transition-transform"
                    >
                        {current.source === "radio" ? (
                            <StationBadge slug={current.slug} title={current.title} coverUrl={current.coverUrl} size="sm" />
                        ) : current.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={current.coverUrl}
                                alt={current.title}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="h-full w-full bg-gradient-to-br from-[#7C3AED] to-[#EC4899] flex items-center justify-center text-xs font-bold text-white">
                                {current.title.slice(0, 2)}
                            </div>
                        )}
                        {current.isLive && (
                            <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                    </button>

                    {/* Metadata (Click to expand full screen player) */}
                    <button
                        type="button"
                        onClick={() => {
                            haptic("tap");
                            setShowFullScreen(true);
                        }}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                        <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs sm:text-sm font-bold text-white">
                                {current.title}
                            </span>
                            {current.isLive && (
                                <span className="rounded bg-red-600 px-1 py-0.2 text-[8px] font-black uppercase text-white tracking-wider">
                                    {t("audio.liveBadge")}
                                </span>
                            )}
                        </div>
                        <p className="truncate text-[11px] text-white/60">
                            {current.artist.stageName}
                        </p>
                    </button>

                    {/* Controls */}
                    <div className="flex items-center gap-1">
                        {current.source === "youtube" && (
                            <button
                                type="button"
                                onClick={() => { haptic("tap"); toggleVideoExpanded(); }}
                                aria-label={isVideoExpanded ? t("audio.videoCollapse") : t("audio.videoExpand")}
                                title={isVideoExpanded ? t("audio.videoCollapse") : t("audio.videoExpand")}
                                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold active:scale-95 transition-colors ${
                                    isVideoExpanded ? "bg-[#7C3AED] text-white" : "bg-white/10 text-white/70 hover:text-white"
                                }`}
                            >
                                <Tv size={15} />
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => { haptic("tap"); toggle(); }}
                            aria-label={playing ? t("pause") : t("play")}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black active:scale-90 hover:scale-105 transition-all shadow-md"
                        >
                            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
                        </button>
                        
                        <button
                            type="button"
                            onClick={() => { haptic("tap"); next(); }}
                            aria-label={t("next")}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/80 active:scale-90 hover:text-white transition-colors"
                        >
                            <SkipForward size={17} />
                        </button>

                        <button
                            type="button"
                            onClick={() => { haptic("tap"); setShowFullScreen(true); }}
                            aria-label={t("audio.expand")}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/50 active:scale-90 hover:text-white transition-colors"
                        >
                            <Maximize2 size={15} />
                        </button>

                        <button
                            type="button"
                            onClick={() => { haptic("tap"); close(); }}
                            aria-label={t("close")}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/40 active:scale-90 hover:text-white transition-colors"
                        >
                            <X size={15} />
                        </button>
                    </div>
                </div>
            </div>

            <FullScreenPlayer isOpen={showFullScreen} onClose={() => setShowFullScreen(false)} />
        </>
    );
}
