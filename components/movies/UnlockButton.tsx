"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { haptic } from "@/lib/haptic";
import { SWYP_UNITS_PER_COIN } from "@/lib/movies/config";

export function unitsToSwyp(units: number): string {
  return (units / SWYP_UNITS_PER_COIN).toLocaleString("ro-RO", { maximumFractionDigits: 2 });
}

type Props = {
  slug: string;
  target: { episodeId: string } | { season: true };
  priceUnits: number;
  balanceUnits: number | null;
  label: string;
  onUnlocked: (balanceUnits: number) => void;
};

export default function UnlockButton({ slug, target, priceUnits, balanceUnits, label, onUnlocked }: Props) {
  const t = useTranslations("movies");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const insufficient = balanceUnits !== null && balanceUnits < priceUnits;

  const unlock = async () => {
    haptic("tap");
    if (balanceUnits === null) {
      router.push(`/auth?next=/movies/${slug}`);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/movies/${slug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice(t("unlocked"));
        onUnlocked(Number(data.balanceUnits ?? 0));
        return;
      }
      if (res.status === 401) {
        router.push(`/auth?next=/movies/${slug}`);
        return;
      }
      setNotice(data.error === "insufficient_balance" ? t("insufficient") : t("error"));
    } catch {
      setNotice(t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={unlock}
        disabled={busy || insufficient}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-black text-black active:scale-95 disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
        {busy ? t("unlocking") : balanceUnits === null ? t("loginToUnlock") : `${label} · ${t("priceSwyp", { amount: unitsToSwyp(priceUnits) })}`}
      </button>
      {balanceUnits !== null && <p className="text-center text-[11px] text-white/60">{t("yourBalance", { amount: unitsToSwyp(balanceUnits) })}</p>}
      {(insufficient || notice) && <p className="text-center text-xs text-amber-300">{notice ?? t("insufficient")}</p>}
    </div>
  );
}
