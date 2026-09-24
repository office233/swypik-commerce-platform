"use client";

import { useState, useRef, useEffect } from "react";
import {
  Video,
  Phone,
  Send,
  Mic,
  Paperclip,
  CheckCheck,
  Check,
  Search,
  MoreVertical,
  Smile,
  ShieldCheck,
  Radio,
  ArrowLeft,
  UserPlus,
  ShoppingBag,
  Sparkles,
  Zap,
  Play,
  Pause,
  QrCode,
  Image as ImageIcon,
  Heart,
  Flame,
  ThumbsUp,
  Share2,
} from "lucide-react";
import ActiveCallOverlay from "@/components/messenger/Calls/ActiveCallOverlay";
import IncomingCallDialog from "@/components/messenger/Calls/IncomingCallDialog";
import AddContactModal, {
  type SwypikDirectoryUser,
} from "@/components/messenger/AddContactModal";
import { haptic } from "@/lib/haptic";

export interface MessageReaction {
  emoji: string;
  count: number;
  byMe: boolean;
}

export interface SharedProduct {
  id: string;
  title: string;
  price: string;
  image: string;
  rating: string;
}

export interface Message {
  id: string;
  sender: "me" | "peer";
  text: string;
  time: string;
  status: "sent" | "delivered" | "read";
  type?: "text" | "product" | "audio" | "tip";
  product?: SharedProduct;
  audioDuration?: string;
  tipAmount?: number;
  reactions?: MessageReaction[];
}

export interface ChatContact {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  online: boolean;
  category: "direct" | "seller" | "squad";
  badge?: string;
  badgeColor?: string;
}

