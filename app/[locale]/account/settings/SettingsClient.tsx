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
  Pickaxe,
  ShoppingBag,
  MapPin,
  ShieldCheck,
  Globe,
  ShieldAlert,
  Bell,
  LogOut,
  ChevronRight,
  Users,
  BadgeCheck,
  Download,
  Trash2,
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  function handleExport() {
    // Browser-native download: hitting the endpoint returns a JSON blob
    // with Content-Disposition: attachment so the browser saves it.
    // Using a hidden anchor avoids issues with fetch + Blob memory on huge
    // exports — let the browser stream it directly.
    window.location.href = "/api/account/export";
  }

  async function handleDeleteSubmit() {
    if (deleteBusy) return;
    if (deleteConfirm.trim().toUpperCase() !== "DELETE") {
      setDeleteError(t("itemDeleteConfirmHint"));
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Request failed");
      }
      // Session cookie cleared server-side; send user to home.
      window.location.href = "/?account_deleted=1";
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed");
      setDeleteBusy(false);
    }
  }

  const items: Item[] = [
    ...(isAdmin ? [{ href: "/admin", icon: ShieldAlert, label: t("itemAdmin") }] : []),
    ...(sellerStatus === "active" || sellerStatus === "approved"
      ? [{ href: "/seller", icon: Store, label: t("itemSeller") }]
      : sellerStatus === "pending"
      ? [{ href: "/become-a-seller", icon: Store, label: t("itemSellerPending") }]
      : [{ href: "/become-a-seller", icon: Store, label: t("itemDevinoSeller") }]),
    { href: "/account/edit", icon: UserCircle2, label: t("itemEditeaza") },
    { href: "/wallet", icon: Wallet, label: "$SWYP Wallet" },
    { href: "/earn", icon: Pickaxe, label: "Mining" },
    { href: "/account/invite-friend", icon: Users, label: "Invite friends" },
    { href: "/account/kyc", icon: BadgeCheck, label: "Verify identity (KYC)" },
    { href: "/account/orders", icon: ShoppingBag, label: t("itemComenzi") },
    { href: "/account/addresses", icon: MapPin, label: t("itemAdrese") },
    { href: "/account/security", icon: ShieldCheck, label: t("itemSecuritate") },
    { href: "/account/preferences", icon: Globe, label: t("itemLimba") },
    { href: "/account/notifications", icon: Bell, label: t("itemNotificari") },
    { icon: Download, label: t("itemDownloadData"), onClick: handleExport },
    { icon: Trash2, label: t("itemDeleteAccount"), onClick: () => setDeleteOpen(true), danger: true },
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

      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteBusy) setDeleteOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#1a0d0d] p-5 shadow-2xl">
            <h2 id="delete-account-title" className="text-lg font-black text-red-300 mb-2">
              {t("itemDeleteAccount")}
            </h2>
            <p className="text-sm text-white/80 mb-4 leading-relaxed">
              {t("itemDeleteWarningBody")}
            </p>
            <ul className="text-sm text-white/70 mb-4 space-y-1 list-disc list-inside">
              <li>{t("itemDeleteBullet1")}</li>
              <li>{t("itemDeleteBullet2")}</li>
              <li>{t("itemDeleteBullet3")}</li>
            </ul>
            <label className="block text-xs text-white/60 mb-1">
              {t("itemDeleteConfirmLabel")}
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-white placeholder:text-white/30 focus:border-red-400 focus:outline-none"
              disabled={deleteBusy}
              autoComplete="off"
            />
            {deleteError && (
              <p className="mt-2 text-xs text-red-400">{deleteError}</p>
            )}
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!deleteBusy) {
                    setDeleteOpen(false);
                    setDeleteConfirm("");
                    setDeleteError(null);
                  }
                }}
                disabled={deleteBusy}
                className="rounded-lg border border-white/20 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                {t("itemDeleteCancel")}
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={deleteBusy || deleteConfirm.trim().toUpperCase() !== "DELETE"}
                className="rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-bold text-white"
              >
                {deleteBusy ? t("itemDeleteRunning") : t("itemDeleteConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
