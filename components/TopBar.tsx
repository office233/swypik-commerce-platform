"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";

/**
 * TopBar — thin sticky chrome for user-facing pages.
 * Holds: logo (left), single Inbox icon (right) — combines DM unread + Notif unread.
 *
 * NOT mounted globally. Only mount on pages that need it (do NOT add
 * to app/layout.tsx — would break feed/explore immersion).
 *
 * Polls every 60s:
 *   - /api/notifications?limit=1 → unreadCount
 *   - /api/dm/conversations → unread conversations count
 */
export default function TopBar() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [notifRes, dmRes] = await Promise.all([
          fetch("/api/notifications?limit=1", {
            credentials: "include",
            cache: "no-store",
          }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/api/dm/conversations", {
            credentials: "include",
            cache: "no-store",
          }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);

        let total = Number(notifRes?.unreadCount) || 0;
        const items: Array<{ unread_count?: number }> = Array.isArray(
          dmRes?.conversations,
        )
          ? dmRes.conversations
          : Array.isArray(dmRes?.items)
            ? dmRes.items
            : Array.isArray(dmRes)
              ? dmRes
              : [];
        total += items.reduce(
          (sum, c) => sum + (Number(c?.unread_count) > 0 ? 1 : 0),
          0,
        );

        if (!cancelled) setUnread(total);
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
          className="text-lg font-black tracking-tight text-white"
          aria-label="Swypik"
        >
          Swypik
        </Link>

        <Link
          href="/inbox"
          aria-label="Inbox"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
        >
          <Inbox className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FE2C55] px-1 text-[11px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
