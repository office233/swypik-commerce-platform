"use client";

import { useEffect } from "react";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { useTranslations } from "next-intl";
import { Home, Search, Plus, Inbox, User } from "lucide-react";
import { isEnabledClient } from "@/lib/feature-flags-client";
import { haptic } from "@/lib/haptic";

type NavKey = "home" | "explore" | "upload" | "inbox" | "account";
type Item = { href: string; icon: typeof Home; key: NavKey; center?: boolean; flag?: "dm" | "pushNotifications" | "stripeConnect" | "returns" };

const NAV_ITEMS: Item[] = [
  { href: "/", icon: Home, key: "home" },
  { href: "/explore", icon: Search, key: "explore" },
  { href: "/reels/record", icon: Plus, key: "upload", center: true },
  { href: "/inbox", icon: Inbox, key: "inbox" },
  { href: "/account", icon: User, key: "account" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const hiddenPaths = ["/checkout", "/reels/record", "/seller", "/sellers", "/creator", "/admin", "/auth", "/upload", "/product"];
  // Bara internă din ChatInterface a fost eliminată (2026-07-29) —
  // BottomNav e acum SINGURA navigare, inclusiv pe homepage.
  const isHidden = hiddenPaths.some((p) => pathname.startsWith(p));
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.paddingBottom = isHidden
      ? ""
      : "calc(56px + env(safe-area-inset-bottom, 0px))";
    return () => { document.body.style.paddingBottom = ""; };
  }, [isHidden]);
  if (isHidden) return null;

  return (
    <nav
      data-testid="bottom-nav" className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-black/95 backdrop-blur-xl border-t border-[#E5E5E5] dark:border-[#1F1F1F] shadow-[0_-2px_20px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-lg grid grid-cols-5 items-center px-2 pt-1.5 pb-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          const disabled = item.flag ? !isEnabledClient(item.flag) : false;
          const label = t(item.key);

          if (item.center) {
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => haptic("tap")}
                aria-label={label}
                className="flex items-center justify-center mx-auto -mt-3 w-12 h-12 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#A855F7] shadow-lg ring-4 ring-white dark:ring-black active:scale-95 transition-transform"
              >
                <Icon size={26} strokeWidth={2.6} className="text-white" />
              </Link>
            );
          }

          if (disabled) {
            return (
              <span
                key={item.href}
                aria-disabled="true"
                className="relative mx-auto flex flex-col items-center justify-center gap-0.5 w-full h-12 rounded-xl text-[#D4D4D8] dark:text-[#3F3F46] cursor-not-allowed"
              >
                <Icon size={22} strokeWidth={1.8} />
                <span className="text-[10px] leading-tight font-medium">{label}</span>
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic("tap")}
              className={`relative mx-auto flex flex-col items-center justify-center gap-0.5 w-full h-12 rounded-xl transition-all ${isActive
                  ? "text-[#0D0D0D] dark:text-white"
                  : "text-[#52525B] hover:text-[#0D0D0D] dark:text-[#A1A1AA] dark:hover:text-white"
                }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className={`text-[10px] leading-tight ${isActive ? "font-bold" : "font-medium"}`}>
                {label}
              </span>
              {isActive && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-[#0D0D0D] dark:bg-white" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
