import Link from "next/link";
import { ReactNode } from "react";
import MobileDashboardNav from "@/components/dashboard/MobileDashboardNav";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Upload,
  Clapperboard,
  FileText,
  TrendingUp,
  Coins,
  Banknote,
  CircleDot,
  UserRound,
} from "lucide-react";

export default function CreatorLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("creatordashboard");
  // Construit din traduceri (nu hardcodat) → meniul mobil urmează limba activă.
  const creatorNavItems = [
    { href: "/creator", icon: "barChart3", label: t("dashboard") },
    { href: "/upload", icon: "upload", label: t("incarcaVideo") },
    { href: "/creator/videos", icon: "clapperboard", label: t("clipurileMele") },
    { href: "/creator/drafts", icon: "fileText", label: t("schite") },
    { href: "/creator/analytics", icon: "trendingUp", label: t("analytics") },
    { href: "/creator/earnings", icon: "coins", label: t("castiguri") },
    { href: "/creator/payouts", icon: "banknote", label: t("plati") },
    { href: "/creator/live", icon: "circleDot", label: t("live") },
  ];
  return (
    <div className="min-h-screen bg-[#F7F7F8] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[#E5E5E5] flex flex-col hidden md:flex">
        <div className="p-6 border-b border-[#E5E5E5]">
          <Link href="/" className="text-xl font-black text-[#0D0D0D]">
            Swypik <span className="text-[#0D0D0D]">Creators</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link href="/creator" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#0D0D0D] transition">
            <BarChart3 size={18} /> {t("dashboard")}
          </Link>
          <Link href="/creator/videos" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <Clapperboard size={18} /> {t("clipurileMele")}
          </Link>
          <Link href="/creator/drafts" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <FileText size={18} />  {t("schite")}
          </Link>
          <Link href="/upload" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <Upload size={18} />  {t("incarcaVideo")}
          </Link>
          <Link href="/creator/analytics" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <TrendingUp size={18} /> {t("analytics")}
          </Link>
          <Link href="/creator/earnings" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <Coins size={18} />  {t("castiguri")}
          </Link>
          <Link href="/creator/payouts" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <Banknote size={18} />  {t("plati")}
          </Link>
        </nav>

        <div className="p-4 border-t border-[#E5E5E5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#0D0D0D]/10 flex items-center justify-center text-lg">
              <UserRound size={18} />
            </div>
            <div>
              <p className="text-xs font-black text-[#0D0D0D]">{t("contCreator")}</p>
              <p className="text-[10px] text-[#6E6E80]">{t("statusAprobat")}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-[#E5E5E5] p-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-black text-[#0D0D0D]">
            Swypik <span className="text-[#0D0D0D]">Creators</span>
          </Link>
          <MobileDashboardNav title="Swypik" section="Creators" accentClassName="text-[#0D0D0D]" items={creatorNavItems} />
        </header>

        {/* Content Area */}
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
