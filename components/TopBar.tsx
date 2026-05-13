"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";

/**
 * TopBar — thin sticky chrome for user-facing pages.
 * Holds: logo (left), NotificationBell + Messages link (right).
 *
 * NOT mounted globally. Only mount on pages that need it (do NOT add
 * to app/layout.tsx — would break feed/explore immersion).
 *
 * The unread badge polls GET /api/dm/conversations every 60s. The
 * NotificationBell does its own polling of /api/notifications — don't
 * duplicate it here.
 */
export default function TopBar() {
  const [dmUnread, setDmUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/dm/conversations", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        const items: Array<{ unread_count?: number }> = Array.isArray(
          data?.conversations,
        )
          ? data.conversations
          : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data)
              ? data
              : [];
        const total = items.reduce(
          (sum, c) => sum + (Number(c?.unread_count) > 0 ? 1 : 0),
          0,
        );
        if (!cancelled) setDmUnread(total);
      } catch {
        /* silent */
      }
    }

    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <header
      className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-white/10 text-white"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto max-w-lg flex items-center justify-between px-4 h-12">
        <Link
          href="/"
          className="text-lg font-black tracking-tight text-[#0D0D0D]"
          aria-label="Swypik"
        >
          Swypik
        </Link>

        <div className="flex items-center gap-2">
          <NotificationBell />

          <Link
            href="/messages"
            aria-label="Mesaje"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#0D0D0D] text-white hover:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]"
          >
            <MessageCircle className="h-5 w-5" />
            {dmUnread > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#0D0D0D] px-1 text-[11px] font-semibold text-white">
                {dmUnread > 99 ? "99+" : dmUnread}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
