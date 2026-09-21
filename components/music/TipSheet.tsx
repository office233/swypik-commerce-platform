"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heart, Loader2, X } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { MUSIC_TIP_MAX_UNITS, MUSIC_TIP_MIN_UNITS, MUSIC_TIP_PRESETS_UNITS, SWYP_UNITS_PER_COIN } from "@/lib/music/config";
import { unitsToSwyp } from "./format";

type Props = {
  open: boolean;
  onClose: () => void;
  artistSlug: string;
  trackSlug?: string;
  onSent?: (units: number) => void;
};

/** Bottom-sheet de tip pentru artiști: 3 presetări SWYP + sumă liberă, idempotent la retry. */
export default function TipSheet({ open, onClose, artistSlug, trackSlug, onSent }: Props) {
  const t = useTranslations("music");
  const router = useRouter();

  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<number | null>(MUSIC_TIP_PRESETS_UNITS[0]);
  const [customSwyp, setCustomSwyp] = useState("");
  const [balanceUnits, setBalanceUnits] = useState<number | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentUnits, setSentUnits] = useState<number | null>(null);

  // Idempotency key: generată o singură dată la deschidere, refolosită la retry.
  useEffect(() => {
    if (!open) return;
    setIdempotencyKey(crypto.randomUUID());
    setSelectedUnits(MUSIC_TIP_PRESETS_UNITS[0]);
    setCustomSwyp("");
    setNotice(null);
    setSentUnits(null);
    setBalanceLoaded(false);
    setAuthRequired(false);

    let cancelled = false;
    fetch("/api/swyp/wallet", { cache: "no-store" })
      .then((res) => {
        if (res.status === 401) return null;
        return res.json();
      })
      .then((data: { balanceUnits?: string | number } | null) => {
        if (cancelled) return;
        if (data && typeof data.balanceUnits !== "undefined") {
          setBalanceUnits(Number(data.balanceUnits));
          setAuthRequired(false);
        } else {
          setBalanceUnits(null);
          setAuthRequired(true);
        }
      })
      .catch(() => { if (!cancelled) { setBalanceUnits(null); setAuthRequired(true); } })
      .finally(() => { if (!cancelled) setBalanceLoaded(true); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const customUnits = (() => {
    const n = Number(customSwyp.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * SWYP_UNITS_PER_COIN);
  })();
  const activeUnits = selectedUnits ?? customUnits;
  const validUnits = activeUnits !== null && Number.isInteger(activeUnits) && activeUnits >= MUSIC_TIP_MIN_UNITS && activeUnits <= MUSIC_TIP_MAX_UNITS;
  const insufficient = balanceUnits !== null && activeUnits !== null && balanceUnits < activeUnits;

  const nextPath = trackSlug ? `/music/track/${trackSlug}` : `/music/artist/${artistSlug}`;

  const send = async () => {
    if (busy || !validUnits || activeUnits === null) return;
    if (authRequired) { router.push(`/auth?next=${nextPath}`); return; }
    haptic("tap");
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/music/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistSlug, trackSlug, units: activeUnits, idempotencyKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSentUnits(activeUnits);
        if (typeof data.balanceUnits !== "undefined") setBalanceUnits(Number(data.balanceUnits));
        onSent?.(activeUnits);
        return;
      }
      if (res.status === 401) { setAuthRequired(true); router.push(`/auth?next=${nextPath}`); return; }
      setNotice(data.error === "insufficient_balance" ? t("insufficient") : t("tipError"));
    } catch {
      setNotice(t("tipError"));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label={t("close")} />
      <section
        role="dialog"
        aria-modal="true"
        className="relative max-h-[85vh] overflow-y-auto rounded-t-3xl bg-[#121218] px-5 pt-4 text-white shadow-2xl"
        style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-black">{t("tipTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/70">
            <X size={18} />
          </button>
        </div>

        {sentUnits !== null ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Heart size={32} className="fill-[#7C3AED] text-[#7C3AED]" />
            <p className="text-sm font-bold">{t("tipSent")}</p>
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-white/50">{t("tipPresets")}</p>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {MUSIC_TIP_PRESETS_UNITS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => { haptic("tap"); setSelectedUnits(preset); setCustomSwyp(""); }}
                  className={`rounded-2xl py-3 text-sm font-black ring-1 transition active:scale-95 ${
                    selectedUnits === preset ? "bg-[#7C3AED] text-white ring-[#7C3AED]" : "bg-white/5 text-white ring-white/15"
                  }`}
                >
                  {t("priceSwyp", { amount: unitsToSwyp(preset) })}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/50" htmlFor="music-tip-custom">
              {t("tipCustom")}
            </label>
            <input
              id="music-tip-custom"
              type="number"
              inputMode="decimal"
              min={MUSIC_TIP_MIN_UNITS / SWYP_UNITS_PER_COIN}
              max={MUSIC_TIP_MAX_UNITS / SWYP_UNITS_PER_COIN}
              value={customSwyp}
              onChange={(e) => { setCustomSwyp(e.target.value); setSelectedUnits(null); }}
              className="mb-4 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#7C3AED]"
            />

            {balanceLoaded && !authRequired && balanceUnits !== null && (
              <p className="mb-3 text-center text-[11px] text-white/60">{t("yourBalance", { amount: unitsToSwyp(balanceUnits) })}</p>
            )}
            {notice && <p className="mb-3 text-center text-xs text-amber-300">{notice}</p>}
            {!authRequired && insufficient && !notice && <p className="mb-3 text-center text-xs text-amber-300">{t("insufficient")}</p>}

            <button
              type="button"
              onClick={send}
              disabled={busy || !validUnits || (!authRequired && insufficient)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-black text-black active:scale-95 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Heart size={16} />}
              {authRequired ? t("loginToTip") : t("tipSend")}
            </button>
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
