"use client";

import { useEffect, useRef, useState } from "react";
import { X, Search, UserPlus, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { haptic } from "@/lib/haptic";

export interface SwypikDirectoryUser {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddContact: (user: SwypikDirectoryUser, conversationId: string) => void;
  existingContactIds: string[];
}

type SearchApiUser = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export default function AddContactModal({
  isOpen,
  onClose,
  onAddContact,
  existingContactIds,
}: AddContactModalProps) {
  const t = useTranslations("messenger.addContact");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || t("searchFailed"));
          setResults([]);
        } else {
          setError(null);
          setResults(data.users || []);
        }
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== "AbortError") {
          setError(t("searchFailed"));
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen, t]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setError(null);
      abortRef.current?.abort();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = async (user: SearchApiUser) => {
    haptic("tap");
    setPendingId(user.id);
    try {
      const res = await fetch("/api/dm/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peer_user_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.conversation_id) {
        setError(data?.error || t("openFailed"));
        return;
      }
      onAddContact(
        {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
        },
        data.conversation_id,
      );
      onClose();
    } catch {
      setError(t("openFailed"));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-violet-500/20">
              <UserPlus size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                {t("title")}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">{t("subtitle")}</p>
            </div>
          </div>
          <button
            onClick={() => {
              haptic("tap");
              onClose();
            }}
            className="w-8 h-8 rounded-full hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
            aria-label={t("close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-400 hover:text-slate-600"
                aria-label={t("clear")}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {query.trim().length > 0 && query.trim().length < 2 && (
            <p className="text-[11px] text-slate-400 px-1">{t("minChars")}</p>
          )}

          {error && (
            <p className="text-[11px] text-rose-600 px-1 font-semibold">{error}</p>
          )}

          <div className="space-y-2.5">
            {loading ? (
              <div className="py-10 text-center text-slate-400 text-sm font-semibold">
                {t("searching")}
              </div>
            ) : query.trim().length >= 2 && results.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Search size={32} className="mx-auto mb-2 text-slate-300 stroke-1" />
                <p className="text-sm font-semibold text-slate-700">{t("noResults")}</p>
                <p className="text-xs text-slate-400 mt-0.5">{t("noResultsHint")}</p>
              </div>
            ) : (
              results.map((user) => {
                const isAlreadyAdded = existingContactIds.includes(user.id);
                const label = user.display_name || user.username || t("unknownUser");
                return (
                  <div
                    key={user.id}
                    className="p-3.5 rounded-2xl border border-slate-100 hover:border-violet-200 bg-white hover:bg-slate-50/70 transition flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0 w-12 h-12 rounded-2xl overflow-hidden ring-1 ring-slate-200 bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                        {user.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.avatar_url} alt={label} className="w-full h-full object-cover" />
                        ) : (
                          label.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="font-extrabold text-sm text-slate-900 truncate block">
                          {label}
                        </span>
                        {user.username && (
                          <span className="block text-xs font-semibold text-violet-600">
                            @{user.username}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelect(user)}
                      disabled={pendingId === user.id}
                      className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-60 ${
                        isAlreadyAdded
                          ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                          : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-500/20 active:scale-95"
                      }`}
                    >
                      {isAlreadyAdded ? (
                        <>
                          <MessageSquare size={13} />
                          <span>{t("open")}</span>
                        </>
                      ) : (
                        <>
                          <UserPlus size={13} />
                          <span>{t("add")}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
