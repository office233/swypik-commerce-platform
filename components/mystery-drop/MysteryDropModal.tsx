"use client";
import { useTranslations } from "next-intl";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Share2, X, ArrowRight, Lock } from "lucide-react";
import type { MysteryDropReward } from "@/lib/mystery-drop/engine";
import { playMysteryUnboxSound, playVictorySound, playPopSound } from "@/lib/audio/sfx";
import { triggerConfetti } from "@/lib/confetti";
import { APP_URL } from "@/lib/app-url";

/** Doar o conveniență de UI (nu re-deschidem automat cutia azi). Adevărul e în DB. */
const LAST_DROP_STORAGE_KEY = "swypik_last_drop_date";
const AUTO_OPEN_DELAY_MS = 2500;

type ClaimResponse =
  | { success: true; reward: MysteryDropReward }
  | { success: false; error: string; requireAuth?: boolean; alreadyClaimed?: boolean };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readLastDrop(): string | null {
  try {
    return localStorage.getItem(LAST_DROP_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLastDrop(): void {
  try {
    localStorage.setItem(LAST_DROP_STORAGE_KEY, todayKey());
  } catch {
    // storage indisponibil (mod privat / blocat): ignorăm, DB-ul rămâne sursa adevărului
  }
}

export function MysteryDropModal() {
  const router = useRouter();
  const t = useTranslations("mysteryDrop");
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reward, setReward] = useState<MysteryDropReward | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setIsAuthenticated(Boolean(d?.authenticated)))
      .catch(() => setIsAuthenticated(false));
  }, []);

  useEffect(() => {
    const onManualOpen = () => {
      playPopSound();
      setIsOpen(true);
    };
    window.addEventListener("open-mystery-drop", onManualOpen);

    const timer =
      readLastDrop() !== todayKey() ? setTimeout(() => setIsOpen(true), AUTO_OPEN_DELAY_MS) : null;

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("open-mystery-drop", onManualOpen);
    };
  }, []);

  const handleOpenBox = async () => {
    playPopSound();
    if (isAuthenticated === false) {
      router.push("/auth?next=/");
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/mystery-drop/claim", { method: "POST" });
      const data = (await res.json()) as ClaimResponse;

      if (!data.success) {
        if (res.status === 401 || data.requireAuth) {
          setIsAuthenticated(false);
          return;
        }
        if (data.alreadyClaimed) {
          writeLastDrop();
          setNotice(t("alreadyClaimed"));
          return;
        }
        setNotice(t("unavailable"));
        return;
      }

      setReward(data.reward);
      writeLastDrop();
      playMysteryUnboxSound();
      triggerConfetti();
    } catch {
      setNotice(t("connectionError"));
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    playVictorySound();
    const url = `${APP_URL}/`;
    const text = reward ? t("shareText", { amount: reward.swypAmount }) : "";
    if (navigator.share) {
      navigator.share({ title: t("shareTitle"), text, url }).catch(() => {});
    } else {
      void navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 left-4 z-30 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 text-white font-black text-xs shadow-xl hover:scale-105 active:scale-95 transition-all ring-2 ring-white/20"
      >
        <span className="text-base">🎁</span>
        <span>{t("pill")}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative bg-gradient-to-b from-[#1C1A27] to-[#0E0C15] border border-amber-500/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center text-white overflow-hidden">
            <div className="absolute -top-20 -left-20 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-pink-500/20 rounded-full blur-3xl pointer-events-none" />

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-neutral-400 hover:text-white transition"
              aria-label={t("close")}
            >
              <X size={16} />
            </button>

            {reward ? (
              <div className="space-y-4 py-2 animate-in zoom-in-95 duration-200">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[11px] font-black uppercase tracking-wider">
                  🎉 {reward.badge}
                </div>
                <div className="text-6xl my-2 filter drop-shadow-[0_10px_25px_rgba(16,185,129,0.5)]">{reward.icon}</div>
                <div>
                  <h3 className="text-xl font-black text-white">+{reward.swypAmount} SWYP</h3>
                  <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/10">
                    {t("credited")}
                  </p>
                </div>
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs shadow-lg transition flex items-center justify-center gap-2"
                  >
                    <Share2 size={16} />
                    {copied ? t("linkCopied") : t("tellFriends")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-black text-xs transition"
                  >
                    {t("close")}
                  </button>
                </div>
              </div>
            ) : isAuthenticated === false ? (
              <div className="space-y-4 py-3 animate-in fade-in duration-200">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[11px] font-black uppercase tracking-wider">
                  <Lock size={12} /> {t("membersOnly")}
                </div>
                <div className="text-6xl my-3 select-none filter drop-shadow-[0_10px_20px_rgba(245,158,11,0.3)]">🎁</div>
                <div>
                  <h3 className="text-xl font-black tracking-tight">{t("membersTitle")}</h3>
                  <p className="text-xs text-neutral-300 mt-2 max-w-xs mx-auto leading-relaxed">
                    {t("membersBody")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playPopSound();
                    router.push("/auth?next=/");
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-neutral-950 font-black text-sm shadow-lg shadow-amber-500/25 transition flex items-center justify-center gap-2"
                >
                  <span>{t("loginCta")}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <div className="space-y-4 py-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[11px] font-black uppercase tracking-wider">
                  <Sparkles size={12} /> {t("dailyFree")}
                </div>
                <button type="button" className="relative my-4 block w-full" onClick={handleOpenBox} disabled={loading}>
                  <div className="text-7xl animate-pulse select-none filter drop-shadow-[0_10px_20px_rgba(245,158,11,0.4)]">🎁</div>
                  <div className="text-xs text-amber-300 font-bold mt-2">{t("tapToOpen")}</div>
                </button>
                <div>
                  <h3 className="text-xl font-black tracking-tight">{t("boxTitle")}</h3>
                  <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">{t("boxBody")}</p>
                </div>
                {notice && <p className="text-xs text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded-xl p-2.5">{notice}</p>}
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleOpenBox}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-neutral-950 font-black text-sm shadow-lg shadow-amber-500/25 transition disabled:opacity-50"
                >
                  {loading ? t("opening") : t("openNow")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
