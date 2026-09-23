"use client";

/**
 * Swypik Audio — Arhitectură unificată, modernă și 100% legală.
 * 4 Tab-uri native:
 * 1. Radio Live (Kiss FM, Radio ZU, Europa FM, Rock FM, Digi FM, etc.)
 * 2. Muzică & Beat-uri (Audius)
 * 3. Chill, Indie & Lounge (Jamendo)
 * 4. Podcasturi & Talk (Mind Architect, Recorder, Huberman Lab)
 * + Floating Mini Player & comenzi MediaSession în fundal.
 */
import { useEffect, useState } from "react";
import { ArrowLeft, Play, Pause, Search, X, Radio, Disc3, Sparkles, Mic, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import MusicBrand from "@/components/music/MusicBrand";
import TrackRow from "@/components/music/TrackRow";
import { useMusicPlayer } from "@/components/music/MusicPlayerProvider";
import { moviesDisplayFont, MOVIES_DISPLAY_CLASS } from "@/components/movies/fonts";
import { haptic } from "@/lib/haptic";
import StationBadge from "@/components/music/StationBadge";
import type { MusicHomeRow } from "@/lib/music/home";
import type { TrackDto } from "@/lib/music/types";
import type { AudioFeedResponse, AudioItemDto } from "@/lib/audio/types";
import { audioItemToTrackDto } from "@/lib/audio/types";
import MusicHomeRows from "./_components/MusicHomeRows";
import AddToPlaylistSheet from "./_components/AddToPlaylistSheet";
import LockedOverlay from "./_components/LockedOverlay";
import { setTrackLiked } from "./_lib/track-actions";

type AudioTabId = "radio" | "audius" | "jamendo" | "podcast" | "all";

interface AudioTab {
    id: AudioTabId;
    label: string;
    icon: typeof Radio;
    badge?: string;
}

const TABS: AudioTab[] = [
    { id: "radio", label: "Radio Live", icon: Radio, badge: "45k+" },
    { id: "audius", label: "Muzică & Beat-uri", icon: Disc3 },
    { id: "jamendo", label: "Chill & Lounge", icon: Sparkles },
    { id: "podcast", label: "Podcasturi", icon: Mic },
    { id: "all", label: "Toate", icon: Sparkles },
];

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
}

