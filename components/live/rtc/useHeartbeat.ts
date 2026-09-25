"use client";

import { useEffect, useRef } from "react";
import { liveApi, LiveRtcError, type LivePulse } from "./client";

/** Erori după care nu mai are sens să trimitem heartbeat (sesiunea nu mai e validă). */
const FATAL = new Set(["stream_ended", "session_replaced", "forbidden", "not_found", "unauthorized"]);

/**
 * Heartbeat periodic pentru gazdă sau spectator. Primul puls pleacă imediat
 * (gazda trece din scheduled în live fără să aștepte un interval).
 */
export function useHeartbeat(
  streamId: string,
  role: "host" | "viewer",
  sessionId: string | null,
  intervalMs: number,
  onPulse: (pulse: LivePulse) => void,
  onFatal: (code: string) => void,
): void {
  const handlers = useRef({ onPulse, onFatal });
  handlers.current = { onPulse, onFatal };

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;
    const beat = async () => {
      try {
        const pulse = await liveApi<LivePulse>(streamId, "heartbeat", { method: "POST", body: { role, sessionId } });
        if (!stopped) handlers.current.onPulse(pulse);
      } catch (err) {
        const code = err instanceof LiveRtcError ? err.code : "unknown";
        if (!stopped && FATAL.has(code)) {
          stopped = true;
          handlers.current.onFatal(code);
        }
        // rețea / 5xx: următorul puls reîncearcă (TTL-ul tolerează câteva ratări)
      }
    };
    void beat();
    const timer = setInterval(() => void beat(), intervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [streamId, role, sessionId, intervalMs]);
}
