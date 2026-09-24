"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

type Props = {
  userId: string;
  username: string;
  role: string;
  isSuspended: boolean;
};

export default function UserActions({ userId, username, role, isSuspended }: Props) {
  const t = useTranslations("adminUsers");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const SUSPEND_OPTIONS: { days: number; label: string }[] = [
    { days: 1, label: t("suspend1Day") },
    { days: 7, label: t("suspend7Days") },
    { days: 30, label: t("suspend30Days") },
    { days: 36500, label: t("suspendPermanent") },
  ];

  const KNOWN_ERRORS: Record<string, string> = {
    forbidden: t("errForbidden"),
    invalid_id: t("errInvalidId"),
    invalid_role: t("errInvalidRole"),
    user_not_found: t("errUserNotFound"),
    cannot_demote_self: t("errCannotDemoteSelf"),
    last_admin_lockout: t("errLastAdminLockout"),
    role_change_failed: t("errRoleChangeFailed"),
  };

  async function call(url: string, body?: unknown) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(KNOWN_ERRORS[data?.error] || data?.error || t("errorWithStatus", { status: res.status }));
        setBusy(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function suspend(days: number) {
    const reason = prompt(
      t("suspendReasonPrompt", { username, duration: days >= 36500 ? t("permanent") : t("daysCount", { count: days }) })
    );
    if (reason === null) return;
    await call(`/api/admin/users/${userId}/suspend`, { days, reason });
  }

  async function unsuspend() {
    if (!confirm(t("confirmUnsuspend", { username }))) return;
    await call(`/api/admin/users/${userId}/unsuspend`);
  }

  async function changeRole(newRole: "admin" | "user") {
    const confirmMsg =
      newRole === "admin"
        ? t("confirmPromote", { username })
        : t("confirmDemote", { username });
    if (!confirm(confirmMsg)) return;
    await call(`/api/admin/users/${userId}/role`, { role: newRole });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg border border-black/15 px-2.5 py-1 text-xs font-bold disabled:opacity-50"
      >
        {t("actions")} <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg border border-black/15 shadow-lg w-44 py-1 text-sm">
          {!isSuspended && (
            <>
              <div className="px-3 py-1 text-[10px] font-black uppercase text-gray-400">{t("suspendSectionTitle")}</div>
              {SUSPEND_OPTIONS.map((o) => (
                <button
                  key={o.days}
                  type="button"
                  disabled={busy}
                  onClick={() => suspend(o.days)}
                  className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-700 font-medium disabled:opacity-50"
                >
                  {o.label}
                </button>
              ))}
            </>
          )}
          {isSuspended && (
            <button
              type="button"
              disabled={busy}
              onClick={unsuspend}
              className="w-full text-left px-3 py-1.5 hover:bg-green-50 text-green-700 font-medium disabled:opacity-50"
            >
              {t("liftSuspension")}
            </button>
          )}
          <div className="border-t border-black/10 my-1" />
          <div className="px-3 py-1 text-[10px] font-black uppercase text-gray-400">{t("roleSectionTitle")}</div>
          {role !== "admin" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => changeRole("admin")}
              className="w-full text-left px-3 py-1.5 hover:bg-purple-50 text-purple-700 font-medium disabled:opacity-50"
            >
              {t("promoteToAdmin")}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => changeRole("user")}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 font-medium disabled:opacity-50"
            >
              {t("demoteToUser")}
            </button>
          )}
          {err && <div className="px-3 py-1.5 text-xs text-red-600">{err}</div>}
        </div>
      )}
    </div>
  );
}
