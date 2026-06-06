"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Share2, MessageCircle } from "lucide-react";

type Props = {
  userId: string;
  displayName: string;
  handle: string;
};

export default function ProfileHeaderActions({ userId, displayName, handle }: Props) {
  const t = useTranslations("profileHeaderActions");
  const [toast, setToast] = useState<string>("");

  async function handleShare() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const title = `${displayName} (${handle}) pe Swypik`;
    try {
      if (typeof navigator !== "undefined" && typeof (navigator as any).share === "function") {
        await (navigator as any).share({ url, title });
        return;
      }
    } catch {
      // user cancel or unsupported — fall through to clipboard
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setToast("Link copiat!");
        setTimeout(() => setToast(""), 2000);
      }
    } catch {
      setToast("Nu am putut copia linkul");
      setTimeout(() => setToast(""), 2000);
    }
  }

  const [dmPending, setDmPending] = useState(false);
  async function handleMessage() {
    if (dmPending) return;
    setDmPending(true);
    try {
      const res = await fetch("/api/dm/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peer_user_id: userId }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/login?next=" + encodeURIComponent(window.location.pathname);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.conversation_id) {
        window.location.href = `/messages/${data.conversation_id}`;
      } else {
        setToast(t("errNuAmDeschisConv"));
        setTimeout(() => setToast(""), 2000);
      }
    } catch {
      setToast(t("errRetea"));
      setTimeout(() => setToast(""), 2000);
    } finally {
      setDmPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/15"
        aria-label="Distribuie profilul"
      >
        <Share2 size={16} />
        <span className="hidden sm:inline">Distribuie</span>
      </button>
      <button
        type="button"
        onClick={handleMessage}
        disabled={dmPending}
        className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-60"
        aria-label="Trimite mesaj"
      >
        <MessageCircle size={16} />
        <span className="hidden sm:inline">{dmPending ? "..." : "Mesaj"}</span>
      </button>
      {toast && (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-black/90 px-4 py-2 text-xs font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
