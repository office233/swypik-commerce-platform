"use client";

import { useState } from "react";
import {
  X,
  Search,
  UserPlus,
  QrCode,
  Copy,
  Check,
  Sparkles,
  ShieldCheck,
  ShoppingBag,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { haptic } from "@/lib/haptic";

export interface SwypikDirectoryUser {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  role: "creator" | "seller" | "user" | "verified";
  badge: string;
  badgeColor: string;
  bio: string;
  online: boolean;
}

export const SWYPIK_DIRECTORY: SwypikDirectoryUser[] = [
  {
    id: "usr_maria",
    name: "Maria Dumitrescu",
    handle: "@maria.style",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80",
    role: "creator",
    badge: "Top Creator",
    badgeColor: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
    bio: "Fashion haul & styling tips zilnice pe Swypik Reels 💃",
    online: true,
  },
  {
    id: "usr_radu",
    name: "Radu Tech Reviews",
    handle: "@radu.tech",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    role: "verified",
    badge: "Verificat",
    badgeColor: "bg-cyan-100 text-cyan-700 border-cyan-200",
    bio: "Recenzii gadget-uri, telefoane și unboxing-uri exclusive 📱",
    online: true,
  },
  {
    id: "usr_urban",
    name: "Urban Streetwear Ro",
    handle: "@urban.store",
    avatar: "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=150&auto=format&fit=crop&q=80",
    role: "seller",
    badge: "Magazin Oficial",
    badgeColor: "bg-emerald-100 text-emerald-700 border-emerald-200",
    bio: "Livrăm haine streetwear originale în 24h direct la ușa ta 👟",
    online: false,
  },
  {
    id: "usr_darius",
    name: "Darius Beats",
    handle: "@darius.sound",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    role: "creator",
    badge: "Artist Swypik Music",
    badgeColor: "bg-violet-100 text-violet-700 border-violet-200",
    bio: "Producție muzicală lo-fi & afrobeat. Piesele mele sunt în Swypik Music 🎵",
    online: true,
  },
  {
    id: "usr_ana",
    name: "Ana & Squad Deals",
    handle: "@ana.squad",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80",
    role: "user",
    badge: "Squad Leader",
    badgeColor: "bg-amber-100 text-amber-700 border-amber-200",
    bio: "Organizez grupuri Squad Buy cu -30% discount la produse virale 🛍️",
    online: true,
  },
];

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddContact: (user: SwypikDirectoryUser) => void;
  existingContactIds: string[];
}

