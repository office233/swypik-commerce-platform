"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Lock, X } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { unitsToSwyp } from "./format";
import type { MusicLockedInfo } from "./MusicPlayerProvider";

type UnlockTarget = "track" | "album";

type Props = {
  locked: MusicLockedInfo | null;
  onUnlocked: () => void;
  onClose: () => void;
  /**
   * Slug-ul albumului, dacă piesa face parte dintr-unul. 402-ul de pe
   * `/api/music/tracks/<slug>/play` nu îl întoarce (doar prețul) — paginile
   * care au deja `AlbumDto` (Task 11) îl pot pasa ca să afișeze și butonul
   * de deblocare a albumului întreg.
   */
  albumSlug?: string;
};

/** Card de paywall: preț piesă / album, butoane de deblocare, sold curent. */
export default function MusicPaywall({ locked, onUnlocked, onClose, albumSlug }: Props) {
  const t = useTranslations("music");
  const router = useRouter();
  const [busy, setBusy] = useState<UnlockTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!locked) return null;
  const { track, priceUnits, albumPriceUnits, balanceUnits, requireAuth } = locked;

  const goLogin = () => router.push(`/auth?next=/music/track/${track.slug}`);

  const unlock = async (target: UnlockTarget) => {
    if (requireAuth) { goLogin(); return; }
    haptic("tap");
    setBusy(target);
    setNotice(null);
    try {
      const path = target === "track" ? `/api/music/tracks/${track.slug}/unlock` : `/api/music/albums/${albumSlug}/unlock`;
      const res = await fetch(path, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onUnlocked();
        return;
      }
      if (res.status === 401) { goLogin(); return; }
      setNotice(data.error === "insufficient_balance" ? t("insufficient") : t("error"));
    } catch {
      setNotice(t("error"));
    } finally {
      setBusy(null);
    }
  };

  const insufficientTrack = balanceUnits !== null && priceUnits !== null && balanceUnits < priceUnits;

  return (
    <div className="relative flex flex-col items-center gap-3 rounded-2xl bg-[#121218] p-5 text-center text-white ring-1 ring-white/10">
      <button type="button" onClick={onClose} aria-label={t("close")} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/70">
        <X size={16} />
      </button>
      <div className="grid h-12 w-12 place-items-center rounded-full bg-white/10 ring-1 ring-white/20">
        <Lock size={22} />
      </div>
      <p className="text-lg font-black">{t("locked")}</p>
      <p className="truncate text-sm text-white/70">{track.title} · {track.artist.stageName}</p>

      {priceUnits !== null && (
        <button
          type="button"
          onClick={() => unlock("track")}
          disabled={busy !== null || (!requireAuth && insufficientTrack)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-black text-black active:scale-95 disabled:opacity-50"
        >
          {busy === "track" ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
          {busy === "track" ? t("unlocking") : requireAuth ? t("loginToUnlock") : `${t("unlockTrack")} · ${t("priceSwyp", { amount: unitsToSwyp(priceUnits) })}`}
        </button>
      )}

      {albumPriceUnits !== null && albumSlug && (
        <button
          type="button"
          onClick={() => unlock("album")}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-3.5 text-sm font-black text-white ring-1 ring-white/20 active:scale-95 disabled:opacity-50"
        >
          {busy === "album" ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
          {busy === "album" ? t("unlocking") : requireAuth ? t("loginToUnlock") : `${t("unlockAlbum")} · ${t("albumPriceSwyp", { amount: unitsToSwyp(albumPriceUnits) })}`}
        </button>
      )}

      {!requireAuth && balanceUnits !== null && <p className="text-[11px] text-white/60">{t("yourBalance", { amount: unitsToSwyp(balanceUnits) })}</p>}
      {notice && <p className="text-xs text-amber-300">{notice}</p>}
    </div>
  );
}
