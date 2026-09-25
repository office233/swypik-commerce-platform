"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/Toast";

/** Apelurile apar doar când LiveKit e configurat la build (NEXT_PUBLIC_LIVEKIT_URL). */
export const CALLS_ENABLED = Boolean(process.env.NEXT_PUBLIC_LIVEKIT_URL);
const INCOMING_CALL_POLL_MS = 5000;

export type ActiveCall = { token: string; serverUrl: string; callType: "audio" | "video"; callId: string };
export type IncomingCall = {
  id: string;
  conversation_id: string;
  call_type: "audio" | "video";
  caller: { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
};

/** Pornire/acceptare/refuz apel + sondarea apelurilor primite cât timp chatul e deschis. */
export function useCalls() {
  const t = useTranslations("messenger.calls");
  const { toast } = useToast();
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const dismissed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!CALLS_ENABLED || active || incoming) return;
    const poll = async () => {
      try {
        const res = await fetch("/api/messenger/calls/incoming");
        if (!res.ok) return;
        const data = (await res.json()) as { calls?: IncomingCall[] };
        const call = data.calls?.[0];
        if (call && !dismissed.current.has(call.id)) setIncoming(call);
      } catch {
        // rețea — încercăm la următorul tick
      }
    };
    const timer = setInterval(poll, INCOMING_CALL_POLL_MS);
    void poll();
    return () => clearInterval(timer);
  }, [active, incoming]);

  const start = useCallback(
    async (callType: "audio" | "video", conversationId?: string, callId?: string) => {
      try {
        const res = await fetch("/api/messenger/calls/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(callId ? { callId } : { conversationId, callType }),
        });
        const data = (await res.json().catch(() => ({}))) as Partial<ActiveCall> & { error?: string };
        if (res.ok && data.token && data.serverUrl && data.callId) {
          setActive({ token: data.token, serverUrl: data.serverUrl, callType, callId: data.callId });
        } else if (res.status === 503) {
          toast({ title: t("unavailable"), tone: "danger" });
        } else {
          toast({ title: t("startError", { error: data.error || t("unknownError") }), tone: "danger" });
        }
      } catch {
        toast({ title: t("networkError"), tone: "danger" });
      }
    },
    [t, toast],
  );

  const accept = useCallback(() => {
    if (!incoming) return;
    const call = incoming;
    setIncoming(null);
    void start(call.call_type, undefined, call.id);
  }, [incoming, start]);

  const decline = useCallback(() => {
    if (!incoming) return;
    dismissed.current.add(incoming.id);
    fetch(`/api/messenger/calls/${incoming.id}/decline`, { method: "POST" }).catch(() => undefined);
    setIncoming(null);
  }, [incoming]);

  const end = useCallback(() => {
    if (active) fetch(`/api/messenger/calls/${active.callId}/end`, { method: "POST" }).catch(() => undefined);
    setActive(null);
  }, [active]);

  return { active, incoming, start, accept, decline, end };
}
