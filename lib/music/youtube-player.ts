/**
 * YouTube IFrame Player API loader & types pentru Swypik Music.
 * Încarcă scriptul oficial YouTube o singură dată și oferă o promisiune sigură.
 */

declare global {
    interface Window {
        YT?: {
            Player: new (
                elementId: string | HTMLElement,
                options: YouTubePlayerOptions
            ) => YouTubePlayerInstance;
            PlayerState: {
                UNSTARTED: number;
                ENDED: number;
                PLAYING: number;
                PAUSED: number;
                BUFFERING: number;
                CUED: number;
            };
        };
        onYouTubeIframeAPIReady?: () => void;
    }
}

export interface YouTubePlayerOptions {
    videoId?: string;
    width?: string | number;
    height?: string | number;
    playerVars?: {
        autoplay?: 0 | 1;
        controls?: 0 | 1;
        disablekb?: 0 | 1;
        fs?: 0 | 1;
        modestbranding?: 0 | 1;
        playsinline?: 0 | 1;
        rel?: 0 | 1;
        iv_load_policy?: 1 | 3;
        origin?: string;
    };
    events?: {
        onReady?: (event: { target: YouTubePlayerInstance }) => void;
        onStateChange?: (event: { data: number; target: YouTubePlayerInstance }) => void;
        onError?: (event: { data: number; target: YouTubePlayerInstance }) => void;
    };
}

export interface YouTubePlayerInstance {
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    loadVideoById(videoId: string): void;
    cueVideoById(videoId: string): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    destroy(): void;
    getIframe(): HTMLIFrameElement;
}

let apiPromise: Promise<void> | null = null;

export function loadYouTubeIframeApi(): Promise<void> {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Cannot load YouTube API on server"));
    }

    if (window.YT && window.YT.Player) {
        return Promise.resolve();
    }

    if (apiPromise) {
        return apiPromise;
    }

    apiPromise = new Promise<void>((resolve) => {
        const prevReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (prevReady) prevReady();
            resolve();
        };

        const existingScript = document.getElementById("yt-iframe-api");
        if (!existingScript) {
            const tag = document.createElement("script");
            tag.id = "yt-iframe-api";
            tag.src = "https://www.youtube.com/iframe_api";
            tag.async = true;
            document.head.appendChild(tag);
        }
    });

    return apiPromise;
}
