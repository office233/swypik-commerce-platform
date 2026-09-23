"use client";

/**
 * Pagina principală /music: hero cu piesa `featured` (blur pe fundal, copertă,
 * titlu în fontul de afișare, Play care pune tot Top 10 în coadă), rândurile
 * de acasă (`MusicHomeRows`), filtrul pe genuri și bară de căutare dedicată
 * YouTube Music cu redare instantanee.
 */
import { useEffect, useState } from "react";
import { ArrowLeft, Play, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import MusicBrand from "@/components/music/MusicBrand";
import GenreChips from "@/components/music/GenreChips";
import TrackRow from "@/components/music/TrackRow";
import { useMusicPlayer } from "@/components/music/MusicPlayerProvider";
import { moviesDisplayFont, MOVIES_DISPLAY_CLASS } from "@/components/movies/fonts";
import { haptic } from "@/lib/haptic";
import type { MusicHomeRow } from "@/lib/music/home";
import type { MusicGenre } from "@/lib/music/genres";
import type { TrackDto } from "@/lib/music/types";
import MusicHomeRows from "./_components/MusicHomeRows";
import AddToPlaylistSheet from "./_components/AddToPlaylistSheet";
import LockedOverlay from "./_components/LockedOverlay";
import { setTrackLiked } from "./_lib/track-actions";

type Home = { featured: TrackDto | null; rows: MusicHomeRow[] };

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
}