export default function AddContactModal({
  isOpen,
  onClose,
  onAddContact,
  existingContactIds,
}: AddContactModalProps) {
  const [activeTab, setActiveTab] = useState<"search" | "my_qr">("search");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const filteredUsers = SWYPIK_DIRECTORY.filter((u) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.handle.toLowerCase().includes(q) ||
      u.bio.toLowerCase().includes(q)
    );
  });

  const handleCopyLink = () => {
    haptic("tap");
    const link = "https://swypik.com/messages?with=@eu.swypik";
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-violet-500/20">
              <UserPlus size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                Adaugă Contact Swypik
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Fără numere de telefon — conectare 100% prin @username
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              haptic("tap");
              onClose();
            }}
            className="w-8 h-8 rounded-full hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 px-6 pt-2 bg-white">
          <button
            onClick={() => {
              haptic("tap");
              setActiveTab("search");
            }}
            className={`pb-3 px-3 text-xs font-bold transition relative ${
              activeTab === "search"
                ? "text-violet-600"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Search size={14} /> Caută după @handle sau Nume
            </span>
            {activeTab === "search" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-t-full" />
            )}
          </button>

          <button
            onClick={() => {
              haptic("tap");
              setActiveTab("my_qr");
            }}
            className={`pb-3 px-3 text-xs font-bold transition relative ${
              activeTab === "my_qr"
                ? "text-violet-600"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <QrCode size={14} /> Handle-ul & QR-ul meu
            </span>
            {activeTab === "my_qr" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-t-full" />
            )}
          </button>
        </div>

        {/* Modal Body */}
        {activeTab === "search" ? (
          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            {/* Search Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400">
                <Search size={16} />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Scrie @username (ex: @maria.style, @radu.tech)..."
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
                autoFocus
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Results count / tip */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 font-medium">
              <span>Sugestii creatori & vânzători activi:</span>
              <span className="text-violet-600 font-bold">{filteredUsers.length} găsiți</span>
            </div>

            {/* User List */}
            <div className="space-y-2.5">
              {filteredUsers.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Search size={32} className="mx-auto mb-2 text-slate-300 stroke-1" />
                  <p className="text-sm font-semibold text-slate-700">Niciun utilizator găsit</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Verifică dacă ai introdus handle-ul corect începând cu @
                  </p>
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const isAlreadyAdded = existingContactIds.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      className="p-3.5 rounded-2xl border border-slate-100 hover:border-violet-200 bg-white hover:bg-slate-50/70 transition flex items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative flex-shrink-0">
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-12 h-12 rounded-2xl object-cover ring-1 ring-slate-200"
                          />
                          {user.online && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-sm text-slate-900 truncate">
                              {user.name}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${user.badgeColor}`}
                            >
                              {user.badge}
                            </span>
                          </div>
                          <span className="block text-xs font-semibold text-violet-600">
                            {user.handle}
                          </span>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {user.bio}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          haptic("tap");
                          onAddContact(user);
                          onClose();
                        }}
                        className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs ${
                          isAlreadyAdded
                            ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                            : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-500/20 active:scale-95"
                        }`}
                      >
                        {isAlreadyAdded ? (
                          <>
                            <MessageSquare size={13} />
                            <span>Deschide</span>
                          </>
                        ) : (
                          <>
                            <UserPlus size={13} />
                            <span>Adaugă</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 flex-1 flex flex-col items-center justify-center text-center space-y-5">
            {/* QR Card */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100/80 shadow-md flex flex-col items-center">
              <div className="w-48 h-48 rounded-2xl bg-white p-3 shadow-inner flex items-center justify-center border border-slate-100 relative group">
                <svg
                  className="w-full h-full text-slate-900"
                  viewBox="0 0 100 100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="10" y="10" width="25" height="25" rx="3" fill="#7C3AED" />
                  <rect x="65" y="10" width="25" height="25" rx="3" fill="#7C3AED" />
                  <rect x="10" y="65" width="25" height="25" rx="3" fill="#7C3AED" />
                  <rect x="15" y="15" width="15" height="15" rx="1" fill="white" />
                  <rect x="70" y="15" width="15" height="15" rx="1" fill="white" />
                  <rect x="15" y="70" width="15" height="15" rx="1" fill="white" />
                  <circle cx="22.5" cy="22.5" r="4" fill="#7C3AED" />
                  <circle cx="77.5" cy="22.5" r="4" fill="#7C3AED" />
                  <circle cx="22.5" cy="77.5" r="4" fill="#7C3AED" />
                  <circle cx="50" cy="50" r="12" fill="#7C3AED" />
                  <path d="M44 46L50 42L56 46V54L50 58L44 54Z" fill="white" />
                  <rect x="42" y="10" width="16" height="6" fill="#7C3AED" rx="1" />
                  <rect x="42" y="84" width="16" height="6" fill="#7C3AED" rx="1" />
                  <rect x="10" y="42" width="6" height="16" fill="#7C3AED" rx="1" />
                  <rect x="84" y="42" width="6" height="16" fill="#7C3AED" rx="1" />
                  <rect x="65" y="65" width="10" height="10" fill="#7C3AED" rx="1" />
                  <rect x="80" y="80" width="10" height="10" fill="#7C3AED" rx="1" />
                </svg>
              </div>

              <div className="mt-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-600 text-white text-xs font-black shadow-xs">
                  <Sparkles size={12} /> @eu.swypik
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <h4 className="font-extrabold text-base text-slate-900">
                Partajează profilul tău Swypik
              </h4>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Prietenii tăi te pot găsi instant scanând codul QR sau deschizând link-ul tău unic de contact.
              </p>
            </div>

            {/* Copy Button */}
            <button
              onClick={handleCopyLink}
              className={`w-full max-w-xs py-3 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md active:scale-95 ${
                copied
                  ? "bg-emerald-600 text-white shadow-emerald-500/20"
                  : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-500/25"
              }`}
            >
              {copied ? (
                <>
                  <Check size={16} /> Link copiat în clipboard!
                </>
              ) : (
                <>
                  <Copy size={16} /> Copiază Link Contact: swypik.com/u/@eu.swypik
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
