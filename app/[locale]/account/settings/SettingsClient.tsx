"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Store,
  ArrowLeft,
  UserCircle2,
  Wallet,
  ShoppingBag,
  MapPin,
  ShieldCheck,
  Globe,
  ShieldAlert,
  Bell,
  LogOut,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

type Item = {
  href?: string;
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  onClick?: () => void;
};

export default function SettingsClient({ isAdmin = false, sellerStatus = null }: { isAdmin?: boolean; sellerStatus?: string | null }) {
  const router = useRouter();
  const t = useTranslations("settingsClient");
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } catch {
      /* noop */
    }
    router.push("/");
    router.refresh();
  }

  const items: Item[] = [
    ...(isAdmin ? [{ href: "/admin", icon: ShieldAlert, label: t("itemAdmin") }] : []),
    ...(sellerStatus === "active" || sellerStatus === "approved"
      ? [{ href: "/seller", icon: Store, label: t("itemSeller") }]
      : sellerStatus === "pending"
      ? [{ href: "/become-a-seller", icon: Store, label: t("itemSellerPending") }]
      : [{ href: "/become-a-seller", icon: Store, label: t("itemDevinoSeller") }]),
    { href: "/account/edit", icon: UserCircle2, label: t("itemEditeaza") },
    { href: "/wallet", icon: Wallet, label: t("itemWallet") },
    { href: "/account/orders", icon: ShoppingBag, label: t("itemComenzi") },
    { href: "/account/addresses", icon: MapPin, label: t("itemAdrese") },
    { href: "/account/security", icon: ShieldCheck, label: t("itemSecuritate") },
    { href: "/account/preferences", icon: Globe, label: t("itemLimba") },
    { href: "/account/notifications", icon: Bell, label: t("itemNotificari") },
    { icon: LogOut, label: busy ? t("itemSeDeconnect") : t("itemDeconnect"), onClick: handleLogout, danger: true },
  ];

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white mobile-page-bottom">
      <header className="relative z-30 bg-[#0D0D0D]/95 backdrop-blur-md border-b border-white/10 px-4 py-4 flex items-center justify-between">
        <Link
          href="/account"
          className="grid h-11 w-11 place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition"
          aria-label={t("ariaInapoi")}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-lg font-black">{t("headerTitle")}</h1>
        <div className="w-11" aria-hidden="true" />
      </header>

      <div className="max-w-md mx-auto px-4 py-6">
        <ul className="space-y-1.5">
          {items.map((it, i) => {
            const Icon = it.icon;
            const inner = (
              <>
                <Icon size={20} className={it.danger ? "text-red-400" : "text-white/80"} />
                <span className={`flex-1 text-[15px] font-semibold ${it.danger ? "text-red-400" : "text-white"}`}>{it.label}</span>
                {!it.onClick && <ChevronRight size={18} className="text-white/40" />}
              </>
            );
            const cls =
              "w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 hover:bg-white/[0.07] hover:border-white/20 transition active:scale-[0.99] text-left";
            if (it.href && !it.onClick) {
              return (
                <li key={i}>
                  <Link href={it.href} className={cls}>
                    {inner}
                  </Link>
                </li>
              );
            }
            return (
              <li key={i}>
                <button type="button" onClick={it.onClick} disabled={busy} className={cls + (busy ? " opacity-60" : "")}>
                  {inner}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
