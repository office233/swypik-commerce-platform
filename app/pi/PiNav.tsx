"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, ShoppingBag, Package } from "lucide-react";

// Bottom navigation for the Pi-only shell. Internal links ONLY — no outbound
// URLs (Mainnet requirement #6).
const ITEMS = [
  { href: "/pi", label: "Shop", icon: Home },
  { href: "/pi/search", label: "Search", icon: Search },
  { href: "/pi/cart", label: "Cart", icon: ShoppingBag },
  { href: "/pi/orders", label: "Orders", icon: Package },
];

export default function PiNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-[#0D0D0D]/95 backdrop-blur">
      <div className="mx-auto flex max-w-screen-sm items-center justify-around px-2 py-2">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/pi" ? pathname === "/pi" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold ${
                active ? "text-[#C9A2DC]" : "text-white/50"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
