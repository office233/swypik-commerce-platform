"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Search, Plus, Inbox, User } from "lucide-react";
import { isEnabledClient } from "@/lib/feature-flags-client";
import { haptic } from "@/lib/haptic";

const NAV_ITEMS = [
  { href: "/", icon: Home, label: "Acasă" },
  { href: "/explore", icon: Search, label: "Explorează" },
  { href: "/upload", icon: Plus, label: "", center: true },
  { href: "/inbox", icon: Inbox, label: "Inbox" },
  { href: "/account", icon: User, label: "Profil" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const hiddenPaths = ["/checkout", "/reels/record", "/seller", "/sellers", "/creator", "/admin", "/auth", "/upload"];
  if (hiddenPaths.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-black/95 backdrop-blur-xl border-t border-[#E5E5E5] dark:border-[#1F1F1F] shadow-[0_-2px_20px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-lg grid grid-cols-5 items-center px-2 pt-1.5 pb-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          const disabled = (item as any).flag ? !isEnabledClient((item as any).flag) : false;

          if (item.center) {
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => haptic("tap")}
                aria-label="Încarcă video"
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
                <span className="text-[10px] leading-tight font-medium">{item.label}</span>
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic("tap")}
              className={`relative mx-auto flex flex-col items-center justify-center gap-0.5 w-full h-12 rounded-xl transition-all ${
                isActive
                  ? "text-[#0D0D0D] dark:text-white"
                  : "text-[#A1A1AA] hover:text-[#6E6E80] dark:hover:text-[#A1A1AA]"
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              {item.label && (
                <span className={`text-[10px] leading-tight ${isActive ? "font-bold" : "font-medium"}`}>
                  {item.label}
                </span>
              )}
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
