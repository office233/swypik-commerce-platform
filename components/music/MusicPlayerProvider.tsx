"use client";

/**
 * Player-ul audio persistent al Swypik Music: suport hibrid pentru:
 * 1. Audio nativ Swypik (R2, <audio> ascuns)
 * 2. YouTube Music (Iframe Player API ascuns offscreen sau floating PIP)
 * Păstrează starea globală (coadă, poziție, stare redare) și integrarea MediaSession.
 */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { isEnabledClient } from "@/lib/feature-flags-client";
import { MUSIC_PLAY_COUNT_AFTER_S } from "@/lib/music/config";
import {
    lockedAfterAdvance,
    decideYtPlayerAction,
    nextTrackIndex,
    buildShuffleOrder,
    type AdvanceReason,
    type RepeatMode,
    type YtTrackKind,
} from "@/lib/music/player-rules";
import type { TrackDto } from "@/lib/music/types";
import { loadYouTubeIframeApi, type YouTubePlayerInstance } from "@/lib/music/youtube-player";

/** API-ul YouTube IFrame expune și metode de volum, nedeclarate în tipul de bază din youtube-player.ts. */
interface YtPlayerWithVolume extends YouTubePlayerInstance {
    setVolume(volume: number): void;
    mute(): void;
    unMute(): void;
}

const MUSIC_VOLUME_STORAGE_KEY = "swypik_music_volume";
/** Docked-ul YT trebuie să stea deasupra MiniPlayer-ului (nu peste el) pe telefon îngust (360px):
 * bottom nav (56px) + gap (8px) + înălțimea MiniPlayer (~68px) + o marjă (16px). */
const YT_DOCKED_BOTTOM_PX = 148;

export type MusicLockedInfo = {
    track: TrackDto;
    /** Preț RON (cenți); `null` = „preț în curând" (creatorul nu l-a setat încă). */
    priceCents: number | null;
    albumPriceCents: number | null;
    requireAuth: boolean;
};

export type MusicPlayerContextValue = {
    current: TrackDto | null;
    queue: TrackDto[];
    index: number;
    playing: boolean;
    positionMs: number;
    durationMs: number;
    play: (tracks: TrackDto[], index?: number) => void;
    toggle: () => void;
    next: () => void;
    prev: () => void;
    seek: (ms: number) => void;
    close: () => void;
    locked: MusicLockedInfo | null;
    dismissLocked: () => void;
    /** YouTube video-ul e MEREU vizibil cât timp piesa redă (cerință ToS YouTube) — acest flag comută doar între docked (mic) și expanded (mare). */
    isVideoExpanded: boolean;
    toggleVideoExpanded: () => void;
    /** Setter explicit (nu doar toggle) — FullScreenPlayer forțează expanded=true la deschidere cu o piesă YouTube și collapse la închidere. */
    setVideoExpanded: (value: boolean) => void;
    shuffle: boolean;
    toggleShuffle: () => void;
    repeat: RepeatMode;
    cycleRepeat: () => void;
    volume: number;
    muted: boolean;
    setVolume: (value: number) => void;
    setMuted: (value: boolean) => void;
};

function noop(): void {}

/** Context implicit (flag OFF sau afară din provider): totul no-op, coadă goală. */
const DISABLED_CONTEXT: MusicPlayerContextValue = {
    current: null,
    queue: [],
    index: 0,
    playing: false,
    positionMs: 0,
    durationMs: 0,
    play: noop,
    toggle: noop,
    next: noop,
    prev: noop,
    seek: noop,
    close: noop,
    locked: null,
    dismissLocked: noop,
    isVideoExpanded: false,
    toggleVideoExpanded: noop,
    setVideoExpanded: noop,
    shuffle: false,
    toggleShuffle: noop,
    repeat: "off",
    cycleRepeat: noop,
    volume: 1,
    muted: false,
    setVolume: noop,
    setMuted: noop,
};

const MusicPlayerContext = createContext<MusicPlayerContextValue>(DISABLED_CONTEXT);

export function useMusicPlayer(): MusicPlayerContextValue {
    return useContext(MusicPlayerContext);
}

type PlayUrlOk = { url: string; expiresAt: number | null };
type PlayUrlLocked = { locked: MusicLockedInfo };
type PlayUrlResult = PlayUrlOk | PlayUrlLocked | null;

