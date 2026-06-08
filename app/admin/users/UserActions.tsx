"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  userId: string;
  username: string;
  role: string;
  isSuspended: boolean;
};

const SUSPEND_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: "1 zi" },
  { days: 7, label: "7 zile" },
  { days: 30, label: "30 zile" },
  { days: 36500, label: "Permanent" },
];

export default function UserActions({ userId, username, role, isSuspended }: Props) {
  const t = useTranslations("usersUserActions");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function call(url: string, body?: Record<string, unknown>) {
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
        setErr(data?.error || `Eroare ${res.status}`);
        setBusy(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare retea");
    } finally {
      setBusy(false);
    }
  }

  async function suspend(days: number) {
    const reason = prompt(`Motiv suspendare @${username} (${days >= 36500 ? "permanent" : days + " zile"}):`);
    if (reason === null) return;
    await call(`/api/admin/users/${userId}/suspend`, { days, reason });
  }

  async function unsuspend() {
    if (!confirm(`Ridici suspendarea pentru @${username}?`)) return;
    await call(`/api/admin/users/${userId}/unsuspend`);
  }

  async function changeRole(newRole: "admin" | "user") {
    const verb = newRole === "admin" ? "Promovezi" : "Retrogradezi";
    if (!confirm(`${verb} @${username} la rol "${newRole}"?`)) return;
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

        {t("actiuni")} <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg border border-black/15 shadow-lg w-44 py-1 text-sm">
          {!isSuspended && (
            <>
              <div className="px-3 py-1 text-[10px] font-black uppercase text-gray-400">Suspenda</div>
              {SUSPEND_OPTIONS.map((o) => (
                <button
                  key={o.days}
                  type="button"
                  onClick={() => suspend(o.days)}
                  className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-700 font-medium"
                >
                  {o.label}
                </button>
              ))}
            </>
          )}
          {isSuspended && (
            <button
              type="button"
              onClick={unsuspend}
              className="w-full text-left px-3 py-1.5 hover:bg-green-50 text-green-700 font-medium"
            >
              Ridica suspendarea
            </button>
          )}
          <div className="border-t border-black/10 my-1" />
          <div className="px-3 py-1 text-[10px] font-black uppercase text-gray-400">Rol</div>
          {role !== "admin" ? (
            <button
              type="button"
              onClick={() => changeRole("admin")}
              className="w-full text-left px-3 py-1.5 hover:bg-purple-50 text-purple-700 font-medium"
            >

              {t("promoveazaLaAdmin")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => changeRole("user")}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 font-medium"
            >

              {t("retrogradeazaLaUser")}
            </button>
          )}
          {err && <div className="px-3 py-1.5 text-xs text-red-600">{err}</div>}
        </div>
      )}
    </div>
  );
}
