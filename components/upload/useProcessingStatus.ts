"use client";

import { useEffect, useRef, useState } from "react";
import { uploadApi, type UploadStatus } from "@/lib/upload/api";
import { VIDEO_LIMITS } from "@/lib/video/limits";

const TERMINAL = new Set(["ready", "failed", "aborted"]);

/**
 * Starea reală de procesare (etapă + procent scrise de worker), prin polling
 * cu backoff: pornește la statusPollMinMs, crește până la statusPollMaxMs cât
 * timp nimic nu se schimbă, se oprește la ready/failed și stă pe pauză cât
 * tab-ul e ascuns (reia imediat la revenire).
 */
export function useProcessingStatus(sessionId: string | null, enabled: boolean, pollKey = 0): UploadStatus | null {
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const lastSignature = useRef("");

  useEffect(() => {
    if (!sessionId || !enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay: number = VIDEO_LIMITS.statusPollMinMs;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return; // reluat de visibilitychange
      try {
        const next = await uploadApi.status(sessionId);
        if (cancelled) return;
        const signature = `${next.phase}:${next.stage}:${next.progress}:${next.errorCode}`;
        delay = signature === lastSignature.current
          ? Math.min(VIDEO_LIMITS.statusPollMaxMs, Math.round(delay * 1.5))
          : VIDEO_LIMITS.statusPollMinMs;
        lastSignature.current = signature;
        setStatus(next);
        if (TERMINAL.has(next.phase)) return;
      } catch {
        delay = Math.min(VIDEO_LIMITS.statusPollMaxMs, delay * 2);
      }
      timer = setTimeout(tick, delay);
    };

    const onVisible = () => {
      if (!document.hidden && !cancelled) {
        if (timer) clearTimeout(timer);
        delay = VIDEO_LIMITS.statusPollMinMs;
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId, enabled, pollKey]);

  return status;
}
