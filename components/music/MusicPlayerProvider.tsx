"use client";

/**
 * Player-ul audio persistent al Swypik Music: audio nativ Swypik (R2, <audio> ascuns)
 * + surse legale audio-only (radio live, Audius, Jamendo, podcast).
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
import { isEnabledClient } from "@/lib/feature-flags-client";
import { MUSIC_PLAY_COUNT_AFTER_S } from "@/lib/music/config";
import {
    lockedAfterAdvance,
    nextTrackIndex,
    buildShuffleOrder,
    type AdvanceReason,
    type RepeatMode,
} from "@/lib/music/player-rules";
import type { TrackDto } from "@/lib/music/types";

const MUSIC_VOLUME_STORAGE_KEY = "swypik_music_volume";

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
    if (!trackId) return;
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
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const [queue, setQueue] = useState<TrackDto[]>([]);
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [positionMs, setPositionMs] = useState(0);
    const [durationMs, setDurationMs] = useState(0);
    const [locked, setLocked] = useState<MusicLockedInfo | null>(null);
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
            const audio = audioRef.current;
            if (audio && list.length > 0) {
                audio.currentTime = 0;
                setPositionMs(0);
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

        // Flux direct pentru Radio Live, Audius, Jamendo, Podcast (100% nativ <audio>)
        if (track.streamUrl) {
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

        // Piese native Swypik (R2)
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

        const audio = audioRef.current;
        if (!audio || !hasSourceRef.current) return;
        const seconds = Math.max(0, ms / 1000);
        audio.currentTime = Number.isFinite(audio.duration) ? Math.min(audio.duration, seconds) : seconds;
        setPositionMs(ms);
    }, []);

    const close = useCallback(() => {
        genRef.current++;
        clearRefreshTimer();
        const audio = audioRef.current;
        if (audio) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
        }
        hasSourceRef.current = false;
        setQueue([]);
        setIndex(0);
        setPlaying(false);
        setPositionMs(0);
        setDurationMs(0);
        setLocked(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const dismissLocked = useCallback(() => setLocked(null), []);
    const toggleShuffle = useCallback(() => setShuffle((prev) => !prev), []);
    const cycleRepeat = useCallback(() => {
        setRepeat((prev) => (prev === "off" ? "all" : prev === "all" ? "one" : "off"));
    }, []);

    function applyVolumeToPlayers(vol: number, isMuted: boolean): void {
        const effective = isMuted ? 0 : vol;
        const audio = audioRef.current;
        if (audio) audio.volume = effective;
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

    // Aplică volumul curent de fiecare dată când pornește o piesă nouă.
    useEffect(() => {
        applyVolumeToPlayers(volumeRef.current, mutedRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current]);

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
        locked, dismissLocked,
        shuffle, toggleShuffle, repeat, cycleRepeat, volume, muted, setVolume, setMuted,
    ]);

    return (
        <MusicPlayerContext.Provider value={value}>
            {children}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio ref={audioRef} className="hidden" preload="none" />
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
