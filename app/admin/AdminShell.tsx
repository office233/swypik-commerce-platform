"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Comenzi Reale" },
  { href: "/admin/marketplace", label: "Marketplace" },
  { href: "/admin/sellers", label: "Selleri" },
  { href: "/admin/videos", label: "🎬 Videos" },
  { href: "/admin/challenges", label: "🏆 Challenges" },
  { href: "/admin/moderation", label: "🛡️ Moderare" },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#F7F7F8]">
      <nav className="sticky top-0 z-50 bg-[#0D0D0D] px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-white font-black text-lg">
            Swypik Admin
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${
                    active ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-white/60 text-xs font-bold hover:text-white">
            Storefront
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10 transition"
          >
            Log out
          </button>
        </div>
      </nav>

      {children}
    </div>
  );
}
