"use client";

import { Link } from "@/lib/i18n/navigation";
import { useEffect, useState } from "react";
import { Inbox, LayoutGrid, ShoppingBag } from "lucide-react";
import Logo from "@/components/Logo";
import LocaleQuickPicker from "@/components/i18n/LocaleQuickPicker";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("topBar");
  const [unread, setUnread] = useState(0);
  const [cartCount, setCartCount] = useState(0);

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

  // Cart count — server-side cart (DB). Poll every 30s + refresh on focus.
  useEffect(() => {
    let cancelled = false;
    const readCart = async () => {
      try {
        const r = await fetch("/api/cart", { credentials: "include", cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        const items: Array<{ quantity?: number }> = Array.isArray(data?.items) ? data.items : [];
        const total = items.reduce((sum, it) => sum + (Number(it?.quantity) || 0), 0);
        setCartCount(total);
      } catch {
        if (!cancelled) setCartCount(0);
      }
    };
    readCart();
    const onFocus = () => { void readCart(); };
    window.addEventListener("focus", onFocus);
    const t = setInterval(readCart, 30_000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, []);

  return (
    <header
      className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-white/10 text-white"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto max-w-lg flex items-center justify-between px-4 h-12">
        <Logo href="/" />

        <div className="flex items-center gap-2">
        <Link
          href="/categories"
          aria-label={t("categories")}
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
        >
          <LayoutGrid className="h-5 w-5" />
        </Link>
        <LocaleQuickPicker />
        <Link
          href="/cart"
          aria-label={t("cart")}
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
        >
          <ShoppingBag className="h-5 w-5" />
          {cartCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#7C3AED] px-1 text-[11px] font-semibold text-white">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </Link>
        <Link
          href="/inbox"
          aria-label="Inbox"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
        >
          <Inbox className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#7C3AED] px-1 text-[11px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        </div>
      </div>
    </header>
  );
}
