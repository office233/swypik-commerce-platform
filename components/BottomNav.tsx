"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Search, ShoppingCart, User, Compass } from "lucide-react";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/", icon: Home, label: "Acasă" },
  { href: "/explore", icon: Compass, label: "Feed" },
  { href: "/shop", icon: Search, label: "Magazin" },
  { href: "/cart", icon: ShoppingCart, label: "Coș", showBadge: true },
  { href: "/account", icon: User, label: "Cont" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [cartCount, setCartCount] = useState(0);

  // Pages where we hide the nav
  const hiddenPaths = ["/explore", "/checkout"];
  const isHidden = hiddenPaths.some((p) => pathname.startsWith(p));

  useEffect(() => {
    const update = () => {
      try {
        const cart = JSON.parse(localStorage.getItem("aicv_cart") || "[]");
        setCartCount(Array.isArray(cart) ? cart.reduce((s: number, i: any) => s + (i.qty || 1), 0) : 0);
      } catch {
        setCartCount(0);
      }
    };
    update();
    window.addEventListener("storage", update);
    const interval = setInterval(update, 2000);
    return () => {
      window.removeEventListener("storage", update);
      clearInterval(interval);
    };
  }, []);

  if (isHidden) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-[#E5E5E5] shadow-[0_-2px_20px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-lg flex items-center justify-around px-2 py-1.5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                isActive
                  ? "text-[#10A37F]"
                  : "text-[#A1A1AA] hover:text-[#6E6E80]"
              }`}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                {item.showBadge && cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-black text-white px-1">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] leading-tight ${
                  isActive ? "font-bold" : "font-medium"
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-[#10A37F]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