const INITIAL_CONTACTS: ChatContact[] = [
  {
    id: "c1",
    name: "Alex Popescu",
    handle: "@alexpopescu",
    avatar:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    lastMessage: "Hai să ne auzim la un apel video să vedem produsele!",
    lastTime: "14:20",
    unread: 1,
    online: true,
    category: "direct",
    badge: "VIP",
    badgeColor: "bg-violet-100 text-violet-700 border-violet-200",
  },
  {
    id: "c2",
    name: "Urban Fashion Store",
    handle: "@urban.store",
    avatar:
      "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=150&auto=format&fit=crop&q=80",
    lastMessage: "Comanda ta #4892 a fost predată curierului Swypik Go 🚀",
    lastTime: "11:45",
    unread: 0,
    online: true,
    category: "seller",
    badge: "Magazin Oficial",
    badgeColor: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  {
    id: "c3",
    name: "Squad Buy • Căști ANC",
    handle: "@squad.anc30",
    avatar:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=150&auto=format&fit=crop&q=80",
    lastMessage: "Mai e nevoie de 1 persoană pentru reducerea de 30%!",
    lastTime: "Ieri",
    unread: 2,
    online: false,
    category: "squad",
    badge: "-30% Squad",
    badgeColor: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  },
  {
    id: "c4",
    name: "Swypik Concierge AI",
    handle: "@swypik.ai",
    avatar:
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
    lastMessage: "Am găsit 3 oferte reduse la zboruri pentru tine.",
    lastTime: "Marți",
    unread: 0,
    online: true,
    category: "direct",
    badge: "Asistent AI",
    badgeColor: "bg-cyan-100 text-cyan-700 border-cyan-200",
  },
];

const INITIAL_MESSAGES: Record<string, Message[]> = {
  c1: [
    {
      id: "m1",
      sender: "peer",
      text: "Salut! Ai văzut noul drop de adidași din stream-ul live?",
      time: "14:15",
      status: "read",
      type: "text",
    },
    {
      id: "m2",
      sender: "me",
      text: "Da, arată incredibil! Uite produsul exact:",
      time: "14:18",
      status: "read",
      type: "product",
      product: {
        id: "prod_sneakers",
        title: "Sneakers Streetwear Limited Edition",
        price: "349.00 RON",
        image:
          "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=300&auto=format&fit=crop&q=80",
        rating: "4.9",
      },
    },
    {
      id: "m3",
      sender: "peer",
      text: "Hai să ne auzim la un apel video să vedem produsele!",
      time: "14:20",
      status: "read",
      type: "text",
      reactions: [{ emoji: "🔥", count: 2, byMe: true }],
    },
  ],
  c2: [
    {
      id: "m_s1",
      sender: "peer",
      text: "Comanda ta #4892 a fost predată curierului Swypik Go 🚀",
      time: "11:45",
      status: "read",
      type: "text",
    },
  ],
};

export default function SwypikMessengerPage() {
  const [contacts, setContacts] = useState<ChatContact[]>(INITIAL_CONTACTS);
  const [selectedContact, setSelectedContact] = useState<ChatContact>(
    INITIAL_CONTACTS[0]
  );
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [filterTab, setFilterTab] = useState<"all" | "direct" | "seller" | "squad">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [messages, setMessages] = useState<Record<string, Message[]>>(INITIAL_MESSAGES);
  const [inputVal, setInputVal] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  // Apeluri LiveKit WebRTC
  const [activeCall, setActiveCall] = useState<{
    token: string;
    serverUrl: string;
    callType: "audio" | "video";
  } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    callerName: string;
    callerAvatar: string;
    callType: "audio" | "video";
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedContact, isTyping]);

  const handleSendMessage = (customPayload?: Partial<Message>) => {
    if (!inputVal.trim() && !customPayload) return;

    haptic("tap");
    const newMsg: Message = {
      id: "msg_" + Date.now(),
      sender: "me",
      text: inputVal.trim(),
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      status: "delivered",
      type: "text",
      ...customPayload,
    };

    setMessages((prev) => ({
      ...prev,
      [selectedContact.id]: [...(prev[selectedContact.id] || []), newMsg],
    }));

    setInputVal("");
    setShowAttachMenu(false);

    // Simulare răspuns dinamic cu indicator de tastare
    setTimeout(() => {
      setIsTyping(true);
    }, 800);

    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => ({
        ...prev,
        [selectedContact.id]: [
          ...(prev[selectedContact.id] || []),
          {
            id: "msg_reply_" + Date.now(),
            sender: "peer",
            text: "Am primit mesajul tău pe Swypik! Arată excelent 🚀",
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            status: "read",
            type: "text",
          },
        ],
      }));
    }, 2400);
  };

  const handleSendProduct = () => {
    handleSendMessage({
      text: "Am găsit acest produs genial pe Swypik:",
      type: "product",
      product: {
        id: "prod_viral_" + Date.now(),
        title: "Căști Wireless Pro ANC Noise-Canceling",
        price: "289.00 RON",
        image:
          "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=300&auto=format&fit=crop&q=80",
        rating: "5.0",
      },
    });
  };

  const handleSendVoiceNote = () => {
    handleSendMessage({
      text: "Notă vocală (0:18)",
      type: "audio",
      audioDuration: "0:18",
    });
  };

  const handleSendTip = () => {
    handleSendMessage({
      text: "Recompensă trimisă direct în contul de creator!",
      type: "tip",
      tipAmount: 50,
    });
  };

  const handleAddReaction = (msgId: string, emoji: string) => {
    haptic("tap");
    setMessages((prev) => {
      const contactMsgs = prev[selectedContact.id] || [];
      return {
        ...prev,
        [selectedContact.id]: contactMsgs.map((m) => {
          if (m.id !== msgId) return m;
          const existing = m.reactions || [];
          const found = existing.find((r) => r.emoji === emoji);
          if (found) {
            return {
              ...m,
              reactions: existing.map((r) =>
                r.emoji === emoji
                  ? { ...r, count: r.byMe ? r.count - 1 : r.count + 1, byMe: !r.byMe }
                  : r
              ).filter((r) => r.count > 0),
            };
          }
          return {
            ...m,
            reactions: [...existing, { emoji, count: 1, byMe: true }],
          };
        }),
      };
    });
  };

  const handleAddContactFromDirectory = (user: SwypikDirectoryUser) => {
    const existing = contacts.find((c) => c.id === user.id);
    if (!existing) {
      const newContact: ChatContact = {
        id: user.id,
        name: user.name,
        handle: user.handle,
        avatar: user.avatar,
        lastMessage: "Conversație nouă începută pe Swypik",
        lastTime: "Acum",
        unread: 0,
        online: user.online,
        category: user.role === "seller" ? "seller" : "direct",
        badge: user.badge,
        badgeColor: user.badgeColor,
      };
      setContacts([newContact, ...contacts]);
      setSelectedContact(newContact);
    } else {
      setSelectedContact(existing);
    }
    setMobileView("chat");
  };

  const handleStartCall = async (callType: "audio" | "video") => {
    haptic("tap");
    try {
      const res = await fetch("/api/messenger/calls/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedContact.id,
          callType,
        }),
      });
      const data = await res.json();
      if (data.ok && data.token) {
        setActiveCall({
          token: data.token,
          serverUrl: data.serverUrl,
          callType,
        });
      } else {
        alert("Eroare la pornirea apelului LiveKit: " + (data.error || "Necunoscut"));
      }
    } catch (e: any) {
      alert("Eroare rețea apel video: " + e.message);
    }
  };

  const filteredContacts = contacts
    .filter((c) => (filterTab === "all" ? true : c.category === filterTab))
    .filter((c) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q);
    });

  return (
    <div className="flex h-screen bg-white text-slate-900 overflow-hidden font-sans">
      {/* ── STÂNGA: Listă Conversații Swypik Messenger ───────────── */}
      <div
        className={`${
          mobileView === "chat" ? "hidden md:flex" : "flex"
        } w-full md:w-[380px] lg:w-[420px] flex-shrink-0 flex-col border-r border-slate-200/80 bg-white pb-16 md:pb-0 z-20`}
      >
        {/* Header stânga */}
        <div className="h-20 px-5 bg-white border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center font-black text-white shadow-lg shadow-violet-500/25">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-900 text-lg leading-tight">
                  Swypik Chat
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-black uppercase tracking-tight">
                  Nativ
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Conectare directă prin @username
              </span>
            </div>
          </div>

          {/* Buton Adaugă Contact prin @handle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                haptic("tap");
                setIsAddModalOpen(true);
              }}
              className="p-2.5 rounded-2xl bg-violet-50 hover:bg-violet-100 text-violet-700 transition flex items-center gap-1.5 text-xs font-bold shadow-xs active:scale-95"
              title="Adaugă Contact prin @username"
            >
              <UserPlus size={16} />
              <span className="hidden sm:inline">Adaugă</span>
            </button>
          </div>
        </div>

        {/* Search Bar & Categorii Filter Tabs */}
        <div className="p-4 bg-white border-b border-slate-100 space-y-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Caută după nume sau @username..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto text-xs no-scrollbar pb-0.5">
            {[
              { id: "all", label: "Toate" },
              { id: "direct", label: "Directe (@)" },
              { id: "seller", label: "Vânzători" },
              { id: "squad", label: "Grupuri Squad" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  haptic("tap");
                  setFilterTab(tab.id as any);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex-shrink-0 text-xs ${
                  filterTab === tab.id
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de conversații */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
          {filteredContacts.map((contact) => {
            const isSelected = selectedContact.id === contact.id;
            return (
              <div
                key={contact.id}
                onClick={() => {
                  haptic("tap");
                  setSelectedContact(contact);
                  setMobileView("chat");
                }}
                className={`flex items-center gap-3.5 p-3 rounded-2xl cursor-pointer transition active:scale-[0.99] ${
                  isSelected
                    ? "bg-violet-50/80 border border-violet-100 shadow-xs"
                    : "hover:bg-slate-50/80 border border-transparent"
                }`}
              >
                <div className="relative flex-shrink-0">
                  <img
                    src={contact.avatar}
                    alt={contact.name}
                    className="w-12 h-12 rounded-2xl object-cover ring-1 ring-slate-200"
                  />
                  {contact.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <h4 className="font-extrabold text-sm text-slate-900 truncate">
                        {contact.name}
                      </h4>
                      {contact.badge && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${contact.badgeColor}`}
                        >
                          {contact.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {contact.lastTime}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-violet-600 block">
                      {contact.handle}
                    </span>
                    {contact.unread > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-black text-[10px] shadow-sm">
                        {contact.unread}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {contact.lastMessage}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── DREAPTA: Zona de Chat Activ ──────────────────────────── */}
      <div
        className={`${
          mobileView === "list" ? "hidden md:flex" : "flex"
        } flex-1 flex-col bg-[#F9FAFB] relative h-full`}
      >
        {/* Chat Header */}
        <div className="h-20 px-5 bg-white border-b border-slate-200/80 flex items-center justify-between z-10 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => {
                haptic("tap");
                setMobileView("list");
              }}
              className="md:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-full transition"
              title="Înapoi la contacte"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="relative flex-shrink-0">
              <img
                src={selectedContact.avatar}
                alt={selectedContact.name}
                className="w-11 h-11 rounded-2xl object-cover ring-1 ring-slate-200"
              />
              {selectedContact.online && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-slate-900 truncate">
                  {selectedContact.name}
                </h3>
                <span className="text-xs font-bold text-violet-600">
                  {selectedContact.handle}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                {selectedContact.online ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Activ acum pe Swypik
                  </>
                ) : (
                  "Offline • Văzut recent"
                )}
              </span>
            </div>
          </div>

          {/* Action buttons: Video / Audio Call */}
          <div className="flex items-center gap-2 text-slate-700">
            <button
              onClick={() => handleStartCall("video")}
              className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl transition flex items-center gap-1.5 text-xs font-bold shadow-md shadow-violet-500/20 active:scale-95"
              title="Pornește Apel Video HD"
            >
              <Video size={16} />
              <span className="hidden sm:inline">Apel Video</span>
            </button>

            <button
              onClick={() => handleStartCall("audio")}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition active:scale-95"
              title="Pornește Apel Audio Clar"
            >
              <Phone size={16} />
            </button>

            {/* Test Apel Primit */}
            <button
              onClick={() =>
                setIncomingCall({
                  callerName: selectedContact.name,
                  callerAvatar: selectedContact.avatar,
                  callType: "video",
                })
              }
              className="p-2.5 bg-slate-100 hover:bg-violet-100 text-violet-700 rounded-xl transition text-xs font-bold"
              title="Testează Apel Primit"
            >
              <Radio size={16} className="animate-pulse" />
            </button>
          </div>
        </div>

        {/* Mesaje Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-white to-slate-50">
          {/* Security Banner */}
          <div className="flex items-center justify-center my-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200/70 text-[11px] font-semibold text-slate-600 shadow-xs">
              <ShieldCheck size={14} className="text-violet-600" />
              <span>Conexiune directă prin Swypik Handle • Fără număr de telefon</span>
            </div>
          </div>

          {(messages[selectedContact.id] || []).map((msg) => {
            const isMe = msg.sender === "me";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"} group relative`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[65%] rounded-3xl p-4 shadow-sm text-sm relative transition-all ${
                    isMe
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-xs shadow-violet-500/10"
                      : "bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs shadow-slate-200/50"
                  }`}
                >
                  {/* Tip: Produs distribuit */}
                  {msg.type === "product" && msg.product && (
                    <div className="mb-2 p-2.5 rounded-2xl bg-black/10 dark:bg-black/20 border border-white/15 flex items-center gap-3">
                      <img
                        src={msg.product.image}
                        alt={msg.product.title}
                        className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block font-black text-xs truncate">
                          {msg.product.title}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-extrabold text-sm text-amber-300">
                            {msg.product.price}
                          </span>
                          <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full font-bold">
                            ★ {msg.product.rating}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tip: Notă Vocală */}
                  {msg.type === "audio" && (
                    <div className="flex items-center gap-3 py-1">
                      <button
                        onClick={() => {
                          haptic("tap");
                          setIsPlayingAudio(
                            isPlayingAudio === msg.id ? null : msg.id
                          );
                        }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center shadow-md transition ${
                          isMe
                            ? "bg-white text-violet-700"
                            : "bg-violet-600 text-white"
                        }`}
                      >
                        {isPlayingAudio === msg.id ? (
                          <Pause size={16} />
                        ) : (
                          <Play size={16} className="ml-0.5" />
                        )}
                      </button>
                      <div className="flex-1 flex items-center gap-1">
                        {[40, 75, 55, 90, 30, 60, 85, 45, 95, 70, 50, 80, 60, 40].map(
                          (h, idx) => (
                            <span
                              key={idx}
                              style={{ height: `${h * 0.3}px` }}
                              className={`w-1 rounded-full ${
                                isMe ? "bg-white/80" : "bg-violet-500"
                              }`}
                            />
                          )
                        )}
                      </div>
                      <span className="text-[11px] font-bold opacity-80">
                        {msg.audioDuration || "0:18"}
                      </span>
                    </div>
                  )}

                  {/* Tip: Recompensă SWYP */}
                  {msg.type === "tip" && (
                    <div className="mb-1.5 p-3 rounded-2xl bg-amber-400 text-slate-950 font-black flex items-center gap-2 shadow-sm">
                      <Zap size={20} className="fill-slate-950" />
                      <div>
                        <span className="block text-sm">
                          +{msg.tipAmount} SWYP Coins acordate!
                        </span>
                        <span className="text-[10px] opacity-80 font-bold">
                          Recompensă instantanee pentru creator
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Text mesaj */}
                  <p className="leading-relaxed break-words font-medium">
                    {msg.text}
                  </p>

                  {/* Timestamp & Bife livrare */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1.5 text-[10px] ${
                      isMe ? "text-violet-200" : "text-slate-400"
                    }`}
                  >
                    <span>{msg.time}</span>
                    {isMe && (
                      <span>
                        {msg.status === "read" ? (
                          <CheckCheck size={14} className="text-cyan-300" />
                        ) : msg.status === "delivered" ? (
                          <CheckCheck size={14} className="text-violet-200" />
                        ) : (
                          <Check size={14} className="text-violet-200" />
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Reacții pe mesaj */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div className="flex gap-1 mt-1 px-1">
                    {msg.reactions.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => handleAddReaction(msg.id, r.emoji)}
                        className={`text-xs px-2 py-0.5 rounded-full border shadow-xs flex items-center gap-1 font-bold transition active:scale-90 ${
                          r.byMe
                            ? "bg-violet-50 border-violet-200 text-violet-700"
                            : "bg-white border-slate-200 text-slate-700"
                        }`}
                      >
                        <span>{r.emoji}</span>
                        <span>{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick reaction float bar on hover */}
                <div
                  className={`hidden group-hover:flex items-center gap-1 absolute top-0 ${
                    isMe ? "right-full mr-2" : "left-full ml-2"
                  } bg-white p-1 rounded-full shadow-lg border border-slate-100 z-10 animate-fadeIn`}
                >
                  {["❤️", "🔥", "👏", "😂", "👍"].map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleAddReaction(msg.id, emoji)}
                      className="p-1 hover:bg-slate-100 rounded-full text-xs transition"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold px-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-violet-600 animate-bounce" />
              <span>{selectedContact.name} scrie un mesaj...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Chat Input Toolbar ──────────────────────────────────── */}
        <div
          className="bg-white border-t border-slate-200/80 p-3 sm:p-4 z-10 space-y-2"
          style={{
            paddingBottom: "max(12px, calc(10px + env(safe-area-inset-bottom, 0px)))",
          }}
        >
          {/* Meniu Atașamente Bogate */}
          {showAttachMenu && (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center gap-2 overflow-x-auto text-xs font-bold text-slate-700 animate-slideUp">
              <button
                onClick={handleSendProduct}
                className="px-3 py-2 bg-white hover:bg-violet-50 hover:text-violet-700 rounded-xl border border-slate-200/80 flex items-center gap-1.5 transition shadow-xs flex-shrink-0"
              >
                <ShoppingBag size={15} className="text-violet-600" />
                <span>Trimite Produs Swypik</span>
              </button>

              <button
                onClick={handleSendVoiceNote}
                className="px-3 py-2 bg-white hover:bg-violet-50 hover:text-violet-700 rounded-xl border border-slate-200/80 flex items-center gap-1.5 transition shadow-xs flex-shrink-0"
              >
                <Mic size={15} className="text-violet-600" />
                <span>Notă Audio Demo</span>
              </button>

              <button
                onClick={handleSendTip}
                className="px-3 py-2 bg-white hover:bg-amber-50 hover:text-amber-700 rounded-xl border border-slate-200/80 flex items-center gap-1.5 transition shadow-xs flex-shrink-0"
              >
                <Zap size={15} className="text-amber-500 fill-amber-500" />
                <span>Trimite 50 SWYP Coins</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                haptic("tap");
                setShowAttachMenu(!showAttachMenu);
              }}
              className={`p-2.5 rounded-2xl transition shadow-xs ${
                showAttachMenu
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600"
              }`}
              title="Atașamente & Produse Swypik"
            >
              <Paperclip size={18} />
            </button>

            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder={`Scrie un mesaj către ${selectedContact.handle}...`}
              className="flex-1 bg-slate-50 border border-slate-200/80 text-slate-900 placeholder-slate-400 text-xs sm:text-sm px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
            />

            {inputVal.trim() ? (
              <button
                onClick={() => handleSendMessage()}
                className="p-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white transition active:scale-95 shadow-md shadow-violet-500/25"
              >
                <Send size={16} />
              </button>
            ) : (
              <button
                onClick={handleSendVoiceNote}
                className="p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition active:scale-95"
                title="Trimite notă vocală"
              >
                <Mic size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── MODAL ADĂUGARE CONTACT PRIN @USERNAME ───────────────── */}
      <AddContactModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddContact={handleAddContactFromDirectory}
        existingContactIds={contacts.map((c) => c.id)}
      />

      {/* ── OVERLAY APEL ACTIV (LiveKit WebRTC SFU) ───────────────── */}
      {activeCall && (
        <ActiveCallOverlay
          serverUrl={activeCall.serverUrl}
          token={activeCall.token}
          callType={activeCall.callType}
          onDisconnect={() => setActiveCall(null)}
        />
      )}

      {/* ── POP-UP APEL PRIMIT (Swypik HD Tone) ─────────────────── */}
      {incomingCall && (
        <IncomingCallDialog
          callerName={incomingCall.callerName}
          callerAvatar={incomingCall.callerAvatar}
          callType={incomingCall.callType}
          onAccept={() => {
            const type = incomingCall.callType;
            setIncomingCall(null);
            handleStartCall(type);
          }}
          onReject={() => setIncomingCall(null)}
        />
      )}
    </div>
  );
}