export default function MusicClient() {
    const t = useTranslations("music");
    const { current, play } = useMusicPlayer();
    const [home, setHome] = useState<Home | null>(null);
    const [error, setError] = useState(false);
    const [genre, setGenre] = useState<MusicGenre | null>(null);
    const [genreItems, setGenreItems] = useState<TrackDto[] | null>(null);
    const [playlistTarget, setPlaylistTarget] = useState<TrackDto | null>(null);

    // Căutare YouTube Music
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<TrackDto[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        getJson<Home>("/api/music/home").then(setHome).catch(() => setError(true));
    }, []);

    useEffect(() => {
        if (!genre) { setGenreItems(null); return; }
        setGenreItems(null);
        getJson<{ items: TrackDto[] }>(`/api/music/tracks?genre=${genre}&sort=trending`)
            .then((d) => setGenreItems(d.items))
            .catch(() => setGenreItems([]));
    }, [genre]);

    // Căutare automată cu debounce
    useEffect(() => {
        const trimmed = searchQuery.trim();
        if (!trimmed) {
            setSearchResults(null);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const timer = setTimeout(() => {
            getJson<{ items: TrackDto[] }>(`/api/music/youtube/search?q=${encodeURIComponent(trimmed)}`)
                .then((data) => {
                    setSearchResults(data.items);
                    setIsSearching(false);
                })
                .catch(() => {
                    setSearchResults([]);
                    setIsSearching(false);
                });
        }, 350);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const toggleLike = async (track: TrackDto, list: TrackDto[], setList: (l: TrackDto[]) => void) => {
        const next = !track.liked;
        setList(list.map((tr) => (tr.id === track.id ? { ...tr, liked: next } : tr)));
        const ok = await setTrackLiked(track.slug, next);
        if (!ok) setList(list.map((tr) => (tr.id === track.id ? { ...tr, liked: track.liked } : tr)));
    };

    if (error) return <div className="flex min-h-screen items-center justify-center bg-[#0B0B12] text-white/70">{t("loadError")}</div>;

    const top10Row = home?.rows.find((r) => r.kind === "top10");
    const featured = home?.featured ?? null;
    const heroQueue = top10Row && top10Row.kind === "top10" && top10Row.items.length > 0 ? top10Row.items : featured ? [featured] : [];
    const isFeaturedCurrent = Boolean(featured && current?.id === featured.id);

    return (
        <main className={`${moviesDisplayFont.variable} min-h-screen bg-gradient-to-b from-[#0B0B12] to-black pb-28 text-white`}>
            <header className="fixed inset-x-0 top-0 z-30 bg-gradient-to-b from-black/95 via-black/85 to-transparent pb-2" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
                <div className="flex items-center gap-3 px-4 pb-2">
                    <Link href="/" aria-label={t("back")} className="rounded-full bg-black/40 p-2 text-white ring-1 ring-white/15 shrink-0"><ArrowLeft size={18} /></Link>
                    <div className="flex-1 min-w-0">
                        <div className="relative flex items-center">
                            <Search size={16} className="absolute left-3 text-white/50 pointer-events-none" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Caută piese, artiști..."
                                className="w-full rounded-full bg-white/10 py-1.5 pl-9 pr-9 text-sm text-white placeholder-white/40 outline-none ring-1 ring-white/15 focus:ring-[#7C3AED] focus:bg-white/15 transition-all"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2.5 grid h-5 w-5 place-items-center rounded-full bg-white/20 text-white/70 hover:text-white"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                    <MusicBrand size="md" />
                </div>
                {!searchQuery && <GenreChips selected={genre} onSelect={setGenre} />}
            </header>

            {searchQuery ? (
                <section className="px-0 pt-24">
                    <div className="flex items-center justify-between px-5 pb-3">
                        <h2 className="text-base font-bold text-white">Rezultate căutare</h2>
                        {isSearching && <span className="text-xs text-white/50">{t("loading")}</span>}
                    </div>
                    {isSearching && !searchResults ? (
                        <p className="px-5 text-sm text-white/50">{t("loading")}</p>
                    ) : searchResults && searchResults.length === 0 ? (
                        <p className="px-5 text-white/60">Nu s-a găsit nicio piesă.</p>
                    ) : searchResults ? (
                        <div>
                            {searchResults.map((tr, i) => (
                                <TrackRow
                                    key={tr.id}
                                    track={tr}
                                    queue={searchResults}
                                    index={i}
                                    onLike={(track) => toggleLike(track, searchResults, setSearchResults)}
                                    onAddToPlaylist={setPlaylistTarget}
                                />
                            ))}
                        </div>
                    ) : null}
                </section>
            ) : genre ? (
                <section className="px-0 pt-32">
                    {genreItems === null ? (
                        <p className="px-5 text-sm text-white/50">{t("loading")}</p>
                    ) : genreItems.length === 0 ? (
                        <p className="px-5 text-white/60">{t("emptyGenre")}</p>
                    ) : (
                        <div>
                            {genreItems.map((tr, i) => (
                                <TrackRow
                                    key={tr.id}
                                    track={tr}
                                    queue={genreItems}
                                    index={i}
                                    onLike={(track) => toggleLike(track, genreItems, setGenreItems)}
                                    onAddToPlaylist={setPlaylistTarget}
                                />
                            ))}
                        </div>
                    )}
                </section>
            ) : (
                <>
                    {featured ? (
                        <section className="relative h-[62vh] w-full overflow-hidden pt-14">
                            {featured.coverUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={featured.coverUrl}
                                    alt=""
                                    className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl"
                                />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B12] via-black/40 to-black/20" />
                            <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 px-5 pb-6">
                                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-white/10 shadow-2xl ring-1 ring-white/15 sm:h-32 sm:w-32">
                                    {featured.coverUrl && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={featured.coverUrl}
                                            alt={featured.title}
                                            className="h-full w-full object-cover"
                                        />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h1 className={`${MOVIES_DISPLAY_CLASS} truncate text-5xl leading-[0.9] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]`}>
                                        {featured.title}
                                    </h1>
                                    <Link href={`/music/artist/${featured.artist.slug}`} className="mt-1 block truncate text-sm text-white/70">
                                        {featured.artist.stageName}
                                    </Link>
                                    <div className="mt-3 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => { haptic("tap"); play(heroQueue, 0); }}
                                            className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-black text-black active:scale-95"
                                        >
                                            <Play size={18} fill="currentColor" /> {t("play")}
                                        </button>
                                        {isFeaturedCurrent && (
                                            <span className="rounded-full bg-[#7C3AED]/20 px-3 py-1 text-xs font-bold text-[#A78BFA] ring-1 ring-[#7C3AED]/40">
                                                {t("nowPlaying")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    ) : (
                        <div className="flex h-[50vh] items-end px-5 pb-8 pt-14">
                            <div>
                                <MusicBrand size="lg" />
                                <p className="mt-3 text-sm text-white/60">{!home ? t("loading") : home.rows.length === 0 ? t("empty") : ""}</p>
                            </div>
                        </div>
                    )}
                    {home && <MusicHomeRows rows={home.rows} />}
                </>
            )}

            <LockedOverlay />
            <AddToPlaylistSheet track={playlistTarget} onClose={() => setPlaylistTarget(null)} />
        </main>
    );
}
