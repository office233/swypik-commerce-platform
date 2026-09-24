"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Video,
  Phone,
  Send,
  Search,
  CheckCheck,
  Check,
  ArrowLeft,
  UserPlus,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import ActiveCallOverlay from "@/components/messenger/Calls/ActiveCallOverlay";
import IncomingCallDialog from "@/components/messenger/Calls/IncomingCallDialog";
import AddContactModal, {
  type SwypikDirectoryUser,
} from "@/components/messenger/AddContactModal";
import { haptic } from "@/lib/haptic";

// ── Types mirroring the real DM backend (lib/dm/repository.ts) ────────────
interface ConversationPeer {
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}
interface ConversationSummary {
  id: string;
  kind: "dm" | "group";
  last_message_at: string | null;
  created_at: string;
  peer: ConversationPeer | null;
  last_message: { id: string; sender_id: string; body: string; created_at: string } | null;
  unread_count: number;
}
interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  media_url: string | null;
  created_at: string;
  status: string;
  pending?: boolean;
  failed?: boolean;
}
interface IncomingCallInfo {
  id: string;
  conversation_id: string;
  call_type: "audio" | "video";
  caller: { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
}

function peerLabel(peer: ConversationPeer | null, fallback: string): string {
  return peer?.display_name || (peer?.username ? `@${peer.username}` : fallback);
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const CALLS_ENABLED = Boolean(process.env.NEXT_PUBLIC_LIVEKIT_URL);
const INCOMING_CALL_POLL_MS = 5000;

export default function MessengerClient({
  viewerId,
  initialConversationId,
}: {
  viewerId: string;
  initialConversationId?: string;
}) {
  const t = useTranslations("messenger");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  const [mobileView, setMobileView] = useState<"list" | "chat">(initialConversationId ? "chat" : "list");
  const [searchQuery, setSearchQuery] = useState("");
  const [messages, setMessages] = useState<Record<string, DmMessage[]>>({});
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [activeCall, setActiveCall] = useState<{
    token: string;
    serverUrl: string;
    callType: "audio" | "video";
    callId: string;
  } | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const incomingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissedCallIds = useRef<Set<string>>(new Set());

  const selectedConversation = conversations.find((c) => c.id === selectedId) || null;

  // ── Load conversation list ──────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/dm/conversations");
      const data = await res.json();
      if (res.ok) setConversations(data.conversations || []);
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ── Load messages + mark read whenever the selection changes ───────────
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setMessagesLoading(true);
    fetch(`/api/dm/conversations/${selectedId}/messages?limit=50`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setMessages((prev) => ({ ...prev, [selectedId]: data.messages || [] }));
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });

    fetch(`/api/dm/conversations/${selectedId}/read`, { method: "POST" }).then(() => {
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedId]);

  // ── Realtime: SSE stream for the open conversation ──────────────────────
  useEffect(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (!selectedId) return;

    const es = new EventSource(`/api/dm/stream/${selectedId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const msg: DmMessage = JSON.parse(event.data);
        if (!msg?.id) return;
        setMessages((prev) => {
          const list = prev[selectedId] || [];
          if (list.some((m) => m.id === msg.id)) return prev;
          // Replace a matching optimistic bubble from this same sender if present.
          const withoutPending = list.filter(
            (m) => !(m.pending && m.sender_id === msg.sender_id && m.body === msg.body),
          );
          return { ...prev, [selectedId]: [...withoutPending, msg] };
        });
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? {
                  ...c,
                  last_message: { id: msg.id, sender_id: msg.sender_id, body: msg.body, created_at: msg.created_at },
                  last_message_at: msg.created_at,
                }
              : c,
          ),
        );
        if (msg.sender_id !== viewerId) {
          fetch(`/api/dm/conversations/${selectedId}/read`, { method: "POST" }).catch(() => {});
        }
      } catch {
        // ignore malformed SSE payloads
      }
    };

    return () => {
      es.close();
      if (eventSourceRef.current === es) eventSourceRef.current = null;
    };
  }, [selectedId, viewerId]);

  // ── Incoming call polling (lightweight signaling substitute) ───────────
  useEffect(() => {
    if (!CALLS_ENABLED) return;

    const poll = async () => {
      if (activeCall || incomingCall) return;
      try {
        const res = await fetch("/api/messenger/calls/incoming");
        if (!res.ok) return;
        const data = await res.json();
        const call: IncomingCallInfo | undefined = data.calls?.[0];
        if (call && !dismissedCallIds.current.has(call.id)) {
          setIncomingCall(call);
        }
      } catch {
        // network hiccup — try again next tick
      }
    };

    incomingPollRef.current = setInterval(poll, INCOMING_CALL_POLL_MS);
    poll();
    return () => {
      if (incomingPollRef.current) clearInterval(incomingPollRef.current);
    };
  }, [activeCall, incomingCall]);

  // ── Send message (optimistic, rollback on failure) ─────────────────────
  const handleSendMessage = () => {
    const text = inputVal.trim();
    if (!text || !selectedId) return;
    haptic("tap");

    const tempId = `temp_${Date.now()}`;
    const optimistic: DmMessage = {
      id: tempId,
      conversation_id: selectedId,
      sender_id: viewerId,
      body: text,
      media_url: null,
      created_at: new Date().toISOString(),
      status: "sent",
      pending: true,
    };
    setMessages((prev) => ({ ...prev, [selectedId]: [...(prev[selectedId] || []), optimistic] }));
    setInputVal("");

    fetch(`/api/dm/conversations/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.message) throw new Error(data.error || "send_failed");
        setMessages((prev) => ({
          ...prev,
          [selectedId]: (prev[selectedId] || []).map((m) => (m.id === tempId ? data.message : m)),
        }));
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? {
                  ...c,
                  last_message: { id: data.message.id, sender_id: viewerId, body: text, created_at: data.message.created_at },
                  last_message_at: data.message.created_at,
                }
              : c,
          ),
        );
      })
      .catch(() => {
        setMessages((prev) => ({
          ...prev,
          [selectedId]: (prev[selectedId] || []).map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
        }));
      });
  };

  const handleAddContactFromDirectory = (user: SwypikDirectoryUser, conversationId: string) => {
    setConversations((prev) => {
      if (prev.some((c) => c.id === conversationId)) return prev;
      const newConv: ConversationSummary = {
        id: conversationId,
        kind: "dm",
        last_message_at: null,
        created_at: new Date().toISOString(),
        peer: {
          user_id: user.id,
          username: user.username,
          display_name: user.displayName,
          avatar_url: user.avatarUrl,
        },
        last_message: null,
        unread_count: 0,
      };
      return [newConv, ...prev];
    });
    setSelectedId(conversationId);
    setMobileView("chat");
  };

  const startCall = async (callType: "audio" | "video", conversationId?: string, callId?: string) => {
    haptic("tap");
    try {
      const res = await fetch("/api/messenger/calls/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(callId ? { callId } : { conversationId, callType }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setActiveCall({ token: data.token, serverUrl: data.serverUrl, callType, callId: data.callId });
      } else if (res.status === 503) {
        alert(t("calls.unavailable"));
      } else {
        alert(t("calls.startError", { error: data.error || t("calls.unknownError") }));
      }
    } catch {
      alert(t("calls.networkError"));
    }
  };

  const handleAcceptIncoming = () => {
    if (!incomingCall) return;
    const call = incomingCall;
    setIncomingCall(null);
    startCall(call.call_type, undefined, call.id);
  };

  const handleDeclineIncoming = () => {
    if (!incomingCall) return;
    dismissedCallIds.current.add(incomingCall.id);
    fetch(`/api/messenger/calls/${incomingCall.id}/decline`, { method: "POST" }).catch(() => {});
    setIncomingCall(null);
  };

  const handleEndCall = () => {
    if (activeCall) {
      fetch(`/api/messenger/calls/${activeCall.callId}/end`, { method: "POST" }).catch(() => {});
    }
    setActiveCall(null);
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const label = peerLabel(c.peer, "").toLowerCase();
    return label.includes(q) || (c.peer?.username || "").toLowerCase().includes(q);
  });

  const currentMessages = selectedId ? messages[selectedId] || [] : [];

  return (
    <div className="flex h-screen bg-white text-slate-900 overflow-hidden font-sans">
      {/* ── LEFT: Conversation list ─────────────────────────────────────── */}
      <div
        className={`${
          mobileView === "chat" ? "hidden md:flex" : "flex"
        } w-full md:w-[380px] lg:w-[420px] flex-shrink-0 flex-col border-r border-slate-200/80 bg-white pb-16 md:pb-0 z-20`}
      >
        <div className="h-20 px-5 bg-white border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center font-black text-white shadow-lg shadow-violet-500/25">
              <Sparkles size={20} />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 text-lg leading-tight block">
                {t("title")}
              </span>
              <span className="text-[11px] text-slate-500 font-medium">{t("subtitle")}</span>
            </div>
          </div>

          <button
            onClick={() => {
              haptic("tap");
              setIsAddModalOpen(true);
            }}
            className="p-2.5 rounded-2xl bg-violet-50 hover:bg-violet-100 text-violet-700 transition flex items-center gap-1.5 text-xs font-bold shadow-xs active:scale-95"
            title={t("addContact")}
          >
            <UserPlus size={16} />
            <span className="hidden sm:inline">{t("addContact")}</span>
          </button>
        </div>

        <div className="p-4 bg-white border-b border-slate-100">
          <div className="relative">
            <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
          {conversationsLoading ? (
            <div className="py-10 text-center text-sm font-semibold text-slate-400">{t("loading")}</div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-10 text-center text-sm font-semibold text-slate-400">{t("noConversations")}</div>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = selectedId === c.id;
              const label = peerLabel(c.peer, t("unknownUser"));
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    haptic("tap");
                    setSelectedId(c.id);
                    setMobileView("chat");
                  }}
                  className={`flex items-center gap-3.5 p-3 rounded-2xl cursor-pointer transition active:scale-[0.99] ${
                    isSelected
                      ? "bg-violet-50/80 border border-violet-100 shadow-xs"
                      : "hover:bg-slate-50/80 border border-transparent"
                  }`}
                >
                  <div className="relative flex-shrink-0 w-12 h-12 rounded-2xl overflow-hidden ring-1 ring-slate-200 bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                    {c.peer?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.peer.avatar_url} alt={label} className="w-full h-full object-cover" />
                    ) : (
                      label.charAt(0).toUpperCase()
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h4 className="font-extrabold text-sm text-slate-900 truncate">{label}</h4>
                      <span className="text-[11px] font-semibold text-slate-400">
                        {formatTime(c.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      {c.peer?.username && (
                        <span className="text-xs font-semibold text-violet-600 block">@{c.peer.username}</span>
                      )}
                      {c.unread_count > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-black text-[10px] shadow-sm">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {c.last_message?.body || t("noMessagesYet")}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT: Active chat ──────────────────────────────────────────── */}
      <div
        className={`${
          mobileView === "list" ? "hidden md:flex" : "flex"
        } flex-1 flex-col bg-[#F9FAFB] relative h-full`}
      >
        {!selectedConversation ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-semibold">
            {t("selectConversation")}
          </div>
        ) : (
          <>
            <div className="h-20 px-5 bg-white border-b border-slate-200/80 flex items-center justify-between z-10 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => {
                    haptic("tap");
                    setMobileView("list");
                  }}
                  className="md:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-full transition"
                  title={t("backToList")}
                >
                  <ArrowLeft size={20} />
                </button>

                <div className="relative flex-shrink-0 w-11 h-11 rounded-2xl overflow-hidden ring-1 ring-slate-200 bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                  {selectedConversation.peer?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedConversation.peer.avatar_url}
                      alt={peerLabel(selectedConversation.peer, "")}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    peerLabel(selectedConversation.peer, t("unknownUser")).charAt(0).toUpperCase()
                  )}
                </div>

                <div className="min-w-0">
                  <h3 className="font-extrabold text-base text-slate-900 truncate">
                    {peerLabel(selectedConversation.peer, t("unknownUser"))}
                  </h3>
                  {selectedConversation.peer?.username && (
                    <span className="text-xs font-bold text-violet-600">@{selectedConversation.peer.username}</span>
                  )}
                </div>
              </div>

              {CALLS_ENABLED && (
                <div className="flex items-center gap-2 text-slate-700">
                  <button
                    onClick={() => startCall("video", selectedConversation.id)}
                    className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl transition flex items-center gap-1.5 text-xs font-bold shadow-md shadow-violet-500/20 active:scale-95"
                    title={t("calls.startVideo")}
                  >
                    <Video size={16} />
                    <span className="hidden sm:inline">{t("calls.startVideo")}</span>
                  </button>
                  <button
                    onClick={() => startCall("audio", selectedConversation.id)}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition active:scale-95"
                    title={t("calls.startAudio")}
                  >
                    <Phone size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-white to-slate-50">
              <div className="flex items-center justify-center my-2">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200/70 text-[11px] font-semibold text-slate-600 shadow-xs">
                  <ShieldCheck size={14} className="text-violet-600" />
                  <span>{t("securityBanner")}</span>
                </div>
              </div>

              {messagesLoading ? (
                <div className="text-center text-sm font-semibold text-slate-400">{t("loading")}</div>
              ) : (
                currentMessages.map((msg) => {
                  const isMe = msg.sender_id === viewerId;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[85%] sm:max-w-[65%] rounded-3xl p-4 shadow-sm text-sm relative transition-all ${
                          isMe
                            ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-xs shadow-violet-500/10"
                            : "bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs shadow-slate-200/50"
                        } ${msg.pending ? "opacity-60" : ""}`}
                      >
                        <p className="leading-relaxed break-words font-medium">{msg.body}</p>
                        <div
                          className={`flex items-center justify-end gap-1 mt-1.5 text-[10px] ${
                            isMe ? "text-violet-200" : "text-slate-400"
                          }`}
                        >
                          <span>{formatTime(msg.created_at)}</span>
                          {isMe && !msg.failed && (
                            <span>
                              {msg.pending ? <Check size={14} /> : <CheckCheck size={14} className="text-cyan-300" />}
                            </span>
                          )}
                          {msg.failed && (
                            <span className="text-rose-200 font-bold">{t("sendFailed")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              <div ref={messagesEndRef} />
            </div>

            <div
              className="bg-white border-t border-slate-200/80 p-3 sm:p-4 z-10"
              style={{ paddingBottom: "max(12px, calc(10px + env(safe-area-inset-bottom, 0px)))" }}
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder={t("messagePlaceholder")}
                  className="flex-1 bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 text-xs sm:text-sm px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputVal.trim()}
                  className="p-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white transition active:scale-95 shadow-md shadow-violet-500/25 disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <AddContactModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddContact={handleAddContactFromDirectory}
        existingContactIds={conversations.map((c) => c.peer?.user_id).filter((id): id is string => Boolean(id))}
      />

      {activeCall && (
        <ActiveCallOverlay
          serverUrl={activeCall.serverUrl}
          token={activeCall.token}
          callType={activeCall.callType}
          onDisconnect={handleEndCall}
        />
      )}

      {incomingCall && (
        <IncomingCallDialog
          callerName={peerLabel(
            {
              user_id: incomingCall.caller.id,
              username: incomingCall.caller.username,
              display_name: incomingCall.caller.display_name,
              avatar_url: incomingCall.caller.avatar_url,
            },
            t("unknownUser"),
          )}
          callerAvatar={incomingCall.caller.avatar_url || undefined}
          callType={incomingCall.call_type}
          onAccept={handleAcceptIncoming}
          onReject={handleDeclineIncoming}
        />
      )}
    </div>
  );
}
