import Link from "next/link";
import { ReactNode } from "react";
import MobileDashboardNav from "@/components/dashboard/MobileDashboardNav";

const sellerNavItems = [
  { href: "/seller", icon: "📊", label: "Dashboard" },
  { href: "/seller/products", icon: "📦", label: "Produsele mele" },
  { href: "/seller/orders", icon: "🛍️", label: "Comenzi" },
  { href: "/seller/settings", icon: "⚙️", label: "Setări" },
];

export default function SellerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F7F8] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[#E5E5E5] flex flex-col hidden md:flex">
        <div className="p-6 border-b border-[#E5E5E5]">
          <Link href="/" className="text-xl font-black text-[#0D0D0D]">
            Swypik <span className="text-[#10A37F]">Sellers</span>
          </Link>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/seller" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#0D0D0D] transition">
            <span className="text-lg">📊</span> Dashboard
          </Link>
          <Link href="/seller/products" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <span className="text-lg">📦</span> Produsele mele
          </Link>
          <Link href="/seller/orders" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <span className="text-lg">🛍️</span> Comenzi
          </Link>
          <Link href="/seller/settings" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <span className="text-lg">⚙️</span> Setări
          </Link>
        </nav>

        <div className="p-4 border-t border-[#E5E5E5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#10A37F]/10 flex items-center justify-center text-lg">
              👤
            </div>
            <div>
              <p className="text-xs font-black text-[#0D0D0D]">Cont Vânzător</p>
              <p className="text-[10px] text-[#6E6E80]">Status: Activ</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-[#E5E5E5] p-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-black text-[#0D0D0D]">
            Swypik <span className="text-[#10A37F]">Sellers</span>
          </Link>
          <MobileDashboardNav title="Swypik" section="Sellers" accentClassName="text-[#10A37F]" items={sellerNavItems} />
        </header>

        {/* Content Area */}
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
