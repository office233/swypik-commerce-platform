"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
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
  Film,
  ShieldAlert,
  Shield,
  AlertTriangle,
  Music,
  Wallet,
  BarChart3,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  Truck,
  Inbox,
  BedDouble,
  ScrollText,
  UtensilsCrossed,
} from "lucide-react";

type NavItem = {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  comingSoon?: boolean;
};

type NavSection = {
  id: string;
  titleKey: string;
  icon: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    id: "overview",
    titleKey: "nav.section.overview",
    icon: "\u{1F4CA}",
    items: [
      { href: "/admin", labelKey: "nav.item.dashboard", icon: LayoutDashboard },
      { href: "/admin/aplicatii", labelKey: "nav.item.partnerApplications", icon: Inbox },
      { href: "/admin/merchant-claims", labelKey: "nav.item.merchantClaims", icon: UtensilsCrossed },
      { href: "/admin/health", labelKey: "nav.item.health", icon: Activity },
      { href: "/admin/cron", labelKey: "nav.item.cron", icon: Clock },
      { href: "/admin/audit", labelKey: "nav.item.audit", icon: ScrollText },
    ],
  },
  {
    id: "comert",
    titleKey: "nav.section.commerce",
    icon: "\u{1F6D2}",
    items: [
      { href: "/admin/orders", labelKey: "nav.item.orders", icon: ShoppingBag },
      { href: "/admin/risk", labelKey: "nav.item.risk", icon: AlertTriangle },
      { href: "/admin/strikes", labelKey: "nav.item.strikes", icon: Shield },
      { href: "/admin/returns", labelKey: "nav.item.returns", icon: Undo2 },
      { href: "/admin/refunds", labelKey: "nav.item.refunds", icon: Coins },
      { href: "/admin/disputes", labelKey: "nav.item.disputes", icon: Shield },
      { href: "/admin/marketplace", labelKey: "nav.item.marketplace", icon: Store },
      { href: "/admin/reviews", labelKey: "nav.item.reviews", icon: Star },
    ],
  },
  {
    id: "utilizatori",
    titleKey: "nav.section.users",
    icon: "\u{1F465}",
    items: [
      { href: "/admin/users", labelKey: "nav.item.users", icon: Users },
      { href: "/admin/creators", labelKey: "nav.item.creators", icon: UserCheck },
      { href: "/admin/sellers", labelKey: "nav.item.sellers", icon: Briefcase },
      { href: "/admin/applications", labelKey: "nav.item.creatorApplications", icon: FileText },
      { href: "/admin/hosts", labelKey: "nav.item.hosts", icon: BedDouble },
      { href: "/admin/fleet", labelKey: "nav.item.fleet", icon: Truck },
      { href: "/admin/pricing", labelKey: "nav.item.pricing", icon: Coins },
    ],
  },
  {
    id: "continut",
    titleKey: "nav.section.content",
    icon: "\u{1F3AC}",
    items: [
      { href: "/admin/videos", labelKey: "nav.item.videos", icon: Video },
      { href: "/admin/movies", labelKey: "nav.item.movies", icon: Film },
      { href: "/admin/music", labelKey: "nav.item.music", icon: Music },
      { href: "/admin/moderation", labelKey: "nav.item.moderation", icon: ShieldAlert },
    ],
  },
  {
    id: "finante",
    titleKey: "nav.section.finance",
    icon: "\u{1F4B0}",
    items: [
      { href: "/admin/payouts", labelKey: "nav.item.payouts", icon: Wallet },
      { href: "/admin/courier-payouts", labelKey: "nav.item.courierPayouts", icon: Truck },
      { href: "/admin/commissions", labelKey: "nav.item.commissions", icon: BarChart3 },
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
  const t = useTranslations("adminShell");
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
            aria-label={t("logOut")}
            className="grid h-10 w-10 place-items-center rounded-md text-white/60 hover:text-white hover:bg-white/10 transition"
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
          {t("storefront")}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        {sections.map((section) => (
          <div key={section.id}>
            <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/40 flex items-center gap-1.5">
              <span>{section.icon}</span>
              <span>{t(section.titleKey)}</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const label = t(item.labelKey);

                if (item.comingSoon) {
                  return (
                    <div
                      key={item.href}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white/30 cursor-not-allowed"
                      aria-disabled="true"
                      title={t("comingSoon")}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 truncate">{label}</span>
                      <span className="text-[9px] font-black uppercase tracking-wide bg-white/5 text-white/40 px-1.5 py-0.5 rounded">
                        {t("soon")}
                      </span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition ${active
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                      }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 truncate">{label}</span>
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
  const t = useTranslations("adminShell");
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
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-[#0D0D0D] px-2 py-2 flex items-center justify-between shadow-lg">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t("openMenu")}
          className="grid h-11 w-11 place-items-center rounded-md text-white hover:bg-white/10"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/admin" className="text-white font-black text-base truncate max-w-[55%]">
          Swypik Admin
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          aria-label={t("logOut")}
          className="grid h-11 w-11 place-items-center rounded-md text-white/70 hover:text-white hover:bg-white/10"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label={t("closeMenu")}
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-64 max-w-[85vw] bg-[#0D0D0D] text-white h-full shadow-xl flex flex-col">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label={t("close")}
              className="absolute top-2 right-2 grid h-11 w-11 place-items-center rounded-md text-white/60 hover:text-white hover:bg-white/10 z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent
              pathname={pathname}
              onNavigate={() => setDrawerOpen(false)}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto pt-14 md:pt-0">{children}</main>
    </div>
  );
}
