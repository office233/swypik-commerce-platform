"use client";

/**
 * Player-ul audio persistent al Swypik Music: un singur <audio> ascuns, stat
 * global (coadă, poziție, piesă blocată) și integrare MediaSession.
 *
 * Notă despre implementare: funcțiile interne (`playAt`, `refreshUrl`,
 * handlerii <audio>) sunt declarate ca `function` în corpul componentei —
 * beneficiază de hoisting (pot fi apelate una din alta indiferent de ordinea
 * din fișier) și citesc starea curentă din refs (nu din closures peste
 * state), ca listenerii <audio> să poată fi atașați o singură dată la montare
 * fără să devină „stale". Acțiunile publice din context (`play`, `next`, ...)
 * sunt `useCallback` cu deps goale din același motiv.
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
import type { TrackDto } from "@/lib/music/types";

export type MusicLockedInfo = {
    track: TrackDto;
    priceUnits: number | null;
    albumPriceUnits: number | null;
    balanceUnits: number | null;
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
                priceUnits?: number | null;
                albumPriceUnits?: number | null;
                balanceUnits?: number | null;
                requireAuth?: boolean;
            };
            return {
                locked: {
                    track,
                    priceUnits: data.priceUnits ?? null,
                    albumPriceUnits: data.albumPriceUnits ?? null,
                    balanceUnits: data.balanceUnits ?? null,
                    requireAuth: Boolean(data.requireAuth),
                },
            };
        }
        // 409 (not_ready) sau alt cod — piesa nu poate fi redată acum, se sare peste ea.
        return null;
    } catch {
        return null;
    }
}

/** Best-effort — un eșec de rețea nu trebuie să întrerupă redarea. */
function countPlay(trackId: string): void {
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

    const current = queue[index] ?? null;

    // Refs „în oglindă" cu state-ul reactiv — handlerii <audio> (atașați o
    // singură dată la montare) le citesc ca să nu lucreze cu valori învechite.
    const queueRef = useRef<TrackDto[]>(queue);
    const indexRef = useRef(index);
    const genRef = useRef(0);
    const hasSourceRef = useRef(false);
    const playedCountedRef = useRef(false);
    const erroredOnceRef = useRef(false);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { queueRef.current = queue; }, [queue]);
    useEffect(() => { indexRef.current = index; }, [index]);

    function clearRefreshTimer(): void {
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
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

    async function playAt(list: TrackDto[], i: number, gen: number): Promise<void> {
        if (gen !== genRef.current) return;

        if (i < 0) {
            // „prev" înainte de prima piesă: reia piesa curentă de la 0 (nu oprește).
            const audio = audioRef.current;
            if (audio && list.length > 0) {
                audio.currentTime = 0;
                setPositionMs(0);
            }
            return;
        }
        if (i >= list.length) {
            // Coada s-a epuizat — rămâne pe pauză la ultima poziție validă.
            setQueue(list);
            setPlaying(false);
            return;
        }

        const track = list[i];
        setQueue(list);
        setIndex(i);
        setLocked(null);
        setPositionMs(0);
        setDurationMs(track.durationMs);
        playedCountedRef.current = false;
        erroredOnceRef.current = false;
        clearRefreshTimer();

        const result = await requestPlayUrl(track);
        if (gen !== genRef.current) return;
        if (!result) {
            void playAt(list, i + 1, gen);
            return;
        }
        if (isLockedResult(result)) {
            setLocked(result.locked);
            void playAt(list, i + 1, gen);
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
            // autoplay poate fi blocat de browser — rămâne pe pauză, userul apasă play.
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
        // Piese mai scurte decât pragul de numărare: contorizate la final.
        if (!playedCountedRef.current) {
            playedCountedRef.current = true;
            const track = queueRef.current[indexRef.current];
            if (track) countPlay(track.id);
        }
        const gen = ++genRef.current;
        void playAt(queueRef.current, indexRef.current + 1, gen);
    }

    function handleError(): void {
        const track = queueRef.current[indexRef.current];
        if (!track) return;
        if (erroredOnceRef.current) {
            const gen = ++genRef.current;
            void playAt(queueRef.current, indexRef.current + 1, gen);
            return;
        }
        erroredOnceRef.current = true;
        const gen = genRef.current;
        void (async () => {
            // Token expirat pe la mijlocul redării — se recere URL-ul o singură dată.
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

    // Ascultătorii <audio> se atașează o singură dată — handlerii de mai sus
    // citesc mereu starea curentă din refs, deci nu devin „stale".
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
        const gen = ++genRef.current;
        void playAt(queueRef.current, indexRef.current + 1, gen);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const prev = useCallback(() => {
        const gen = ++genRef.current;
        void playAt(queueRef.current, indexRef.current - 1, gen);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const seek = useCallback((ms: number) => {
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

    // MediaSession: metadate + handlerii play/pause/next/previous din lock screen / cască.
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
            artwork: current.coverUrl ? [{ src: current.coverUrl }] : [],
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
    }), [current, queue, index, playing, positionMs, durationMs, play, toggle, next, prev, seek, close, locked, dismissLocked]);

    return (
        <MusicPlayerContext.Provider value={value}>
            {children}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio ref={audioRef} className="hidden" preload="none" />
        </MusicPlayerContext.Provider>
    );
}

/** Wrapper subțire, fără hook-uri: dacă flag-ul e OFF randează doar `children` cu context no-op. */
export default function MusicPlayerProvider({ children }: { children: ReactNode }) {
    if (!isEnabledClient("music")) {
        return <MusicPlayerContext.Provider value={DISABLED_CONTEXT}>{children}</MusicPlayerContext.Provider>;
    }
    return <ActiveMusicPlayerProvider>{children}</ActiveMusicPlayerProvider>;
}
