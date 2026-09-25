"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import { Link } from "@/lib/i18n/navigation";

/** Starea streamului publicată prin același SSE (`event: state`, Redis `live:stream:<id>`). */
export type LiveStateUpdate = {
  status: "scheduled" | "live" | "ended" | "failed";
  viewers?: number;
  publishedAt?: string | null;
};

type ChatMsg = { id: number; user_id: string; message: string; username: string | null; display_name: string | null };

const MAX_VISIBLE = 50;

/** Chat suprapus peste video (SSE existent din /api/live/streams/[id]/chat). */
type Props = { streamId: string; canChat: boolean; signedIn: boolean; onState?: (state: LiveStateUpdate) => void };

export function LiveChat({ streamId, canChat, signedIn, onState }: Props) {
  const t = useTranslations("live.chat");
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    const es = new EventSource(`/api/live/streams/${streamId}/chat`);
    es.addEventListener("chat", (e: MessageEvent<string>) => {
      try {
        const m = JSON.parse(e.data) as ChatMsg;
        setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev.slice(-(MAX_VISIBLE - 1)), m]));
      } catch {
        // payload invalid — ignorat
      }
    });
    es.addEventListener("state", (e: MessageEvent<string>) => {
      try {
        onStateRef.current?.(JSON.parse(e.data) as LiveStateUpdate);
      } catch {
        // payload invalid — ignorat
      }
    });
    return () => es.close();
  }, [streamId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/live/streams/${streamId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (res.ok) setText("");
      else toast({ title: res.status === 429 ? t("slowDown") : t("sendFailed"), tone: "danger" });
    } catch {
      toast({ title: t("sendFailed"), tone: "danger" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pointer-events-auto flex max-h-[40dvh] flex-col">
      <div
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-16 [mask-image:linear-gradient(to_bottom,transparent,black_24px)]"
        aria-live="polite"
        aria-label={t("label")}
      >
        {messages.map((m) => (
          <p key={m.id} className="w-fit max-w-full rounded-control bg-black/35 px-2.5 py-1 text-sm text-white backdrop-blur-sm">
            <span className="mr-1.5 font-semibold text-white/80">{m.display_name || (m.username ? `@${m.username}` : t("anonymous"))}</span>
            {m.message}
          </p>
        ))}
        <div ref={endRef} />
      </div>
      {canChat ? (
        signedIn ? (
          <form onSubmit={send} className="mt-2 flex items-center gap-2">
            <label htmlFor="live-chat-input" className="sr-only">
              {t("placeholder")}
            </label>
            <input
              id="live-chat-input"
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("placeholder")}
              className="min-h-11 flex-1 rounded-full border border-white/20 bg-black/40 px-4 text-base text-white placeholder:text-white/60 backdrop-blur focus-visible:outline-none focus-visible:ring-2"
            />
            <IconButton type="submit" variant="overlay" label={t("send")} disabled={!text.trim() || sending}>
              <Send aria-hidden />
            </IconButton>
          </form>
        ) : (
          <Link
            href={`/auth?next=${encodeURIComponent(`/live/${streamId}`)}`}
            className="mt-2 inline-flex min-h-11 w-fit items-center rounded-full bg-black/40 px-4 text-sm font-semibold text-white backdrop-blur"
          >
            {t("signInToChat")}
          </Link>
        )
      ) : null}
    </div>
  );
}
