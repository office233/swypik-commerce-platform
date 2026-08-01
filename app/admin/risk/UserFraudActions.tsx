"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Ban } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  userId: string;
  blocked: boolean;
};

export function UserFraudActions({ userId, blocked }: Props) {
  const t = useTranslations("adminRisk");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function decide(action: "block" | "unblock") {
    if (busy || pending) return;
    const reason = prompt(
      action === "unblock"
        ? "Motiv deblocare user (ex: identitate verificată, false positive):"
        : "Motiv blocare user (ex: pattern fraudă multi-order):",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      alert("Motivul este obligatoriu.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/fraud-block`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        alert(`Eroare: ${data?.error || res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e: any) {
      alert(`Network error: ${e?.message}`);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;
  return blocked ? (
    <button
      type="button"
      onClick={() => decide("unblock")}
      disabled={disabled}
      className="shrink-0 text-[11px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-semibold disabled:opacity-50"
    >
      {disabled ? "..." : <span className="inline-flex items-center gap-1"><Check size={12} /> {t("unblock")}</span>}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => decide("block")}
      disabled={disabled}
      className="shrink-0 text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 font-semibold disabled:opacity-50"
    >
      {disabled ? "..." : <span className="inline-flex items-center gap-1"><Ban size={12} /> {t("blockUser")}</span>}
    </button>
  );
}