function isLockedResult(result: PlayUrlOk | PlayUrlLocked): result is PlayUrlLocked {
    return "locked" in result;
}

async function requestPlayUrl(track: TrackDto): Promise<PlayUrlResult> {
    try {
        const res = await fetch(`/api/music/tracks/${track.slug}/play`, { cache: "no-store" });
        if (res.status === 200) {
            const data = (await res.json()) as { url: string; expiresAt: number | null };
            return { url: data.url, expiresAt: data.expiresAt ?? null };
        }
        if (res.status === 402) {
            const data = (await res.json().catch(() => ({}))) as {
                priceCents?: number | null;
                albumPriceCents?: number | null;
                requireAuth?: boolean;
            };
            return {
                locked: {
                    track,
                    priceCents: data.priceCents ?? null,
                    albumPriceCents: data.albumPriceCents ?? null,
                    requireAuth: Boolean(data.requireAuth),
                },
            };
        }
        return null;
    } catch {
        return null;
    }
}

/** Best-effort — un eșec de rețea nu trebuie să întrerupă redarea. */
function countPlay(trackId: string): void {
    if (!trackId || trackId.startsWith("yt_")) return;
    try {
        void fetch("/api/music/plays", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trackId }),
            keepalive: true,
        });
    } catch {
        // ignorat intenționat
    }
}

