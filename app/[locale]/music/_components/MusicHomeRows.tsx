"use client";

/**
 * Rândurile orizontale ale paginii /music (echivalentul `components/movies/HomeRows.tsx`):
 * Top 10 cu cifre mari conturate, Originals, Noutăți, Îmi plac, genuri și
 * playlist-urile mele. Spre deosebire de Movies (unde un card navighează la
 * pagina serialului), aici cardurile pornesc redarea direct din coada
 * rândului — TrackClient rămâne calea pentru detalii.
 */
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Pause, Play } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { haptic } from "@/lib/haptic";
import { useMusicPlayer } from "@/components/music/MusicPlayerProvider";
import { MOVIES_DISPLAY_CLASS } from "@/components/movies/fonts";
import { musicGenreLabelKey } from "@/lib/music/genres";
import type { MusicHomeRow, PlaylistSummary } from "@/lib/music/home";
import type { TrackDto } from "@/lib/music/types";

export function Row({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="mt-6">
            <h2 className="mb-2 px-5 text-[15px] font-bold text-white/90">{title}</h2>
            <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">{children}</div>
        </section>
    );
}

function TrackCard({ track, queue, index }: { track: TrackDto; queue: TrackDto[]; index: number }) {
    const t = useTranslations("music");
    const { current, playing, play, toggle } = useMusicPlayer();
    const isCurrent = current?.id === track.id;

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
            className="group relative w-[38vw] max-w-[160px] shrink-0 snap-start text-left"
        >
            <div className="relative aspect-square overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10 transition-transform group-active:scale-95">
                {track.coverUrl ? (
                    <Image src={track.coverUrl} alt={track.title} fill sizes="38vw" className="object-cover" />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-black" />
                )}
                <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-active:opacity-100">
                    {isCurrent && playing ? <Pause size={22} className="text-white" /> : <Play size={22} className="text-white" />}
                </span>
                {track.isPremium && (
                    <span className="absolute right-1.5 top-1.5 rounded bg-[#7C3AED] px-1 text-[9px] font-black uppercase tracking-wide text-white">{t("premium")}</span>
                )}
            </div>
            <p className={`mt-1.5 truncate text-[13px] font-bold ${isCurrent ? "text-[#7C3AED]" : "text-white"}`}>{track.title}</p>
            <p className="truncate text-[11px] text-white/60">{track.artist.stageName}</p>
        </button>
    );
}

function TopTenCard({ track, rank, queue, index }: { track: TrackDto; rank: number; queue: TrackDto[]; index: number }) {
    const t = useTranslations("music");
    const { current, playing, play, toggle } = useMusicPlayer();
    const isCurrent = current?.id === track.id;

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
            className="group relative flex w-[52vw] max-w-[220px] shrink-0 snap-start items-end text-left"
        >
            <span
                aria-hidden
                className={`${MOVIES_DISPLAY_CLASS} pointer-events-none -mr-5 select-none text-[120px] leading-[0.8] text-black`}
                style={{ WebkitTextStroke: "3px rgba(124,58,237,0.75)" }}
            >
                {rank}
            </span>
            <div className="relative z-10 aspect-square w-[34vw] max-w-[140px] overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10 transition-transform group-active:scale-95">
                {track.coverUrl ? (
                    <Image src={track.coverUrl} alt={track.title} fill sizes="34vw" className="object-cover" />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-black" />
                )}
                <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-active:opacity-100">
                    {isCurrent && playing ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white" />}
                </span>
            </div>
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
        <>
            {rows.map((row) => {
                switch (row.kind) {
                    case "top10":
                        return (
                            <Row key="top10" title={t("top10")}>
                                {row.items.map((tr, i) => <TopTenCard key={tr.id} track={tr} rank={i + 1} queue={row.items} index={i} />)}
                            </Row>
                        );
                    case "originals":
                        return (
                            <Row key="originals" title={t("originals")}>
                                {row.items.map((tr, i) => <TrackCard key={tr.id} track={tr} queue={row.items} index={i} />)}
                            </Row>
                        );
                    case "latest":
                        return (
                            <Row key="latest" title={t("newReleases")}>
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
                            <Row key="playlists" title={t("myPlaylists")}>
                                {row.items.map((p) => <PlaylistChip key={p.id} playlist={p} />)}
                            </Row>
                        );
                }
            })}
        </>
    );
}
