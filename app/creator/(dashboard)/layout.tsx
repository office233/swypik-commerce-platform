import Link from "next/link";
import { ReactNode } from "react";
import MobileDashboardNav from "@/components/dashboard/MobileDashboardNav";

const creatorNavItems = [
  { href: "/creator", icon: "📊", label: "Dashboard" },
  { href: "/creator/videos", icon: "🎬", label: "Clipurile Mele" },
  { href: "/creator/links", icon: "🔗", label: "Linkuri Afiliere" },
  { href: "/creator/earnings", icon: "💰", label: "Câștiguri" },
  { href: "/creator/money", icon: "💸", label: "Bani" },
  { href: "/creator/rewards", icon: "🏆", label: "SWYP Points" },
];

export default function CreatorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F7F8] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[#E5E5E5] flex flex-col hidden md:flex">
        <div className="p-6 border-b border-[#E5E5E5]">
          <Link href="/" className="text-xl font-black text-[#0D0D0D]">
            Swypik <span className="text-[#10A37F]">Creators</span>
          </Link>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/creator" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#0D0D0D] transition">
            <span className="text-lg">📊</span> Dashboard
          </Link>
          <Link href="/creator/videos" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <span className="text-lg">🎬</span> Clipurile Mele
          </Link>
          <Link href="/creator/links" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <span className="text-lg">🔗</span> Linkuri Afiliere
          </Link>
          <Link href="/creator/earnings" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <span className="text-lg">💰</span> Câștiguri
          </Link>
          <Link href="/creator/money" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <span className="text-lg">💸</span> Bani
          </Link>
          <Link href="/creator/rewards" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <span className="text-lg">🏆</span> SWYP Points
          </Link>
        </nav>

        <div className="p-4 border-t border-[#E5E5E5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#10A37F]/10 flex items-center justify-center text-lg">
              🤳
            </div>
            <div>
              <p className="text-xs font-black text-[#0D0D0D]">Cont Creator</p>
              <p className="text-[10px] text-[#6E6E80]">Status: Aprobat</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-[#E5E5E5] p-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-black text-[#0D0D0D]">
            Swypik <span className="text-[#10A37F]">Creators</span>
          </Link>
          <MobileDashboardNav title="Swypik" section="Creators" accentClassName="text-[#10A37F]" items={creatorNavItems} />
        </header>

        {/* Content Area */}
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
