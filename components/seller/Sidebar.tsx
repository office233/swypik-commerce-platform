"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, ShoppingCart, Settings, Store } from "lucide-react";

const navItems = [
  { name: "Dashboard", href: "/seller", icon: LayoutDashboard },
  { name: "Produse", href: "/seller/products", icon: Package },
  { name: "Comenzi", href: "/seller/orders", icon: ShoppingCart },
  { name: "Setări", href: "/seller/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-[#E5E5E5] bg-white hidden md:flex flex-col h-screen fixed top-0 left-0">
      <div className="h-16 flex items-center px-6 border-b border-[#E5E5E5]">
        <Link href="/seller" className="flex items-center gap-2 font-semibold text-lg text-[#0D0D0D]">
          <Store className="w-5 h-5" />
          <span>Swypik Seller</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/seller");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                isActive 
                  ? "bg-neutral-100 text-[#0D0D0D] font-medium" 
                  : "text-neutral-500 hover:text-[#0D0D0D] hover:bg-neutral-50"
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
