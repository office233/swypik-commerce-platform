"use client";

/**
 * Swypik Audio — Experiență completă de streaming audio stil Spotify,
 * cu brandingul nativ Swypik (Obsidian, Violet Neon #7C3AED, Pink Accent #EC4899).
 * 
 * 100% legal & diversificat:
 * 1. Radio Live România & Internațional (Radio Browser API - 45k+ stații)
 * 2. Muzică & Beat-uri (Audius API)
 * 3. Chill, Indie & Lounge (Jamendo API)
 * 4. Podcasturi & Talk (RSS / Podcasts API)
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Play, Pause, Search, X, Radio, Disc3, Sparkles, Mic, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import MusicBrand from "@/components/music/MusicBrand";
import TrackRow from "@/components/music/TrackRow";
import { useMusicPlayer } from "@/components/music/MusicPlayerProvider";
import { moviesDisplayFont } from "@/components/movies/fonts";
import { haptic } from "@/lib/haptic";
import StationBadge from "@/components/music/StationBadge";
import type { TrackDto } from "@/lib/music/types";
import type { AudioFeedResponse, AudioFeedSection, AudioItemDto } from "@/lib/audio/types";
import { audioItemToTrackDto } from "@/lib/audio/types";
import AddToPlaylistSheet from "./_components/AddToPlaylistSheet";
import LockedOverlay from "./_components/LockedOverlay";
import { setTrackLiked } from "./_lib/track-actions";

type AudioTabId = "all" | "radio" | "audius" | "jamendo" | "podcast";

interface AudioTab {
    id: AudioTabId;
    label: string;
    icon: typeof Sparkles;
    badge?: string;
}

const TABS: AudioTab[] = [
    { id: "all", label: "Toate", icon: Sparkles },
    { id: "radio", label: "Radio Live", icon: Radio, badge: "45k+" },
    { id: "audius", label: "Muzică & Beat-uri", icon: Disc3 },
    { id: "jamendo", label: "Chill & Lounge", icon: Sparkles },
    { id: "podcast", label: "Podcasturi", icon: Mic },
];

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
}

function getSpotifyGreeting(): string {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Bună dimineața";
    if (hour >= 12 && hour < 18) return "Bună ziua";
    return "Bună seara";
}

export default function MusicClient() {
    const t = useTranslations("music");
    const { current, playing, play, toggle } = useMusicPlayer();

    // Tab activ (implicit: Toate - Spotify Home Feed)
    const [activeTab, setActiveTab] = useState<AudioTabId>("all");
    const [feedSections, setFeedSections] = useState<AudioFeedSection[] | null>(null);
    const [tabTracks, setTabTracks] = useState<TrackDto[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [playlistTarget, setPlaylistTarget] = useState<TrackDto | null>(null);

    // Căutare audio globală
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<TrackDto[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    // Încărcare feed principal când tab === "all"
    useEffect(() => {
        if (activeTab !== "all") return;
        setIsLoading(true);
        getJson<AudioFeedResponse>("/api/audio/feed?tab=all")
            .then((data) => {
                setFeedSections(data.sections || []);
                setIsLoading(false);
            })
            .catch(() => {
                setFeedSections([]);
                setIsLoading(false);
            });
    }, [activeTab]);

    // Încărcare feed dedicat când un tab specific este selectat
    useEffect(() => {
        if (activeTab === "all") return;
        setTabTracks(null);
        setIsLoading(true);
        getJson<AudioFeedResponse>(`/api/audio/feed?tab=${activeTab}`)
            .then((data) => {
                const items: TrackDto[] = [];
                data.sections?.forEach((s) => {
                    items.push(...s.items.map(audioItemToTrackDto));
                });
                setTabTracks(items);
                setIsLoading(false);
            })
            .catch(() => {
                setTabTracks([]);
                setIsLoading(false);
            });
    }, [activeTab]);

    // Căutare live
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

    // Quick Play Grid (6 iteme Spotify) extrase din feed
    const quickGridItems = useMemo<TrackDto[]>(() => {
        if (!feedSections || feedSections.length === 0) return [];
        const result: TrackDto[] = [];

        const roRadioSection = feedSections.find((s) => s.id === "section-radio-ro");
        if (roRadioSection && roRadioSection.items.length > 0) {
            result.push(...roRadioSection.items.slice(0, 4).map(audioItemToTrackDto));
        }

        const audiusSection = feedSections.find((s) => s.id === "section-audius");
        if (audiusSection && audiusSection.items.length > 0) {
            result.push(audioItemToTrackDto(audiusSection.items[0]));
        }

        const jamendoSection = feedSections.find((s) => s.id === "section-jamendo");
        if (jamendoSection && jamendoSection.items.length > 0) {
            result.push(audioItemToTrackDto(jamendoSection.items[0]));
        }

        return result.slice(0, 6);
    }, [feedSections]);

    const toggleLike = async (track: TrackDto, list: TrackDto[], setList: (l: TrackDto[]) => void) => {
        const next = !track.liked;
        setList(list.map((tr) => (tr.id === track.id ? { ...tr, liked: next } : tr)));
        const ok = await setTrackLiked(track.slug, next);
        if (!ok) setList(list.map((tr) => (tr.id === track.id ? { ...tr, liked: track.liked } : tr)));
    };

    return (
        <main className={`${moviesDisplayFont.variable} min-h-screen bg-[#07060A] pb-36 text-white`}>
            {/* Header Sticky Curat cu Gradient Mesh Spotify */}
            <header
                className="sticky top-0 z-30 bg-[#07060A]/90 backdrop-blur-xl border-b border-white/5 transition-colors"
                style={{ paddingTop: "max(12px, env(safe-area-inset-top, 12px))" }}
            >
                <div className="flex items-center justify-between gap-3 px-4 pb-2.5">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/"
                            aria-label={t("back")}
                            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 active:scale-95 transition-all"
                        >
                            <ArrowLeft size={18} />
                        </Link>
                        <MusicBrand size="md" />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-[10px] font-black text-red-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                            LIVE AUDIO
                        </span>
                    </div>
                </div>

                {/* Bară de Căutare Spotify Style */}
                <div className="px-4 pb-2.5">
                    <div className="relative flex items-center">
                        <Search size={16} className="absolute left-3.5 text-white/40 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Caută radio, artiști, beat-uri, podcasturi..."
                            className="w-full rounded-full bg-white/10 py-2.5 pl-10 pr-9 text-sm text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-[#7C3AED] focus:bg-white/15 transition-all"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 grid h-5 w-5 place-items-center rounded-full bg-white/20 text-white/70 hover:text-white"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter Pills stil Spotify */}
                {!searchQuery && (
                    <div className="flex items-center gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-x">
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
                                            ? "bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-[0_0_16px_rgba(124,58,237,0.45)] scale-[1.02]"
                                            : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white border border-white/5"
                                    }`}
                                >
                                    <Icon size={13} className={isActive ? "text-white" : "text-white/60"} />
                                    <span>{tab.label}</span>
                                    {tab.badge && (
                                        <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                                            isActive ? "bg-white/25 text-white" : "bg-white/15 text-white/70"
                                        }`}>
                                            {tab.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </header>

            {/* Rezultate Căutare */}
            {searchQuery ? (
                <section className="px-4 pt-4">
                    <h2 className="text-sm font-bold text-white/80 mb-3">Rezultate căutare</h2>
                    {isSearching && <p className="text-xs text-white/50 py-4">Căutare în curs...</p>}
                    {searchResults && searchResults.length === 0 && !isSearching && (
                        <p className="text-sm text-white/60 py-8 text-center">Nu s-a găsit niciun rezultat.</p>
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
            ) : activeTab === "all" ? (
                /* ─── HOME TAB (SPOTIFY STYLE EXPERIENCE) ─── */
                <div className="pt-4 space-y-7">
                    {/* Greeting Header */}
                    <div className="px-4 flex items-baseline justify-between">
                        <h1 className="text-2xl font-black text-white tracking-tight">
                            {getSpotifyGreeting()}
                        </h1>
                        <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
                            Swypik Audio
                        </span>
                    </div>

                    {/* Spotify 6-Grid Quick Access */}
                    {quickGridItems.length > 0 && (
                        <section className="px-4">
                            <div className="grid grid-cols-2 gap-2.5">
                                {quickGridItems.map((track, i) => {
                                    const isCurrent = current?.id === track.id;
                                    const isCurrentPlaying = isCurrent && playing;
                                    return (
                                        <button
                                            key={track.id}
                                            type="button"
                                            onClick={() => {
                                                haptic("tap");
                                                if (isCurrent) toggle();
                                                else play(quickGridItems, i);
                                            }}
                                            className={`group relative flex h-14 items-center justify-between rounded-lg bg-white/[0.07] hover:bg-white/[0.12] border border-white/5 pr-2.5 overflow-hidden text-left transition-all ${
                                                isCurrent ? "bg-white/[0.15] ring-1 ring-[#7C3AED]" : ""
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0 pr-1 h-full">
                                                <div className="relative h-14 w-14 shrink-0 overflow-hidden bg-black/40 flex items-center justify-center">
                                                    {track.source === "radio" ? (
                                                        <StationBadge slug={track.slug} title={track.title} coverUrl={track.coverUrl} size="sm" />
                                                    ) : track.coverUrl ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={track.coverUrl}
                                                            alt={track.title}
                                                            referrerPolicy="no-referrer"
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <Radio size={20} className="text-white/60" />
                                                    )}
                                                </div>
                                                <span className="truncate text-xs font-bold text-white group-hover:text-[#C4B5FD] transition-colors">
                                                    {track.title}
                                                </span>
                                            </div>

                                            <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center shadow-lg transition-all ${
                                                isCurrentPlaying
                                                    ? "bg-[#7C3AED] text-white scale-105"
                                                    : "bg-white text-black opacity-0 group-hover:opacity-100 group-active:opacity-100 sm:group-hover:translate-y-0"
                                            }`}>
                                                {isCurrentPlaying ? (
                                                    <Pause size={15} fill="currentColor" />
                                                ) : (
                                                    <Play size={15} fill="currentColor" className="ml-0.5" />
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* Spotify Horizontal Carousels */}
                    {isLoading ? (
                        <div className="px-4 py-16 text-center text-sm text-white/40">
                            Se conectează la rețeaua audio...
                        </div>
                    ) : feedSections ? (
                        feedSections.map((section) => {
                            const trackList = section.items.map(audioItemToTrackDto);
                            return (
                                <section key={section.id} className="space-y-3">
                                    <div className="flex items-end justify-between px-4">
                                        <div>
                                            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                                                {section.source === "radio" && (
                                                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                                )}
                                                {section.title}
                                            </h2>
                                            {section.subtitle && (
                                                <p className="text-xs text-white/50 line-clamp-1">{section.subtitle}</p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                haptic("tap");
                                                setActiveTab(section.source as AudioTabId);
                                            }}
                                            className="text-xs font-bold text-[#A78BFA] hover:text-white flex items-center gap-0.5 shrink-0"
                                        >
                                            <span>Vezi toate</span>
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>

                                    {/* Carousel orizontal stil Spotify cu carduri pătrate */}
                                    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                        {trackList.map((track, i) => {
                                            const isCurrent = current?.id === track.id;
                                            const isCurrentPlaying = isCurrent && playing;
                                            return (
                                                <button
                                                    key={track.id}
                                                    type="button"
                                                    onClick={() => {
                                                        haptic("tap");
                                                        if (isCurrent) toggle();
                                                        else play(trackList, i);
                                                    }}
                                                    className="group relative w-[138px] sm:w-[155px] shrink-0 snap-start text-left cursor-pointer active:scale-95 transition-all"
                                                >
                                                    <div className="relative aspect-square overflow-hidden rounded-xl bg-white/[0.06] border border-white/10 shadow-md">
                                                        {track.source === "radio" ? (
                                                            <div className="h-full w-full flex items-center justify-center p-3 bg-gradient-to-br from-[#1A1528] to-black">
                                                                <StationBadge
                                                                    slug={track.slug}
                                                                    title={track.title}
                                                                    coverUrl={track.coverUrl}
                                                                    size="md"
                                                                />
                                                            </div>
                                                        ) : track.coverUrl ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                src={track.coverUrl}
                                                                alt={track.title}
                                                                referrerPolicy="no-referrer"
                                                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                                                loading="lazy"
                                                            />
                                                        ) : (
                                                            <div className="h-full w-full bg-gradient-to-br from-[#7C3AED] to-[#EC4899] flex flex-col items-center justify-center p-3 text-center">
                                                                <Radio size={24} className="text-white/80 mb-1" />
                                                                <span className="text-xs font-bold text-white line-clamp-1">{track.title}</span>
                                                            </div>
                                                        )}

                                                        {track.isLive && (
                                                            <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 text-[8px] font-black uppercase text-white shadow">
                                                                <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                                                                LIVE
                                                            </span>
                                                        )}

                                                        {/* Floating Circular Spotify Play Button */}
                                                        <div className={`absolute right-2 bottom-2 h-9 w-9 rounded-full flex items-center justify-center shadow-xl transition-all ${
                                                            isCurrentPlaying
                                                                ? "bg-[#7C3AED] text-white scale-100"
                                                                : "bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white opacity-0 group-hover:opacity-100 group-active:opacity-100 hover:scale-105"
                                                        }`}>
                                                            {isCurrentPlaying ? (
                                                                <Pause size={17} fill="currentColor" />
                                                            ) : (
                                                                <Play size={17} fill="currentColor" className="ml-0.5" />
                                                            )}
                                                        </div>
                                                    </div>

                                                    <p className={`mt-2 truncate text-xs font-bold ${
                                                        isCurrent ? "text-[#A78BFA]" : "text-white group-hover:text-[#C4B5FD]"
                                                    }`}>
                                                        {track.title}
                                                    </p>
                                                    <p className="truncate text-[11px] text-white/50">
                                                        {track.artist.stageName}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })
                    ) : null}
                </div>
            ) : activeTab === "radio" ? (
                /* ─── TAB: RADIO LIVE ─── */
                <section className="px-4 pt-4">
                    <div className="pb-3">
                        <h1 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                            Posturi de Radio România Live
                        </h1>
                        <p className="text-xs text-white/50">Fluxuri oficiale live fără reclame suplimentare</p>
                    </div>

                    {isLoading ? (
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
            ) : (
                /* ─── TABS: AUDIUS, JAMENDO, PODCASTURI ─── */
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

                    {isLoading ? (
                        <div className="py-16 text-center text-sm text-white/50">Se încarcă conținutul...</div>
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
            )}

            <LockedOverlay />
            <AddToPlaylistSheet track={playlistTarget} onClose={() => setPlaylistTarget(null)} />
        </main>
    );
}
