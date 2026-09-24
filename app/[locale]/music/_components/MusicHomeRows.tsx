"use client";

/**
 * Rândurile orizontale ale paginii /music:
 * Carduri de piese și posturi cu suport pentru referrerPolicy="no-referrer",
 * fallback estetic pe gradient, și redare directă.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, Radio } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { haptic } from "@/lib/haptic";
import { useMusicPlayer } from "@/components/music/MusicPlayerProvider";
import { MOVIES_DISPLAY_CLASS } from "@/components/movies/fonts";
import { musicGenreLabelKey } from "@/lib/music/genres";
import type { MusicHomeRow, PlaylistSummary } from "@/lib/music/home";
import type { TrackDto } from "@/lib/music/types";

export function Row({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="mt-7">
            <h2 className="mb-2 px-5 text-base font-bold text-white/90">{title}</h2>
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 [scrollbar-width:none]">{children}</div>
        </section>
    );
}

function TrackCard({ track, queue, index }: { track: TrackDto; queue: TrackDto[]; index: number }) {
    const t = useTranslations("music");
    const { current, playing, play, toggle } = useMusicPlayer();
    const isCurrent = current?.id === track.id;
    const [imgError, setImgError] = useState(false);

    const handle = () => {
        haptic("tap");
        if (isCurrent) toggle();
        else play(queue, index);
    };

    return (
        <button
            type="button"
            onClick={handle}
            aria-label={isCurrent && playing ? t("pause") : t("play")}
            className="group relative w-[36vw] max-w-[150px] shrink-0 snap-start text-left"
        >
            <div className="relative aspect-square overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10 transition-transform group-hover:scale-105 group-active:scale-95 shadow-md">
                {track.coverUrl && !imgError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={track.coverUrl}
                        alt={track.title}
                        referrerPolicy="no-referrer"
                        onError={() => setImgError(true)}
                        className="h-full w-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#7C3AED]/80 to-[#2563EB]/80 flex flex-col items-center justify-center p-2 text-center">
                        <Radio size={24} className="text-white/80 mb-1" />
                        <span className="text-xs font-black text-white line-clamp-1">{track.title}</span>
                    </div>
                )}
                
                {track.isLive && (
                    <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        {t("audio.liveBadge")}
                    </span>
                )}

                <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100">
                    {isCurrent && playing ? <Pause size={24} className="text-white" /> : <Play size={24} className="text-white" />}
                </span>
                {track.isPremium && (
                    <span className="absolute right-1.5 top-1.5 rounded bg-[#7C3AED] px-1 text-[9px] font-black uppercase tracking-wide text-white">{t("premium")}</span>
                )}
            </div>
            <p className={`mt-2 truncate text-xs sm:text-sm font-bold ${isCurrent ? "text-[#A78BFA]" : "text-white"}`}>{track.title}</p>
            <p className="truncate text-[11px] text-white/50">{track.artist.stageName}</p>
        </button>
    );
}

function TopTenCard({ track, rank, queue, index }: { track: TrackDto; rank: number; queue: TrackDto[]; index: number }) {
    const t = useTranslations("music");
    const { current, playing, play, toggle } = useMusicPlayer();
    const isCurrent = current?.id === track.id;
    const [imgError, setImgError] = useState(false);

    const handle = () => {
        haptic("tap");
        if (isCurrent) toggle();
        else play(queue, index);
    };

    return (
        <button
            type="button"
            onClick={handle}
            aria-label={isCurrent && playing ? t("pause") : t("play")}
            className="group relative w-[36vw] max-w-[150px] shrink-0 snap-start text-left cursor-pointer active:scale-95 transition-all"
        >
            <div className="relative aspect-square overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/15 transition-transform group-hover:scale-105 shadow-lg">
                {track.coverUrl && !imgError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={track.coverUrl}
                        alt={track.title}
                        referrerPolicy="no-referrer"
                        onError={() => setImgError(true)}
                        className="h-full w-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] flex flex-col items-center justify-center p-2 text-center">
                        <Radio size={22} className="text-white/80 mb-1" />
                        <span className="text-xs font-black text-white line-clamp-1">{track.title}</span>
                    </div>
                )}

                {/* Spotify Rank Pill */}
                <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-xs font-black text-white shadow backdrop-blur-md ring-1 ring-white/20">
                    {rank}
                </span>
                
                {track.isLive && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[8px] font-black uppercase text-white shadow">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        {t("audio.liveBadge")}
                    </span>
                )}

                <div className={`absolute right-2 bottom-2 h-8 w-8 rounded-full flex items-center justify-center shadow-lg transition-all ${
                    isCurrent && playing
                        ? "bg-[#7C3AED] text-white scale-100"
                        : "bg-white text-black opacity-0 group-hover:opacity-100 group-active:opacity-100"
                }`}>
                    {isCurrent && playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
                </div>
            </div>
            <p className={`mt-2 truncate text-xs sm:text-sm font-bold ${isCurrent ? "text-[#A78BFA]" : "text-white"}`}>{track.title}</p>
            <p className="truncate text-[11px] text-white/50">{track.artist.stageName}</p>
        </button>
    );
}

function PlaylistChip({ playlist }: { playlist: PlaylistSummary }) {
    return (
        <Link
            href={`/music/playlist/${playlist.id}`}
            className="flex w-[38vw] max-w-[160px] shrink-0 snap-start flex-col justify-end rounded-xl bg-gradient-to-br from-[#7C3AED]/40 to-black p-3 ring-1 ring-white/10"
        >
            <p className="truncate text-[13px] font-bold text-white">{playlist.title}</p>
            <p className="text-[11px] text-white/60">{playlist.trackCount}</p>
        </Link>
    );
}

export default function MusicHomeRows({ rows }: { rows: MusicHomeRow[] }) {
    const t = useTranslations("music");
    return (
        <div className="space-y-2">
            {rows.map((row) => {
                switch (row.kind) {
                    case "top10":
                        return (
                            <Row key="top10" title={t("audio.rowTop10")}>
                                {row.items.map((tr, i) => <TopTenCard key={tr.id} track={tr} rank={i + 1} queue={row.items} index={i} />)}
                            </Row>
                        );
                    case "originals":
                        return (
                            <Row key="originals" title={t("audio.rowOriginals")}>
                                {row.items.map((tr, i) => <TrackCard key={tr.id} track={tr} queue={row.items} index={i} />)}
                            </Row>
                        );
                    case "latest":
                        return (
                            <Row key="latest" title={t("audio.rowLatest")}>
                                {row.items.map((tr, i) => <TrackCard key={tr.id} track={tr} queue={row.items} index={i} />)}
                            </Row>
                        );
                    case "liked":
                        return (
                            <Row key="liked" title={t("liked")}>
                                {row.items.map((tr, i) => <TrackCard key={tr.id} track={tr} queue={row.items} index={i} />)}
                            </Row>
                        );
                    case "genre":
                        return (
                            <Row key={`genre-${row.genre}`} title={t(musicGenreLabelKey(row.genre))}>
                                {row.items.map((tr, i) => <TrackCard key={tr.id} track={tr} queue={row.items} index={i} />)}
                            </Row>
                        );
                    case "playlists":
                        return (
                            <Row key="playlists" title={t("playlists")}>
                                {row.items.map((pl) => <PlaylistChip key={pl.id} playlist={pl} />)}
                            </Row>
                        );
                }
            })}
        </div>
    );
}
