"use client";

import { useEffect, useRef } from "react";
import type HlsType from "hls.js";

/**
 * useHlsVideo
 *
 * Returns a ref to attach to a <video> element. When `src` ends in `.m3u8`,
 * playback is wired through hls.js (or native HLS on Safari/iOS). For plain
 * mp4 (or any other src) the URL is assigned directly.
 *
 * Note: the hook sets `video.src` itself — do NOT also pass `src` to the
 * <video> element, or hls.js will fight the native loader.
 *
 * hls.js is loaded dynamically only when needed (non-Safari + HLS source),
 * keeping it out of the main bundle (~500KB savings on initial load).
 */
export function useHlsVideo(src: string | undefined | null, fallbackSrc?: string | undefined | null) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;

    const isHls = /\.m3u8(\?|$)/i.test(src);

    if (!isHls) {
      // Plain mp4 / webm / other progressive — let the browser handle it.
      video.src = src;
      return;
    }

    // Safari / iOS have native HLS support — prefer it (lower CPU, better
    // battery) and skip the hls.js download entirely.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    let cancelled = false;
    let hlsInstance: HlsType | null = null;
    let fallbackTried = false;
    let networkRecoveries = 0;
    let mediaRecoveries = 0;

    const fallbackToProgressive = () => {
      if (cancelled || fallbackTried || !fallbackSrc || fallbackSrc === src) return;
      fallbackTried = true;
      try {
        hlsInstance?.destroy();
      } catch {}
      video.src = fallbackSrc;
      video.load();
      void video.play().catch(() => {});
    };

    const onVideoError = () => fallbackToProgressive();
    video.addEventListener("error", onVideoError);

    void (async () => {
      try {
        const mod = await import("hls.js");
        const Hls = mod.default;
        if (cancelled || !ref.current) return;
        if (!Hls.isSupported()) {
          // Last-ditch fallback: try to assign directly. Browser will likely
          // fail but at least the error will surface via the <video> onError.
          video.src = src;
          return;
        }
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // Tuned for vertical short-form feed:
          //  - startLevel: -1 → let ABR pick from current bandwidth estimate
          //    instead of always starting at 360p; on fast networks we jump
          //    straight to 720p without a visible quality bump mid-playback.
          //  - capLevelToPlayerSize keeps mobile clients on lower rungs.
          //  - maxBufferLength 30s gives enough headroom that brief network
          //    jitter on 4G doesn't cause a stall; on 5-15s loops the cost
          //    of "wasted" buffer is negligible if user swipes.
          //  - backBufferLength 10 frees memory on long sessions.
          //  - manifestLoadingTimeOut 6s caps the worst-case cold start
          //    instead of the 10s default — fail over to fallbackSrc faster.
          startLevel: -1,
          capLevelToPlayerSize: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          backBufferLength: 10,
          manifestLoadingTimeOut: 6000,
          manifestLoadingMaxRetry: 2,
          fragLoadingTimeOut: 8000,
        });
        hlsInstance = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data?.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries < 2) {
            networkRecoveries += 1;
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
            mediaRecoveries += 1;
            hls.recoverMediaError();
            return;
          }
          fallbackToProgressive();
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } catch {
        // Failed to load hls.js — fallback to direct src assignment.
        if (!cancelled) video.src = src;
      }
    })();

    return () => {
      cancelled = true;
      video.removeEventListener("error", onVideoError);
      if (hlsInstance) {
        try {
          hlsInstance.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [src, fallbackSrc]);

  return ref;
}
