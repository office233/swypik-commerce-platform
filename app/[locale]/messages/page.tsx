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
} from "lucide-react";
import ActiveCallOverlay from "@/components/messenger/Calls/ActiveCallOverlay";
import IncomingCallDialog from "@/components/messenger/Calls/IncomingCallDialog";

interface Message {
  id: string;
  sender: "me" | "peer";
  text: string;
  time: string;
  status: "sent" | "delivered" | "read";
}

interface ChatContact {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  online: boolean;
}

const DEMO_CONTACTS: ChatContact[] = [
  {
    id: "c1",
    name: "Alex Popescu",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    lastMessage: "Salut! Ne auzim la un apel video?",
    lastTime: "14:20",
    unread: 1,
    online: true,
  },
  {
    id: "c2",
    name: "Elena Ionescu",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    lastMessage: "Mulțumesc mult pentru produs!",
    lastTime: "Ieri",
    unread: 0,
    online: false,
  },
  {
    id: "c3",
    name: "Swypik Support AI",
    avatar: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
    lastMessage: "Comanda ta a fost expediată.",
    lastTime: "Marți",
    unread: 0,
    online: true,
  },
];

export default function WhatsAppMessengerPage() {
  const [contacts] = useState<ChatContact[]>(DEMO_CONTACTS);
  const [selectedContact, setSelectedContact] = useState<ChatContact>(DEMO_CONTACTS[0]);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [filterTab, setFilterTab] = useState<"all" | "unread" | "groups">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    c1: [
      { id: "m1", sender: "peer", text: "Salut! Ai văzut noile produse din live feed?", time: "14:15", status: "read" },
      { id: "m2", sender: "me", text: "Da, super interesante! Vrei să ne auzim într-un apel video să le vedem împreună?", time: "14:18", status: "read" },
      { id: "m3", sender: "peer", text: "Salut! Ne auzim la un apel video?", time: "14:20", status: "read" },
    ],
  });

  const [inputVal, setInputVal] = useState("");
  const [activeCall, setActiveCall] = useState<{ token: string; serverUrl: string; callType: "audio" | "video" } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callerName: string; callerAvatar: string; callType: "audio" | "video" } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedContact]);

  const handleSendMessage = () => {
    if (!inputVal.trim()) return;

    const newMsg: Message = {
      id: "msg_" + Date.now(),
      sender: "me",
      text: inputVal.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: "delivered",
    };

    setMessages((prev) => ({
      ...prev,
      [selectedContact.id]: [...(prev[selectedContact.id] || []), newMsg],
    }));

    setInputVal("");

    // Simulare auto-reply după 2 secunde pentru demo
    setTimeout(() => {
      setMessages((prev) => ({
        ...prev,
        [selectedContact.id]: [
          ...(prev[selectedContact.id] || []),
          {
            id: "msg_reply_" + Date.now(),
            sender: "peer",
            text: "Excelent! Hai să pornim camera 🎥",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            status: "read",
          },
        ],
      }));
    }, 2000);
  };

  const handleStartCall = async (callType: "audio" | "video") => {
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

  return (
    <div className="flex h-screen bg-[#0c1317] text-slate-100 overflow-hidden font-sans">
      {/* ── STÂNGA: Listă Contacte WhatsApp ────────────────────────── */}
      <div
        className={`${
          mobileView === "chat" ? "hidden md:flex" : "flex"
        } w-full md:w-96 flex-shrink-0 flex-col border-r border-[#222e35] bg-[#111b21] pb-16 md:pb-0`}
      >
        {/* Header stânga */}
        <div className="h-16 px-4 bg-[#202c33] flex items-center justify-between border-b border-[#222e35]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white shadow ring-2 ring-emerald-500/30">
              SW
            </div>
            <div>
              <span className="font-bold text-white text-base">Swypik Chat</span>
              <span className="block text-[10px] text-emerald-400 font-medium">WhatsApp HD & WebRTC</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            {/* Buton test apel primit */}
            <button
              onClick={() =>
                setIncomingCall({
                  callerName: selectedContact.name,
                  callerAvatar: selectedContact.avatar,
                  callType: "video",
                })
              }
              className="px-2.5 py-1 rounded-full bg-[#2a3942] hover:bg-[#32444f] text-emerald-400 text-xs font-semibold flex items-center gap-1 transition"
              title="Testează Apel Primit"
            >
              <Radio size={14} className="animate-pulse" /> Test Apel
            </button>
            <button className="p-2 hover:bg-[#2a3942] rounded-full transition">
              <MoreVertical size={18} />
            </button>
          </div>
        </div>

        {/* Search bar & Filter Pills */}
        <div className="p-3 bg-[#111b21] border-b border-[#222e35] space-y-2">
          <div className="flex items-center gap-3 px-4 py-2 bg-[#202c33] rounded-xl text-slate-400 text-sm">
            <Search size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Caută conversații..."
              className="bg-transparent border-none outline-none text-slate-200 placeholder-slate-400 w-full text-xs sm:text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-0.5">
            <button
              onClick={() => setFilterTab("all")}
              className={`px-3 py-1 rounded-full font-medium transition ${
                filterTab === "all" ? "bg-emerald-600 text-white font-bold" : "bg-[#202c33] text-slate-400 hover:text-white"
              }`}
            >
              Toate
            </button>
            <button
              onClick={() => setFilterTab("unread")}
              className={`px-3 py-1 rounded-full font-medium transition ${
                filterTab === "unread" ? "bg-emerald-600 text-white font-bold" : "bg-[#202c33] text-slate-400 hover:text-white"
              }`}
            >
              Necitite
            </button>
            <button
              onClick={() => setFilterTab("groups")}
              className={`px-3 py-1 rounded-full font-medium transition ${
                filterTab === "groups" ? "bg-emerald-600 text-white font-bold" : "bg-[#202c33] text-slate-400 hover:text-white"
              }`}
            >
              Grupuri
            </button>
          </div>
        </div>

        {/* Lista de conversații */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#222e35]">
          {contacts
            .filter((c) => (filterTab === "unread" ? c.unread > 0 : true))
            .filter((c) =>
              searchQuery ? c.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
            )
            .map((contact) => (
            <div
              key={contact.id}
              onClick={() => {
                setSelectedContact(contact);
                setMobileView("chat");
              }}
              className={`flex items-center gap-3.5 px-4 py-3.5 cursor-pointer transition active:scale-[0.99] ${
                selectedContact.id === contact.id ? "bg-[#2a3942]" : "hover:bg-[#202c33]"
              }`}
            >
              <div className="relative">
                <img
                  src={contact.avatar}
                  alt={contact.name}
                  className="w-12 h-12 rounded-full object-cover border border-[#2a3942]"
                />
                {contact.online && (
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#111b21]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h4 className="font-semibold text-sm text-slate-100 truncate">{contact.name}</h4>
                  <span className="text-xs text-slate-400">{contact.lastTime}</span>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-xs text-slate-400 truncate">{contact.lastMessage}</p>
                  {contact.unread > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px]">
                      {contact.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DREAPTA: Zona de Chat & Video Call ─────────────────────── */}
      <div
        className={`${
          mobileView === "list" ? "hidden md:flex" : "flex"
        } flex-1 flex-col bg-[#0b141a] relative h-full`}
      >
        {/* Header chat activ */}
        <div className="h-16 px-4 bg-[#202c33] flex items-center justify-between border-b border-[#222e35] z-10">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setMobileView("list")}
              className="md:hidden p-2 -ml-2 text-slate-300 hover:text-white rounded-full transition"
              title="Înapoi la mesaje"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="relative">
              <img
                src={selectedContact.avatar}
                alt={selectedContact.name}
                className="w-10 h-10 rounded-full object-cover"
              />
              {selectedContact.online && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#202c33]" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">{selectedContact.name}</h3>
              <span className="text-xs text-emerald-400">
                {selectedContact.online ? "online" : "văzut recent"}
              </span>
            </div>
          </div>

          {/* Butoane WhatsApp Apel Video & Audio */}
          <div className="flex items-center gap-2 sm:gap-3 text-slate-300">
            <button
              onClick={() => handleStartCall("video")}
              className="p-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-full transition flex items-center gap-1 text-xs font-bold"
              title="Pornește Apel Video HD"
            >
              <Video size={20} />
              <span className="hidden sm:inline">Apel Video</span>
            </button>
            <button
              onClick={() => handleStartCall("audio")}
              className="p-2.5 hover:bg-[#2a3942] rounded-full transition text-slate-300"
              title="Pornește Apel Audio"
            >
              <Phone size={19} />
            </button>
            <div className="h-6 w-px bg-[#2a3942] mx-1" />
            <button className="p-2 hover:bg-[#2a3942] rounded-full transition">
              <Search size={18} />
            </button>
          </div>
        </div>

        {/* Mesaje WhatsApp (Fundal cu model discret) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#0b141a] bg-opacity-95">
          {/* Banner criptare WhatsApp */}
          <div className="flex items-center justify-center my-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#182229] border border-[#222e35] text-[11px] text-[#8696a0]">
              <ShieldCheck size={14} className="text-amber-400" />
              <span>Mesajele și apelurile sunt securizate și criptate.</span>
            </div>
          </div>

          {(messages[selectedContact.id] || []).map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] sm:max-w-[65%] rounded-2xl px-3.5 py-2 shadow-sm text-sm relative ${
                  msg.sender === "me"
                    ? "bg-[#005c4b] text-slate-100 rounded-tr-none"
                    : "bg-[#202c33] text-slate-200 rounded-tl-none"
                }`}
              >
                <p className="leading-relaxed break-words">{msg.text}</p>
                <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                  <span>{msg.time}</span>
                  {msg.sender === "me" && (
                    <span>
                      {msg.status === "read" ? (
                        <CheckCheck size={14} className="text-cyan-400" />
                      ) : msg.status === "delivered" ? (
                        <CheckCheck size={14} className="text-slate-400" />
                      ) : (
                        <Check size={14} className="text-slate-400" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar stil WhatsApp Web & Mobile */}
        <div
          className="min-h-16 px-3 sm:px-4 py-2 bg-[#202c33] flex items-center gap-2 sm:gap-3 border-t border-[#222e35] z-10"
          style={{ paddingBottom: "max(12px, calc(10px + env(safe-area-inset-bottom, 0px)))" }}
        >
          <button className="p-2 text-slate-400 hover:text-slate-200 transition">
            <Smile size={20} />
          </button>
          <button className="p-2 text-slate-400 hover:text-slate-200 transition">
            <Paperclip size={18} />
          </button>
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder="Scrie un mesaj..."
            className="flex-1 bg-[#2a3942] text-slate-100 placeholder-slate-400 text-xs sm:text-sm px-4 py-2.5 rounded-full outline-none border-none"
          />
          {inputVal.trim() ? (
            <button
              onClick={handleSendMessage}
              className="p-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition active:scale-95 shadow-md"
            >
              <Send size={16} />
            </button>
          ) : (
            <button className="p-2 text-slate-400 hover:text-slate-200 transition">
              <Mic size={20} />
            </button>
          )}
        </div>
      </div>

      {/* ── OVERLAY APEL ACTIV (LiveKit WebRTC SFU) ───────────────── */}
      {activeCall && (
        <ActiveCallOverlay
          serverUrl={activeCall.serverUrl}
          token={activeCall.token}
          callType={activeCall.callType}
          onDisconnect={() => setActiveCall(null)}
        />
      )}

      {/* ── POP-UP APEL PRIMIT (WhatsApp Ringtone) ────────────────── */}
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
