"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Clock,
  ShoppingBag,
  Undo2,
  Coins,
  Store,
  Star,
  Users,
  UserCheck,
  Briefcase,
  FileText,
  Video,
  ShieldAlert,
  MessageSquare,
  Music2,
  Hash,
  Wallet,
  BarChart3,
  Bell,
  Mail,
  Send,
  Menu,
  X,
  LogOut,
  ChevronLeft,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  comingSoon?: boolean;
};

type NavSection = {
  id: string;
  title: string;
  icon: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    id: "overview",
    title: "Overview",
    icon: "\u{1F4CA}",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/health", label: "Health", icon: Activity },
      { href: "/admin/cron", label: "Cron Jobs", icon: Clock },
    ],
  },
  {
    id: "comert",
    title: "Comerț",
    icon: "\u{1F6D2}",
    items: [
      { href: "/admin/orders", label: "Comenzi", icon: ShoppingBag },
      { href: "/admin/returns", label: "Returns", icon: Undo2 },
      { href: "/admin/refunds", label: "Refunds", icon: Coins },
      { href: "/admin/marketplace", label: "Marketplace", icon: Store },
      { href: "/admin/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    id: "utilizatori",
    title: "Utilizatori",
    icon: "\u{1F465}",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/creators", label: "Creators", icon: UserCheck },
      { href: "/admin/sellers", label: "Selleri", icon: Briefcase },
      { href: "/admin/applications", label: "Aplicații", icon: FileText },
    ],
  },
  {
    id: "continut",
    title: "Conținut",
    icon: "\u{1F3AC}",
    items: [
      { href: "/admin/videos", label: "Videos", icon: Video },
      { href: "/admin/moderation", label: "Moderare", icon: ShieldAlert },
      { href: "/admin/comments", label: "Comments", icon: MessageSquare, comingSoon: true },
      { href: "/admin/audio", label: "Audio", icon: Music2, comingSoon: true },
      { href: "/admin/hashtags", label: "Hashtags", icon: Hash, comingSoon: true },
    ],
  },
  {
    id: "finante",
    title: "Finanțe",
    icon: "\u{1F4B0}",
    items: [
      { href: "/admin/payouts", label: "Payouts", icon: Wallet },
      { href: "/admin/commissions", label: "Commissions", icon: BarChart3 },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    icon: "\u{1F4E3}",
    items: [
      { href: "/admin/notifications", label: "Notifications", icon: Bell, comingSoon: true },
      { href: "/admin/email", label: "Email", icon: Mail, comingSoon: true },
      { href: "/admin/push", label: "Push", icon: Send, comingSoon: true },
    ],
  },
];

function SidebarContent({
  pathname,
  onNavigate,
  onLogout,
}: {
  pathname: string;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <Link href="/admin" onClick={onNavigate} className="text-white font-black text-base">
            Swypik Admin
          </Link>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            className="p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <Link
          href="/"
          onClick={onNavigate}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-white/50 hover:text-white"
        >
          <ChevronLeft className="w-3 h-3" />
          Storefront
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        {sections.map((section) => (
          <div key={section.id}>
            <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/40 flex items-center gap-1.5">
              <span>{section.icon}</span>
              <span>{section.title}</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                if (item.comingSoon) {
                  return (
                    <div
                      key={item.href}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white/30 cursor-not-allowed"
                      aria-disabled="true"
                      title="În curând"
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="text-[9px] font-black uppercase tracking-wide bg-white/5 text-white/40 px-1.5 py-0.5 rounded">
                        Soon
                      </span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition ${
                      active
                        ? "bg-white/15 text-white"
                        : "text-white/60 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="min-h-screen flex bg-[#F7F7F8]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 bg-[#0D0D0D] text-white min-h-screen sticky top-0 h-screen flex-col">
        <SidebarContent pathname={pathname} onLogout={handleLogout} />
      </aside>

      {/* Mobile topbar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-[#0D0D0D] px-4 py-3 flex items-center justify-between shadow-lg">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Deschide meniul admin"
          className="p-1.5 rounded-md text-white hover:bg-white/10"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/admin" className="text-white font-black text-base">
          Swypik Admin
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          className="p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Închide meniul"
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-64 bg-[#0D0D0D] text-white h-full shadow-xl flex flex-col">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Închide"
              className="absolute top-3 right-3 p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent
              pathname={pathname}
              onNavigate={() => setDrawerOpen(false)}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}

      <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
    </div>
  );
}