export default function MusicClient() {
    const t = useTranslations("music");
    const { current, playing, play, toggle, close } = useMusicPlayer();
    
    // Tab-ul implicit este Radio Live
    const [activeTab, setActiveTab] = useState<AudioTabId>("radio");
    const [tabTracks, setTabTracks] = useState<TrackDto[] | null>(null);
    const [isTabLoading, setIsTabLoading] = useState(false);
    
    const [home, setHome] = useState<{ featured: TrackDto | null; rows: MusicHomeRow[] } | null>(null);
    const [playlistTarget, setPlaylistTarget] = useState<TrackDto | null>(null);

    // Căutare audio
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<TrackDto[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    // Încărcare Home pentru tab-ul Explorează
    useEffect(() => {
        getJson<{ featured: TrackDto | null; rows: MusicHomeRow[] }>("/api/music/home")
            .then(setHome)
            .catch(() => {});
    }, []);

    // Încărcare date per tab
    useEffect(() => {
        if (activeTab === "all") return;

        setTabTracks(null);
        setIsTabLoading(true);
        getJson<AudioFeedResponse>(`/api/audio/feed?tab=${activeTab}`)
            .then((data) => {
                const items: TrackDto[] = [];
                data.sections?.forEach((s) => {
                    items.push(...s.items.map(audioItemToTrackDto));
                });
                setTabTracks(items);
                setIsTabLoading(false);
            })
            .catch(() => {
                setTabTracks([]);
                setIsTabLoading(false);
            });
    }, [activeTab]);

    // Căutare automată
    useEffect(() => {
        const trimmed = searchQuery.trim();
        if (!trimmed) {
            setSearchResults(null);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const timer = setTimeout(() => {
            getJson<{ items: AudioItemDto[] }>(`/api/audio/search?q=${encodeURIComponent(trimmed)}`)
                .then((data) => {
                    setSearchResults(data.items.map(audioItemToTrackDto));
                    setIsSearching(false);
                })
                .catch(() => {
                    setSearchResults([]);
                    setIsSearching(false);
                });
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const toggleLike = async (track: TrackDto, list: TrackDto[], setList: (l: TrackDto[]) => void) => {
        const next = !track.liked;
        setList(list.map((tr) => (tr.id === track.id ? { ...tr, liked: next } : tr)));
        const ok = await setTrackLiked(track.slug, next);
        if (!ok) setList(list.map((tr) => (tr.id === track.id ? { ...tr, liked: track.liked } : tr)));
    };

    return (
        <main className={`${moviesDisplayFont.variable} min-h-screen bg-[#0A0910] pb-32 text-white`}>
            {/* Header Sticky Curat & Mobile-First */}
            <header className="sticky top-0 z-30 bg-[#0A0910]/95 backdrop-blur-xl border-b border-white/10" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
                <div className="flex items-center justify-between gap-3 px-4 pb-2">
                    <div className="flex items-center gap-3">
                        <Link href="/" aria-label="Înapoi" className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 active:scale-95 transition-all">
                            <ArrowLeft size={18} />
                        </Link>
                        <MusicBrand size="md" />
                    </div>
                    <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-[10px] font-bold text-red-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        LIVE AUDIO
                    </span>
                </div>

                <div className="px-4 pb-2">
                    <div className="relative flex items-center">
                        <Search size={15} className="absolute left-3.5 text-white/40 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Caută radio, beat-uri, podcasturi..."
                            className="w-full rounded-xl bg-white/10 py-2 pl-9 pr-8 text-sm text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-[#7C3AED] focus:bg-white/15 transition-all"
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

                {/* Tab Bar Curat & Vizual */}
                {!searchQuery && (
                    <div className="flex items-center gap-2 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-x">
                        {TABS.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => {
                                        haptic("tap");
                                        setActiveTab(tab.id);
                                    }}
                                    className={`shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-all select-none ${
                                        isActive
                                            ? "bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-[0_0_16px_rgba(124,58,237,0.5)] scale-[1.02]"
                                            : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white border border-white/10"
                                    }`}
                                >
                                    <Icon size={14} className={isActive ? "text-white" : "text-white/60"} />
                                    <span>{tab.label}</span>
                                    {tab.badge && (
                                        <span className={`ml-0.5 text-[9px] px-1.5 py-0.2 rounded-full ${isActive ? "bg-white/25 text-white font-black" : "bg-white/15 text-white/70 font-medium"}`}>
                                            {tab.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </header>

            {/* Corpul Paginii */}
            {searchQuery ? (
                <section className="px-4 pt-4">
                    <h2 className="text-sm font-bold text-white/80 mb-3">Rezultate căutare</h2>
                    {isSearching && <p className="text-xs text-white/50 py-4">Căutare în curs...</p>}
                    {searchResults && searchResults.length === 0 && !isSearching && (
                        <p className="text-sm text-white/60 py-6 text-center">Nu s-a găsit niciun rezultat.</p>
                    )}
                    {searchResults && (
                        <div className="space-y-1">
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
                    )}
                </section>
            ) : activeTab === "radio" ? (
                /* ─── TAB 1: RADIO LIVE ─── */
                <section className="px-4 pt-4">
                    <div className="flex items-center justify-between pb-3">
                        <div>
                            <h1 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                                Posturi de Radio România Live
                            </h1>
                            <p className="text-xs text-white/50">Fluxuri oficiale live fără reclame suplimentare</p>
                        </div>
                    </div>

                    {isTabLoading ? (
                        <div className="py-16 text-center text-sm text-white/50">Se conectează la rețeaua radio...</div>
                    ) : tabTracks ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {tabTracks.map((station, i) => {
                                const isCurrent = current?.id === station.id;
                                const isCurrentPlaying = isCurrent && playing;
                                return (
                                    <button
                                        key={station.id}
                                        type="button"
                                        onClick={() => {
                                            haptic("tap");
                                            if (isCurrent) toggle();
                                            else play(tabTracks, i);
                                        }}
                                        className={`group relative flex flex-col items-center justify-between p-3.5 sm:p-4 rounded-2xl border text-center transition-all ${
                                            isCurrent
                                                ? "bg-[#7C3AED]/20 border-[#7C3AED] shadow-[0_0_24px_rgba(124,58,237,0.35)] scale-[1.02]"
                                                : "bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.98]"
                                        }`}
                                    >
                                        <div className="relative mb-2.5">
                                            <StationBadge
                                                slug={station.slug}
                                                title={station.title}
                                                coverUrl={station.coverUrl}
                                                size="md"
                                            />
                                            {isCurrentPlaying && (
                                                <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center pointer-events-none">
                                                    <span className="h-4 w-4 rounded-full bg-[#7C3AED] animate-ping" />
                                                </div>
                                            )}
                                        </div>

                                        <h3 className="font-bold text-sm text-white line-clamp-1 group-hover:text-[#A78BFA] transition-colors w-full">
                                            {station.title}
                                        </h3>
                                        <p className="text-[11px] text-white/50 line-clamp-1 mb-2.5 w-full">
                                            {station.genre || "Hituri & Pop"}
                                        </p>

                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-black uppercase text-red-400">
                                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                                LIVE
                                            </span>
                                            <div className={`h-7 w-7 rounded-full flex items-center justify-center shadow-md transition-colors ${
                                                isCurrentPlaying ? "bg-[#7C3AED] text-white" : "bg-white text-black group-hover:bg-[#7C3AED] group-hover:text-white"
                                            }`}>
                                                {isCurrentPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </section>
            ) : activeTab !== "all" ? (
                /* ─── TABS 2, 3, 4: MUZICĂ, CHILL, PODCASTURI ─── */
                <section className="px-4 pt-4">
                    <div className="pb-3">
                        <h1 className="text-lg font-bold text-white">
                            {TABS.find((t) => t.id === activeTab)?.label}
                        </h1>
                        <p className="text-xs text-white/50">
                            {activeTab === "audius" && "Trap, electronic și beat-uri urbane licențiate"}
                            {activeTab === "jamendo" && "Muzică relaxantă, ambientală și acustică Creative Commons"}
                            {activeTab === "podcast" && "Episoade recente din podcasturile tale preferate"}
                        </p>
                    </div>

                    {isTabLoading ? (
                        <div className="py-16 text-center text-sm text-white/50">Se încarcă fluxul...</div>
                    ) : tabTracks ? (
                        <div className="space-y-1">
                            {tabTracks.map((tr, i) => (
                                <TrackRow
                                    key={tr.id}
                                    track={tr}
                                    queue={tabTracks}
                                    index={i}
                                    onLike={(track) => toggleLike(track, tabTracks, setTabTracks)}
                                    onAddToPlaylist={setPlaylistTarget}
                                />
                            ))}
                        </div>
                    ) : null}
                </section>
            ) : (
                /* ─── TAB: TOATE / EXPLOREAZĂ ─── */
                <div className="pt-2">
                    {home && <MusicHomeRows rows={home.rows} />}
                </div>
            )}

            {/* Floating Mini Player (Când există piesă activă) */}
            {current && (
                <div
                    className="fixed inset-x-3 z-40 max-w-lg mx-auto rounded-2xl bg-[#13111C]/95 backdrop-blur-xl border border-white/15 p-2.5 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2"
                    style={{ bottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
                >
                    <div className="relative h-12 w-12 shrink-0 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center">
                        {current.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={current.coverUrl}
                                alt={current.title}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <Radio size={20} className="text-white/60" />
                        )}
                        {playing && (
                            <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-[#7C3AED] animate-pulse" />
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <p className="font-bold text-xs sm:text-sm text-white truncate">{current.title}</p>
                            {current.isLive && (
                                <span className="rounded bg-red-600 px-1 text-[8px] font-black uppercase text-white">LIVE</span>
                            )}
                        </div>
                        <p className="text-[11px] text-white/60 truncate">{current.artist.stageName}</p>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => { haptic("tap"); toggle(); }}
                            className="h-10 w-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                            aria-label={playing ? "Pauză" : "Redă"}
                        >
                            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                        </button>
                        <button
                            type="button"
                            onClick={() => close()}
                            className="h-8 w-8 rounded-full text-white/50 hover:text-white flex items-center justify-center"
                            aria-label="Închide player"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            <LockedOverlay />
            <AddToPlaylistSheet track={playlistTarget} onClose={() => setPlaylistTarget(null)} />
        </main>
    );
}
