import Link from "next/link";
import { ReactNode } from "react";
import SelenaAssistant from "./SelenaAssistant";
import { LocalNodeIndicator } from "@/components/seller/LocalNodeIndicator";
import { getTranslations } from "next-intl/server";
import MobileDashboardNav from "@/components/dashboard/MobileDashboardNav";
import {
  BarChart3,
  Package,
  ShoppingBag,
  Store,
  FileText,
  Users,
  Coins,
  Undo2,
  Settings,
  Megaphone,
  UtensilsCrossed,
} from "lucide-react";

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("sellerGrowthLayout");
  const td = await getTranslations("sellerdashboard");
  const tf = await getTranslations("foodMerchant");

  const sellerNavItems = [
    { href: "/seller", icon: "barChart3", label: td("dashboard") || "Dashboard" },
    { href: "/seller/products", icon: "package", label: t("navProducts") },
    { href: "/seller/pos", icon: "store", label: t("navPos") },
    { href: "/seller/invoices", icon: "fileText", label: t("navInvoicesFull") },
    { href: "/seller/orders", icon: "shoppingBag", label: t("navOrders") },
    { href: "/seller/merchant", icon: "utensilsCrossed", label: tf("navRestaurant") },
    { href: "/seller/clients", icon: "users", label: t("navClientsShort") },
    { href: "/seller/ads", icon: "megaphone", label: t("navAds") },
    { href: "/seller/payouts", icon: "coins", label: td("payouts") || "Balanță & Încasări" },
    { href: "/seller/returns", icon: "undo2", label: td("retururi") || "Retururi" },
    { href: "/seller/settings", icon: "settings", label: t("navSettings") },
  ];

  return (
    <div className="min-h-screen bg-[#F7F7F8] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[#E5E5E5] flex flex-col hidden md:flex">
        <div className="p-6 border-b border-[#E5E5E5]">
          <Link href="/seller" className="flex items-center gap-2">
            <span className="text-xl font-black text-[#0D0D0D]">Swypik</span>
            <span className="text-xs font-black px-2 py-0.5 rounded-full bg-violet-600 text-white uppercase tracking-wider">{t("badgeErp")}</span>
          </Link>
          <p className="text-[11px] text-[#6E6E80] mt-1 font-medium">{t("tagline")}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{t("sectionStore")}</div>
          <Link href="/seller" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[#F7F7F8] text-sm font-semibold text-[#0D0D0D] transition">
            <BarChart3 size={17} /> {t("navDashboard")}
          </Link>
          <Link href="/seller/products" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[#F7F7F8] text-sm font-semibold text-neutral-700 transition">
            <Package size={17} /> {t("navProducts")}
          </Link>
          <Link href="/seller/pos" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[#F7F7F8] text-sm font-semibold text-neutral-700 transition">
            <Store size={17} /> {t("navPos")}
          </Link>
          <Link href="/seller/invoices" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[#F7F7F8] text-sm font-semibold text-neutral-700 transition">
            <FileText size={17} /> {t("navInvoicesFull")}
          </Link>
          <Link href="/seller/clients" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[#F7F7F8] text-sm font-semibold text-neutral-700 transition">
            <Users size={17} /> {t("navClientsShort")}
          </Link>

          <div className="px-3 pt-3 pb-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{t("sectionChannel")}</div>
          <Link href="/seller/orders" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[#F7F7F8] text-sm font-semibold text-neutral-700 transition">
            <ShoppingBag size={17} /> {t("navOrders")}
          </Link>
          <Link href="/seller/merchant" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[#F7F7F8] text-sm font-semibold text-neutral-700 transition">
            <UtensilsCrossed size={17} /> {tf("navRestaurant")}
          </Link>
          <Link href="/seller/ads" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[#F7F7F8] text-sm font-semibold text-neutral-700 transition">
            <Megaphone size={17} className="text-violet-600" /> {t("navAds")}
          </Link>
          <Link href="/seller/payouts" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[#F7F7F8] text-sm font-semibold text-neutral-700 transition">
            <Coins size={17} /> {td("payouts") || "Balanță & Încasări"}
          </Link>
          <Link href="/seller/returns" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[#F7F7F8] text-sm font-semibold text-neutral-700 transition">
            <Undo2 size={17} /> {td("retururi") || "Retururi"}
          </Link>

          <div className="px-3 pt-3 pb-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{t("sectionConfig")}</div>
          <Link href="/seller/settings" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[#F7F7F8] text-sm font-semibold text-neutral-700 transition">
            <Settings size={17} /> {t("navSettings")}
          </Link>
        </nav>

        <div className="p-4 border-t border-[#E5E5E5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-sm">
              {t("erpBadge")}
            </div>
            <div>
              <p className="text-xs font-black text-[#0D0D0D]">{t("merchantAccount")}</p>
              <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {t("activeOnSwypik")}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header with Local Node Online Indicator */}
        <header className="bg-white border-b border-[#E5E5E5] px-4 md:px-8 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="md:hidden flex items-center gap-1.5">
              <span className="text-lg font-black text-[#0D0D0D]">Swypik</span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-violet-600 text-white">{t("erpBadge")}</span>
            </div>
            <LocalNodeIndicator />
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/seller/pos"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold transition"
            >
              <Store size={14} /> {t("posShort")}
            </Link>
            <div className="md:hidden">
              <MobileDashboardNav title="Swypik" section={t("mobileSection")} accentClassName="text-[#0D0D0D]" items={sellerNavItems} />
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </div>
      </main>

      {/* Selena AI Copilot Floating Widget */}
      <SelenaAssistant />
    </div>
  );
}
