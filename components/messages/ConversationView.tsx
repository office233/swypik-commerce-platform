"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MessageSender = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type ClientMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  media_url: string | null;
  reply_to_message_id: string | null;
  status: "sent" | "edited" | "deleted";
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  sender?: MessageSender;
  _optimistic?: boolean;
};

type Props = {
  conversationId: string;
  viewerId: string;
  initialMessages: ClientMessage[];
};

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" });
  } catch {
    return "";
  }
}

export default function ConversationView({
  conversationId,
  viewerId,
  initialMessages,
}: Props) {
  const [messages, setMessages] = useState<ClientMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Initial scroll + mark read
  useEffect(() => {
    scrollToBottom(false);
    fetch(`/api/dm/conversations/${conversationId}/read`, {
      method: "POST",
    }).catch(() => undefined);
  }, [conversationId, scrollToBottom]);

  // SSE subscription
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/dm/stream/${conversationId}`);
    } catch {
      return;
    }
    es.onmessage = (evt) => {
      try {
        const incoming = JSON.parse(evt.data) as ClientMessage;
        if (incoming?.conversation_id !== conversationId) return;
        setMessages((prev) => {
          // Replace optimistic if matched by sender + body + close ts
          let replaced = false;
          const next = prev.map((m) => {
            if (
              m._optimistic &&
              m.sender_id === incoming.sender_id &&
              m.body === incoming.body
            ) {
              replaced = true;
              return { ...incoming };
            }
            return m;
          });
          if (replaced) return next;
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
        // Auto mark read if it's the peer
        if (incoming.sender_id !== viewerId) {
          fetch(`/api/dm/conversations/${conversationId}/read`, {
            method: "POST",
          }).catch(() => undefined);
        }
        requestAnimationFrame(() => scrollToBottom());
      } catch {}
    };
    es.onerror = () => {
      // Browser will auto-reconnect; nothing to do.
    };
    return () => {
      es?.close();
    };
  }, [conversationId, viewerId, scrollToBottom]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setError(null);
    setSending(true);
    const tempId = `temp_${Date.now()}`;
    const optimistic: ClientMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: viewerId,
      body,
      media_url: null,
      reply_to_message_id: null,
      status: "sent",
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    requestAnimationFrame(() => scrollToBottom());

    try {
      const res = await fetch(
        `/api/dm/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Send failed (${res.status})`);
      }
      const data = (await res.json()) as { message: ClientMessage };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...data.message } : m)),
      );
    } catch (err: any) {
      setError(err?.message || "Failed to send");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(body);
    } finally {
      setSending(false);
    }
  }, [conversationId, draft, scrollToBottom, sending, viewerId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const grouped = useMemo(() => messages, [messages]);

  return (
    <>
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
      >
        {grouped.length === 0 ? (
          <p className="text-center text-gray-500 mt-8 text-sm">
            Say hello to start the conversation.
          </p>
        ) : (
          grouped.map((m) => {
            const mine = m.sender_id === viewerId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={[
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                    mine
                      ? "bg-[#0D0D0D] text-white rounded-br-sm"
                      : "bg-white/10 text-white rounded-bl-sm",
                    m._optimistic ? "opacity-70" : "",
                  ].join(" ")}
                >
                  <p>{m.body}</p>
                  <div
                    className={`mt-0.5 text-[10px] ${mine ? "text-white/70" : "text-gray-400"} text-right`}
                  >
                    {formatTime(m.created_at)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-white/5 bg-[#0D0D0D] px-3 py-3 flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message"
          rows={1}
          className="flex-1 resize-none rounded-2xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#0D0D0D] max-h-32"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded-full bg-[#0D0D0D] hover:bg-[#0E8F6F] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 transition"
        >
          Send
        </button>
      </form>
      {error && (
        <div className="px-4 pb-2 text-xs text-red-400" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
