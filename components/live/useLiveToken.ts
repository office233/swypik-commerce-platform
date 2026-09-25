"use client";

import { useEffect, useState } from "react";

export type LiveConnection = { token: string; serverUrl: string };
export type LiveTokenState =
  | { status: "idle" | "loading" }
  | { status: "ready"; connection: LiveConnection }
  | { status: "error"; code: string };

/**
 * Cere un token LiveKit (host/viewer) pentru un stream; `enabled` controlează
 * momentul, `attempt` (incrementat) forțează o cerere nouă (reconectare).
 */
export function useLiveToken(streamId: string, role: "host" | "viewer", enabled: boolean, attempt = 0): LiveTokenState {
  const [state, setState] = useState<LiveTokenState>({ status: "idle" });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/live/streams/${streamId}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as Partial<LiveConnection> & { error?: string };
        if (cancelled) return;
        if (res.ok && data.token && data.serverUrl) {
          setState({ status: "ready", connection: { token: data.token, serverUrl: data.serverUrl } });
        } else {
          setState({ status: "error", code: data.error ?? String(res.status) });
        }
      })
      .catch(() => !cancelled && setState({ status: "error", code: "network" }));
    return () => {
      cancelled = true;
    };
  }, [streamId, role, enabled, attempt]);

  return state;
}
