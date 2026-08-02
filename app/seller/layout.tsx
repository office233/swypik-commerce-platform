import Link from "next/link";
import { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import MobileDashboardNav from "@/components/dashboard/MobileDashboardNav";
import {
  BarChart3,
  Package,
  ShoppingBag,
  UtensilsCrossed,
  Home,
  Coins,
  Undo2,
  Settings,
  User,
} from "lucide-react";

const sellerNavItems = [
  { href: "/seller", icon: "barChart3", label: "Dashboard" },
  { href: "/seller/products", icon: "package", label: "Produsele mele" },
  { href: "/seller/orders", icon: "shoppingBag", label: "Comenzi" },
  { href: "/seller/merchant", icon: "utensilsCrossed", label: "Local & livrări" },
  { href: "/seller/cazari", icon: "home", label: "Cazări" },
  { href: "/seller/payouts", icon: "coins", label: "Payouts" },
  { href: "/seller/returns", icon: "undo2", label: "Retururi" },
  { href: "/seller/settings", icon: "settings", label: "Setări" },
];

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("sellerLayout");
  return (
    <div className="min-h-screen bg-[#F7F7F8] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[#E5E5E5] flex flex-col hidden md:flex">
        <div className="p-6 border-b border-[#E5E5E5]">
          <Link href="/" className="text-xl font-black text-[#0D0D0D]">
            Swypik <span className="text-[#0D0D0D]">Sellers</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link href="/seller" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#0D0D0D] transition">
            <BarChart3 size={18} /> Dashboard
          </Link>
          <Link href="/seller/products" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <Package size={18} /> Produsele mele
          </Link>
          <Link href="/seller/orders" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <ShoppingBag size={18} /> Comenzi
          </Link>
          <Link href="/seller/payouts" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <Coins size={18} /> Payouts
          </Link>
          <Link href="/seller/returns" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <Undo2 size={18} /> Retururi
          </Link>
          <Link href="/seller/settings" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F7F7F8] text-sm font-bold text-[#6E6E80] transition">
            <Settings size={18} /> Setări
          </Link>
        </nav>

        <div className="p-4 border-t border-[#E5E5E5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#0D0D0D]/10 flex items-center justify-center text-lg">
              <User size={18} />
            </div>
            <div>
              <p className="text-xs font-black text-[#0D0D0D]">{t("sellerAccount")}</p>
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
            Swypik <span className="text-[#0D0D0D]">Sellers</span>
          </Link>
          <MobileDashboardNav title="Swypik" section="Sellers" accentClassName="text-[#0D0D0D]" items={sellerNavItems} />
        </header>

        {/* Content Area */}
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
