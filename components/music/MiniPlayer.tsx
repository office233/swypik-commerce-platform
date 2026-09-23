"use client";

import type { MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, SkipForward, Tv, X } from "lucide-react";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { haptic } from "@/lib/haptic";
import { useMusicPlayer } from "./MusicPlayerProvider";

const BOTTOM_NAV_HIDDEN_PATHS = [
    "/movies", "/go", "/checkout", "/reels/record", "/seller", "/sellers",
    "/creator", "/admin", "/auth", "/upload", "/product", "/courier", "/developers",
];
const BOTTOM_NAV_HEIGHT_PX = 56;

const MINI_PLAYER_HIDDEN_PREFIXES = ["/go", "/checkout", "/kids"];
const MOVIES_PLAYER_PATH = /^\/movies\/[^/]+\/\d+/;

export default function MiniPlayer() {
    const t = useTranslations("music");
    const pathname = usePathname();
    const { current, playing, positionMs, durationMs, toggle, next, seek, close, isVideoVisible, toggleVideo } = useMusicPlayer();

    if (!current) return null;

    const hiddenHere = MINI_PLAYER_HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)) || MOVIES_PLAYER_PATH.test(pathname);
    if (hiddenHere) return null;

    const bottomNavVisible = !BOTTOM_NAV_HIDDEN_PATHS.some((p) => pathname.startsWith(p));
    const pct = durationMs > 0 ? Math.min(100, Math.max(0, (positionMs / durationMs) * 100)) : 0;

    const handleSeek = (event: MouseEvent<HTMLDivElement>) => {
        if (durationMs <= 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        seek(ratio * durationMs);
    };

    return (
        <div
            className="fixed left-0 right-0 z-40 border-t border-white/10 bg-[#0B0B12]/95 backdrop-blur-xl"
            style={{ bottom: bottomNavVisible ? `${BOTTOM_NAV_HEIGHT_PX}px` : "env(safe-area-inset-bottom, 0px)" }}
        >
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
                <div className="h-full bg-[#7C3AED]" style={{ width: `${pct}%` }} />
            </div>

            <div className="mx-auto flex max-w-lg items-center gap-3 px-3 py-2">
                {current.source === "youtube" ? (
                    <button
                        type="button"
                        onClick={() => { haptic("tap"); toggleVideo(); }}
                        className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/10 group cursor-pointer"
                        title={isVideoVisible ? "Ascunde video" : "Arată video"}
                    >
                        {current.coverUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={current.coverUrl}
                                alt={current.title}
                                className="h-full w-full object-cover"
                            />
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tv size={14} className="text-white" />
                        </div>
                    </button>
                ) : (
                    <Link href={`/music/track/${current.slug}`} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/10">
                        {current.coverUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={current.coverUrl}
                                alt={current.title}
                                className="h-full w-full object-cover"
                            />
                        )}
                    </Link>
                )}

                <div className="min-w-0 flex-1">
                    {current.source === "youtube" ? (
                        <div className="block truncate text-sm font-bold text-white">
                            {current.title}
                        </div>
                    ) : (
                        <Link href={`/music/track/${current.slug}`} className="block truncate text-sm font-bold text-white">
                            {current.title}
                        </Link>
                    )}
                    {current.source === "youtube" ? (
                        <div className="block truncate text-xs text-white/60">
                            {current.artist.stageName}
                        </div>
                    ) : (
                        <Link href={`/music/artist/${current.artist.slug}`} className="block truncate text-xs text-white/60">
                            {current.artist.stageName}
                        </Link>
                    )}
                </div>

                {current.source === "youtube" && (
                    <button
                        type="button"
                        onClick={() => { haptic("tap"); toggleVideo(); }}
                        aria-label={isVideoVisible ? "Ascunde video" : "Arată video"}
                        title={isVideoVisible ? "Ascunde video" : "Arată video"}
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold active:scale-95 transition-colors ${
                            isVideoVisible ? "bg-[#7C3AED] text-white" : "bg-white/10 text-white/70 hover:text-white"
                        }`}
                    >
                        <Tv size={15} />
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => { haptic("tap"); toggle(); }}
                    aria-label={playing ? t("pause") : t("play")}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black active:scale-95"
                >
                    {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                    type="button"
                    onClick={() => { haptic("tap"); next(); }}
                    aria-label={t("next")}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/80 active:scale-95"
                >
                    <SkipForward size={18} />
                </button>
                <button
                    type="button"
                    onClick={() => { haptic("tap"); close(); }}
                    aria-label={t("close")}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/50 active:scale-95"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