function ActiveMusicPlayerProvider({ children }: { children: ReactNode }) {
    const t = useTranslations("music");
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const ytPlayerRef = useRef<YouTubePlayerInstance | null>(null);
    const ytReadyRef = useRef<boolean>(false);
    const ytPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [queue, setQueue] = useState<TrackDto[]>([]);
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [positionMs, setPositionMs] = useState(0);
    const [durationMs, setDurationMs] = useState(0);
    const [locked, setLocked] = useState<MusicLockedInfo | null>(null);
    /** Docked (mic, 16:9 min 200x112) implicit — NICIODATĂ ascuns cât timp piesa YouTube redă. */
    const [isVideoExpanded, setIsVideoExpanded] = useState(false);
    const [shuffle, setShuffle] = useState(false);
    const [repeat, setRepeat] = useState<RepeatMode>("off");
    const [volume, setVolumeValue] = useState(1);
    const [muted, setMutedValue] = useState(false);

    const current = queue[index] ?? null;

    const queueRef = useRef<TrackDto[]>(queue);
    const indexRef = useRef(index);
    const genRef = useRef(0);
    const hasSourceRef = useRef(false);
    const playedCountedRef = useRef(false);
    const erroredOnceRef = useRef(false);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shuffleRef = useRef(shuffle);
    const repeatRef = useRef(repeat);
    const shuffleOrderRef = useRef<number[]>([]);
    const prevYtKindRef = useRef<YtTrackKind>(null);
    const volumeRef = useRef(volume);
    const mutedRef = useRef(muted);

    useEffect(() => { queueRef.current = queue; }, [queue]);
    useEffect(() => { indexRef.current = index; }, [index]);
    useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
    useEffect(() => { repeatRef.current = repeat; }, [repeat]);
    useEffect(() => { volumeRef.current = volume; }, [volume]);
    useEffect(() => { mutedRef.current = muted; }, [muted]);
    useEffect(() => {
        shuffleOrderRef.current = buildShuffleOrder(queue.length);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queue, shuffle]);

    function clearRefreshTimer(): void {
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
    }

    function stopYtPoll(): void {
        if (ytPollIntervalRef.current) {
            clearInterval(ytPollIntervalRef.current);
            ytPollIntervalRef.current = null;
        }
    }

    function startYtPoll(): void {
        stopYtPoll();
        ytPollIntervalRef.current = setInterval(() => {
            const player = ytPlayerRef.current;
            if (!player || typeof player.getCurrentTime !== "function") return;
            try {
                const sec = player.getCurrentTime();
                const dur = player.getDuration();
                if (typeof sec === "number" && !isNaN(sec)) {
                    setPositionMs(Math.round(sec * 1000));
                    if (!playedCountedRef.current && sec >= MUSIC_PLAY_COUNT_AFTER_S) {
                        playedCountedRef.current = true;
                        const track = queueRef.current[indexRef.current];
                        if (track) countPlay(track.id);
                    }
                }
                if (typeof dur === "number" && !isNaN(dur) && dur > 0) {
                    setDurationMs(Math.round(dur * 1000));
                }
            } catch {
                // ignorat
            }
        }, 250);
    }

    /** Calculează piesa care urmează (secvențial sau shuffle, respectând repeat) și pornește redarea; `null` = capătul cozii. */
    function advance(reason: AdvanceReason, direction: "forward" | "backward" = "forward"): void {
        const list = queueRef.current;
        const idx = nextTrackIndex({
            queueLength: list.length,
            currentIndex: indexRef.current,
            direction,
            naturalEnd: reason === "ended",
            shuffle: shuffleRef.current,
            repeat: repeatRef.current,
            shuffleOrder: shuffleOrderRef.current,
        });
        const gen = ++genRef.current;
        if (idx === null) {
            if (direction === "backward") {
                void playAt(list, -1, gen); // fara piesa anterioara -> reia piesa curenta de la 0
            } else {
                void playAt(list, list.length, gen, reason); // fara piesa urmatoare -> opreste redarea
            }
            return;
        }
        void playAt(list, idx, gen, reason);
    }

    function destroyYtPlayer(): void {
        stopYtPoll();
        const yt = ytPlayerRef.current;
        if (yt && typeof yt.destroy === "function") {
            try { yt.destroy(); } catch { /* ignorat */ }
        }
        ytPlayerRef.current = null;
        ytReadyRef.current = false;
    }

    // (Re)inițializare YouTube Player iframe — vezi decideYtPlayerAction (lib/music/player-rules.ts)
    // pentru decizia init/load/destroy/none. Necesar pentru ca YT -> alta sursa -> YT sa functioneze:
    // containerul DOM (deci si iframe-ul) se demonteaza cand piesa curenta nu mai e YouTube, dar
    // ref-ul ramanea populat inainte de acest fix, asa ca urmatoarea piesa YT nu mai crea un player nou.
    useEffect(() => {
        const nextKind: YtTrackKind = current
            ? {
                  isYoutube: current.source === "youtube" || Boolean(current.youtubeVideoId),
                  videoId: current.youtubeVideoId || (current.source === "youtube" ? current.id.replace(/^yt_/, "") : null),
              }
            : null;
        const prevKind = prevYtKindRef.current;
        const action = decideYtPlayerAction(prevKind, nextKind, Boolean(ytPlayerRef.current));
        prevYtKindRef.current = nextKind;

        if (action.type === "destroy") {
            destroyYtPlayer();
            return;
        }
        if (action.type !== "init") return;

        let mounted = true;
        loadYouTubeIframeApi().then(() => {
            if (!mounted || !window.YT) return;
            if (ytPlayerRef.current) return;

            ytPlayerRef.current = new window.YT.Player("swypik-yt-player-element", {
                width: "100%",
                height: "100%",
                playerVars: {
                    // Player-ul YouTube este MEREU vizibil cât timp piesa redă (cerință ToS
                    // YouTube) — nu restricționăm tastatura, fullscreen-ul sau brandingul.
                    autoplay: 1,
                    controls: 1,
                    playsinline: 1,
                    rel: 0,
                    iv_load_policy: 3,
                },
                events: {
                    onReady: () => {
                        ytReadyRef.current = true;
                        applyVolumeToPlayers(volumeRef.current, mutedRef.current);
                    },
                    onStateChange: (event) => {
                        if (event.data === window.YT?.PlayerState.PLAYING) {
                            setPlaying(true);
                            startYtPoll();
                        } else if (event.data === window.YT?.PlayerState.PAUSED) {
                            setPlaying(false);
                            stopYtPoll();
                        } else if (event.data === window.YT?.PlayerState.ENDED) {
                            setPlaying(false);
                            stopYtPoll();
                            if (!playedCountedRef.current) {
                                playedCountedRef.current = true;
                                const tr = queueRef.current[indexRef.current];
                                if (tr) countPlay(tr.id);
                            }
                            advance("ended", "forward");
                        }
                    },
                    onError: () => {
                        stopYtPoll();
                        advance("error", "forward");
                    },
                },
            });
        }).catch(() => {});

        return () => {
            mounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current]);

    /** Reîmprospătează URL-ul cu token înainte să expire, dacă piesa încă redă. */
    function scheduleRefresh(track: TrackDto, expiresAt: number | null, list: TrackDto[], i: number, gen: number): void {
        clearRefreshTimer();
        if (!expiresAt) return;
        const delay = Math.max(2_000, expiresAt - Date.now() - 10_000);
        refreshTimerRef.current = setTimeout(() => {
            if (gen !== genRef.current) return;
            const audio = audioRef.current;
            if (!audio || audio.paused) return;
            void refreshUrl(track, list, i, gen);
        }, delay);
    }

    async function refreshUrl(track: TrackDto, list: TrackDto[], i: number, gen: number): Promise<void> {
        const result = await requestPlayUrl(track);
        if (gen !== genRef.current) return;
        if (!result || isLockedResult(result)) {
            const nextGen = ++genRef.current;
            void playAt(list, i + 1, nextGen);
            return;
        }
        const audio = audioRef.current;
        if (!audio) return;
        const wasPlaying = !audio.paused;
        const pos = audio.currentTime;
        audio.src = result.url;
        hasSourceRef.current = true;
        audio.currentTime = pos;
        if (wasPlaying) void audio.play().catch(() => {});
        scheduleRefresh(track, result.expiresAt, list, i, gen);
    }

    async function playAt(list: TrackDto[], i: number, gen: number, reason: AdvanceReason = "user"): Promise<void> {
        if (gen !== genRef.current) return;

        if (i < 0) {
            // „prev" înainte de prima piesă
            const currentTrack = list[0];
            const isYt = currentTrack?.source === "youtube" || Boolean(currentTrack?.youtubeVideoId);
            if (isYt && ytPlayerRef.current) {
                try { ytPlayerRef.current.seekTo(0, true); } catch {}
                setPositionMs(0);
            } else {
                const audio = audioRef.current;
                if (audio && list.length > 0) {
                    audio.currentTime = 0;
                    setPositionMs(0);
                }
            }
            return;
        }
        if (i >= list.length) {
            setQueue(list);
            setPlaying(false);
            return;
        }

        const track = list[i];
        setQueue(list);
        setIndex(i);
        setLocked((prev) => lockedAfterAdvance(prev, reason));
        setPositionMs(0);
        setDurationMs(track.durationMs);
        playedCountedRef.current = false;
        erroredOnceRef.current = false;
        clearRefreshTimer();
        stopYtPoll();

        // Flux direct pentru Radio Live, Audius, Jamendo, Podcast (100% nativ <audio>)
        if (track.streamUrl) {
            if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === "function") {
                try { ytPlayerRef.current.pauseVideo(); } catch {}
            }
            const audio = audioRef.current;
            if (!audio) return;
            audio.src = track.streamUrl;
            hasSourceRef.current = true;
            try {
                await audio.play();
            } catch {
                // autoplay poate fi blocat de browser
            }
            return;
        }

        const isYouTube = track.source === "youtube" || Boolean(track.youtubeVideoId);

        if (isYouTube) {
            // Oprim audio nativ dacă rula
            const audio = audioRef.current;
            if (audio) {
                audio.pause();
                audio.removeAttribute("src");
            }
            hasSourceRef.current = true;

            const videoId = track.youtubeVideoId || track.id.replace(/^yt_/, "");

            const triggerYtPlay = () => {
                const player = ytPlayerRef.current;
                if (!player) return;
                try {
                    player.loadVideoById(videoId);
                    player.playVideo();
                } catch {
                    // Posibil blocat de autoplay pe mobile fără tap
                }
            };

            if (ytReadyRef.current && ytPlayerRef.current) {
                triggerYtPlay();
            } else {
                void loadYouTubeIframeApi().then(() => {
                    const checkInterval = setInterval(() => {
                        if (ytReadyRef.current && ytPlayerRef.current) {
                            clearInterval(checkInterval);
                            triggerYtPlay();
                        }
                    }, 100);
                    setTimeout(() => clearInterval(checkInterval), 6000);
                });
            }
            return;
        }

        // Piese native Swypik (R2)
        if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === "function") {
            try { ytPlayerRef.current.pauseVideo(); } catch {}
        }

        const result = await requestPlayUrl(track);
        if (gen !== genRef.current) return;
        if (!result) {
            void playAt(list, i + 1, gen);
            return;
        }
        if (isLockedResult(result)) {
            setLocked(result.locked);
            void playAt(list, i + 1, gen, "locked");
            return;
        }

        const audio = audioRef.current;
        if (!audio) return;
        audio.src = result.url;
        hasSourceRef.current = true;
        scheduleRefresh(track, result.expiresAt, list, i, gen);
        try {
            await audio.play();
        } catch {
            // autoplay poate fi blocat de browser
        }
    }

    function handleTimeUpdate(): void {
        const audio = audioRef.current;
        if (!audio) return;
        setPositionMs(audio.currentTime * 1000);
        if (!playedCountedRef.current && audio.currentTime >= MUSIC_PLAY_COUNT_AFTER_S) {
            playedCountedRef.current = true;
            const track = queueRef.current[indexRef.current];
            if (track) countPlay(track.id);
        }
    }

    function handleLoadedMetadata(): void {
        const audio = audioRef.current;
        if (audio && Number.isFinite(audio.duration) && audio.duration > 0) setDurationMs(audio.duration * 1000);
    }

    function handleEnded(): void {
        if (!playedCountedRef.current) {
            playedCountedRef.current = true;
            const track = queueRef.current[indexRef.current];
            if (track) countPlay(track.id);
        }
        advance("ended", "forward");
    }

    function handleError(): void {
        const track = queueRef.current[indexRef.current];
        if (!track) return;
        if (track.streamUrl) {
            if (erroredOnceRef.current) {
                const nextGen = ++genRef.current;
                void playAt(queueRef.current, indexRef.current + 1, nextGen);
                return;
            }
            erroredOnceRef.current = true;
            return;
        }
        if (erroredOnceRef.current) {
            const gen = ++genRef.current;
            void playAt(queueRef.current, indexRef.current + 1, gen);
            return;
        }
        erroredOnceRef.current = true;
        const gen = genRef.current;
        void (async () => {
            const result = await requestPlayUrl(track);
            if (gen !== genRef.current) return;
            if (!result || isLockedResult(result)) {
                const nextGen = ++genRef.current;
                void playAt(queueRef.current, indexRef.current + 1, nextGen);
                return;
            }
            const audio = audioRef.current;
            if (!audio) return;
            audio.src = result.url;
            hasSourceRef.current = true;
            scheduleRefresh(track, result.expiresAt, queueRef.current, indexRef.current, gen);
            try {
                await audio.play();
            } catch {
                // rămâne pe pauză
            }
        })();
    }

    function handlePlayingEvt(): void { setPlaying(true); }
    function handlePauseEvt(): void { setPlaying(false); }

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("loadedmetadata", handleLoadedMetadata);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);
        audio.addEventListener("play", handlePlayingEvt);
        audio.addEventListener("playing", handlePlayingEvt);
        audio.addEventListener("pause", handlePauseEvt);
        return () => {
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("error", handleError);
            audio.removeEventListener("play", handlePlayingEvt);
            audio.removeEventListener("playing", handlePlayingEvt);
            audio.removeEventListener("pause", handlePauseEvt);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const play = useCallback((tracks: TrackDto[], startIndex = 0) => {
        const gen = ++genRef.current;
        void playAt(tracks, startIndex, gen);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggle = useCallback(() => {
        const tr = queueRef.current[indexRef.current];
        const isYouTube = tr?.source === "youtube" || Boolean(tr?.youtubeVideoId);

        if (isYouTube) {
            const player = ytPlayerRef.current;
            if (!player || typeof player.getPlayerState !== "function") return;
            try {
                const state = player.getPlayerState();
                if (state === 1) { // PLAYING
                    player.pauseVideo();
                } else {
                    player.playVideo();
                }
            } catch {
                // ignorat
            }
            return;
        }

        const audio = audioRef.current;
        if (!audio || !hasSourceRef.current) return;
        if (audio.paused) void audio.play().catch(() => {});
        else audio.pause();
    }, []);

    const next = useCallback(() => {
        advance("user", "forward");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const prev = useCallback(() => {
        advance("user", "backward");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const seek = useCallback((ms: number) => {
        const tr = queueRef.current[indexRef.current];
        if (tr?.isLive) return; // Fluxurile radio live nu au seek
        const isYouTube = tr?.source === "youtube" || Boolean(tr?.youtubeVideoId);

        if (isYouTube) {
            const player = ytPlayerRef.current;
            if (player && typeof player.seekTo === "function") {
                try {
                    player.seekTo(ms / 1000, true);
                    setPositionMs(ms);
                } catch {
                    // ignorat
                }
            }
            return;
        }

        const audio = audioRef.current;
        if (!audio || !hasSourceRef.current) return;
        const seconds = Math.max(0, ms / 1000);
        audio.currentTime = Number.isFinite(audio.duration) ? Math.min(audio.duration, seconds) : seconds;
        setPositionMs(ms);
    }, []);

    const close = useCallback(() => {
        genRef.current++;
        clearRefreshTimer();
        stopYtPoll();
        const audio = audioRef.current;
        if (audio) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
        }
        const yt = ytPlayerRef.current;
        if (yt && typeof yt.stopVideo === "function") {
            try { yt.stopVideo(); } catch {}
        }
        hasSourceRef.current = false;
        setQueue([]);
        setIndex(0);
        setPlaying(false);
        setPositionMs(0);
        setDurationMs(0);
        setLocked(null);
        setIsVideoExpanded(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const dismissLocked = useCallback(() => setLocked(null), []);
    const toggleVideoExpanded = useCallback(() => setIsVideoExpanded((prev) => !prev), []);
    const setVideoExpanded = useCallback((value: boolean) => setIsVideoExpanded(value), []);
    const toggleShuffle = useCallback(() => setShuffle((prev) => !prev), []);
    const cycleRepeat = useCallback(() => {
        setRepeat((prev) => (prev === "off" ? "all" : prev === "all" ? "one" : "off"));
    }, []);

    /** Aplică volumul/mute pe <audio> ȘI pe player-ul YouTube (dacă există) — cele două surse trebuie să sune la fel. */
    function applyVolumeToPlayers(vol: number, isMuted: boolean): void {
        const effective = isMuted ? 0 : vol;
        const audio = audioRef.current;
        if (audio) audio.volume = effective;
        const yt = ytPlayerRef.current as YtPlayerWithVolume | null;
        if (yt) {
            try {
                if (typeof yt.setVolume === "function") yt.setVolume(Math.round(effective * 100));
                if (isMuted && typeof yt.mute === "function") yt.mute();
                else if (!isMuted && typeof yt.unMute === "function") yt.unMute();
            } catch {
                // ignorat
            }
        }
    }

    function persistVolume(vol: number, isMuted: boolean): void {
        try {
            localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, JSON.stringify({ volume: vol, muted: isMuted }));
        } catch {
            // ignorat (localStorage indisponibil — mod privat etc.)
        }
    }

    const setVolume = useCallback((value: number) => {
        const clamped = Math.min(1, Math.max(0, value));
        setVolumeValue(clamped);
        setMutedValue(false);
        applyVolumeToPlayers(clamped, false);
        persistVolume(clamped, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setMuted = useCallback((value: boolean) => {
        setMutedValue(value);
        applyVolumeToPlayers(volumeRef.current, value);
        persistVolume(volumeRef.current, value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Volum persistat: citit o singură dată la montare (try/catch — poate lipsi/fi corupt).
    useEffect(() => {
        try {
            const raw = localStorage.getItem(MUSIC_VOLUME_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as { volume?: unknown; muted?: unknown };
                const vol = typeof parsed.volume === "number" && Number.isFinite(parsed.volume) ? Math.min(1, Math.max(0, parsed.volume)) : 1;
                const isMuted = typeof parsed.muted === "boolean" ? parsed.muted : false;
                setVolumeValue(vol);
                setMutedValue(isMuted);
                applyVolumeToPlayers(vol, isMuted);
            }
        } catch {
            // ignorat
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Aplică volumul curent de fiecare dată când pornește o piesă nouă (audio nou/player YT nou).
    useEffect(() => {
        applyVolumeToPlayers(volumeRef.current, mutedRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current]);

    // Curățenie la demontarea provider-ului: oprește intervalul de poll, timer-ul
    // de refresh al URL-ului și distruge instanța player-ului YouTube — evită
    // leak-uri de listeners/interval și un player „fantomă" care ar continua să redea.
    useEffect(() => {
        return () => {
            stopYtPoll();
            clearRefreshTimer();
            const yt = ytPlayerRef.current;
            if (yt && typeof yt.destroy === "function") {
                try { yt.destroy(); } catch { /* ignorat */ }
            }
            ytPlayerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // MediaSession: metadate + comenzi din lock screen / cască
    useEffect(() => {
        if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
        const session = navigator.mediaSession;
        if (!current) {
            session.metadata = null;
            return;
        }
        session.metadata = new MediaMetadata({
            title: current.title,
            artist: current.artist.stageName,
            album: current.isLive ? "Radio Live România" : (current.genre || "Swypik Audio"),
            artwork: current.coverUrl ? [{ src: current.coverUrl, sizes: "512x512", type: "image/jpeg" }] : [],
        });
        session.setActionHandler("play", () => toggle());
        session.setActionHandler("pause", () => toggle());
        session.setActionHandler("previoustrack", () => prev());
        session.setActionHandler("nexttrack", () => next());
        return () => {
            session.setActionHandler("play", null);
            session.setActionHandler("pause", null);
            session.setActionHandler("previoustrack", null);
            session.setActionHandler("nexttrack", null);
        };
    }, [current, toggle, prev, next]);

    useEffect(() => {
        if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
        navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    }, [playing]);

    const value = useMemo<MusicPlayerContextValue>(() => ({
        current,
        queue,
        index,
        playing,
        positionMs,
        durationMs,
        play,
        toggle,
        next,
        prev,
        seek,
        close,
        locked,
        dismissLocked,
        isVideoExpanded,
        toggleVideoExpanded,
        setVideoExpanded,
        shuffle,
        toggleShuffle,
        repeat,
        cycleRepeat,
        volume,
        muted,
        setVolume,
        setMuted,
    }), [
        current, queue, index, playing, positionMs, durationMs, play, toggle, next, prev, seek, close,
        locked, dismissLocked, isVideoExpanded, toggleVideoExpanded, setVideoExpanded,
        shuffle, toggleShuffle, repeat, cycleRepeat, volume, muted, setVolume, setMuted,
    ]);

    return (
        <MusicPlayerContext.Provider value={value}>
            {children}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio ref={audioRef} className="hidden" preload="none" />

            {/*
              * Container video YouTube: randat MEREU vizibil, la z-[60] (peste MiniPlayer/
              * FullScreenPlayer), cât timp piesa curentă e de pe YouTube (cerință ToS —
              * extragerea audio-only cu playerul ascuns off-screen e interzisă). Implicit
              * „docked" (cutie mică, min 200x112, 16:9), poziționat DEASUPRA MiniPlayer-ului
              * (nu peste el — vezi YT_DOCKED_BOTTOM_PX); „expanded" îl mărește peste
              * FullScreenPlayer. Închiderea (X) oprește complet piesa — nu doar o ascunde.
              */}
            {current?.source === "youtube" && (
                <div
                    id="swypik-yt-container"
                    className={
                        isVideoExpanded
                            ? "fixed inset-x-3 z-[60] mx-auto flex max-w-[560px] flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#0E0C15] shadow-2xl transition-all"
                            : "fixed right-3 z-[60] flex w-[220px] min-w-[200px] flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#0E0C15] shadow-2xl transition-all"
                    }
                    style={isVideoExpanded ? { top: "max(12px, env(safe-area-inset-top, 12px))" } : { bottom: `${YT_DOCKED_BOTTOM_PX}px` }}
                >
                    <div className="flex items-center justify-between px-3 py-1.5 bg-[#14121E] border-b border-white/10 select-none">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="h-2 w-2 rounded-full bg-[#7C3AED] animate-pulse" />
                            <span className="text-[11px] font-black tracking-wider text-white">SWYPIK</span>
                            <span className="text-[11px] font-black tracking-wider text-[#A78BFA]">PLAYER</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                            <button
                                type="button"
                                onClick={() => toggleVideoExpanded()}
                                aria-label={isVideoExpanded ? t("audio.videoCollapse") : t("audio.videoExpand")}
                                title={isVideoExpanded ? t("audio.videoCollapse") : t("audio.videoExpand")}
                                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                {isVideoExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => close()}
                                aria-label={t("audio.videoClose")}
                                title={t("audio.videoClose")}
                                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="relative aspect-video w-full min-h-[112px] bg-black">
                        <div id="swypik-yt-player-element" className="h-full w-full" />
                    </div>
                </div>
            )}
        </MusicPlayerContext.Provider>
    );
}

/** Wrapper subțire: dacă flag-ul e OFF randează doar `children` cu context no-op. */
export default function MusicPlayerProvider({ children }: { children: ReactNode }) {
    if (!isEnabledClient("music")) {
        return <MusicPlayerContext.Provider value={DISABLED_CONTEXT}>{children}</MusicPlayerContext.Provider>;
    }
    return <ActiveMusicPlayerProvider>{children}</ActiveMusicPlayerProvider>;
}
