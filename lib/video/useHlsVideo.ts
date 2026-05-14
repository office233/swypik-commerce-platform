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
export function useHlsVideo(src: string | undefined | null) {
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
          // Conservative buffer for vertical feed swiping — we don't need to
          // buffer ahead aggressively because the user may swipe away.
          maxBufferLength: 15,
          maxMaxBufferLength: 30,
        });
        hlsInstance = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
      } catch {
        // Failed to load hls.js — fallback to direct src assignment.
        if (!cancelled) video.src = src;
      }
    })();

    return () => {
      cancelled = true;
      if (hlsInstance) {
        try {
          hlsInstance.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [src]);

  return ref;
}
