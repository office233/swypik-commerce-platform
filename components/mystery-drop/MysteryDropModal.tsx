"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Gift, Share2, Check, X, ArrowRight, Zap, Lock } from "lucide-react";
import { MysteryDropReward } from "@/lib/mystery-drop/engine";
import { playMysteryUnboxSound, playVictorySound, playPopSound } from "@/lib/audio/sfx";
import { triggerConfetti } from "@/lib/confetti";

export function MysteryDropModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpenedBox, setHasOpenedBox] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reward, setReward] = useState<MysteryDropReward | null>(null);
  const [copied, setCopied] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setIsAuthenticated(Boolean(d?.authenticated)))
      .catch(() => setIsAuthenticated(false));
  }, []);

  useEffect(() => {
    // Show automatically after 2.5s if not claimed today
    const lastClaimed = localStorage.getItem("swypik_last_drop_date");
    const todayStr = new Date().toISOString().slice(0, 10);

    const onManualOpen = () => {
      playPopSound();
      setIsOpen(true);
    };
    window.addEventListener("open-mystery-drop", onManualOpen);

    if (lastClaimed !== todayStr) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 2500);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("open-mystery-drop", onManualOpen);
      };
    }
    return () => {
      window.removeEventListener("open-mystery-drop", onManualOpen);
    };
  }, []);

  const handleOpenBox = async () => {
    if (isAuthenticated === false) {
      playPopSound();
      router.push("/auth?next=/");
      return;
    }
    playPopSound();
    setLoading(true);
    try {
      const lastClaimed = localStorage.getItem("swypik_last_drop_date");
      const res = await fetch("/api/mystery-drop/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastClaimedAt: lastClaimed }),
      });

      const data = await res.json();
      if (res.status === 401 || data.requireAuth) {
        setIsAuthenticated(false);
        return;
      }
      if (data.success && data.reward) {
        setReward(data.reward);
        setHasOpenedBox(true);
        playMysteryUnboxSound();
        triggerConfetti();
        localStorage.setItem("swypik_last_drop_date", new Date().toISOString().slice(0, 10));
      } else {
        alert(data.error || "Ai deschis deja cutia de azi!");
        setIsOpen(false);
      }
    } catch {
      alert("A apărut o eroare de conexiune.");
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    playVictorySound();
    const shareUrl = `https://swypik.com?ref=mystery_${Date.now().toString(36)}`;
    if (navigator.share) {
      navigator.share({
        title: "Swypik Daily Mystery Drop",
        text: `Am deschis cutia misterioasă pe Swypik și am câștigat: ${reward?.title}! Deschide și tu gratuit:`,
        url: shareUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <>
      {/* Floating Pill Button to Reopen or View Drop - Positioned on bottom-left to avoid colliding with AI chatbot */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 left-4 z-30 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 text-white font-black text-xs shadow-xl hover:scale-105 active:scale-95 transition-all ring-2 ring-white/20"
      >
        <span className="text-base">🎁</span>
        <span>Cutia Zilei</span>
      </button>

      {/* Unboxing Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative bg-gradient-to-b from-[#1C1A27] to-[#0E0C15] border border-amber-500/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center text-white overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute -top-20 -left-20 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-pink-500/20 rounded-full blur-3xl pointer-events-none" />

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-neutral-400 hover:text-white transition"
            >
              <X size={16} />
            </button>

            {!hasOpenedBox ? (
              isAuthenticated === false ? (
                /* Auth Gate: User must have an account to receive rewards/discounts */
                <div className="space-y-4 py-3 animate-in fade-in duration-200">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[11px] font-black uppercase tracking-wider">
                    <Lock size={12} /> Doar pentru membri
                  </div>

                  <div className="relative my-3 select-none flex justify-center">
                    <div className="relative">
                      <div className="text-6xl filter drop-shadow-[0_10px_20px_rgba(245,158,11,0.3)]">
                        🎁
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-amber-500 text-neutral-950 p-1.5 rounded-full ring-2 ring-[#1C1A27]">
                        <Lock size={14} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-black tracking-tight">Premiile sunt doar pentru conturi Swypik</h3>
                    <p className="text-xs text-neutral-300 mt-2 max-w-xs mx-auto leading-relaxed">
                      Conectează-te sau creează un cont gratuit în câteva secunde pentru a primi reducerile de azi, monedele SWYP și codurile promoționale.
                    </p>
                  </div>

                  <div className="pt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        playPopSound();
                        router.push("/auth?next=/");
                      }}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-neutral-950 font-black text-sm shadow-lg shadow-amber-500/25 transition active:scale-98 flex items-center justify-center gap-2"
                    >
                      <span>Conectează-te / Înregistrare</span>
                      <ArrowRight size={16} />
                    </button>
                    <p className="text-[11px] text-neutral-400">100% Gratuit • Primești bonus de bun venit</p>
                  </div>
                </div>
              ) : (
                /* State 1: Ready to Unbox for authenticated users */
                <div className="space-y-4 py-3">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[11px] font-black uppercase tracking-wider">
                    <Sparkles size={12} className="animate-spin" /> 1 Drop Gratuit Zilnic
                  </div>

                  <div className="relative my-4 cursor-pointer" onClick={handleOpenBox}>
                    <div className="text-7xl animate-pulse select-none filter drop-shadow-[0_10px_20px_rgba(245,158,11,0.4)]">
                      🎁
                    </div>
                    <div className="text-xs text-amber-300 font-bold mt-2">Apasă pentru a deschide!</div>
                  </div>

                  <div>
                    <h3 className="text-xl font-black tracking-tight">Cutia Misterioasă Swypik</h3>
                    <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
                      Câștigă garantat monede SWYP, reduceri la curse Swypik Go, mâncare sau produse virale la 0 Lei!
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleOpenBox}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-neutral-950 font-black text-sm shadow-lg shadow-amber-500/25 transition active:scale-98 disabled:opacity-50"
                  >
                    {loading ? "Se deschide cutia..." : "DESCHIDE ACUM ⚡"}
                  </button>
                </div>
              )
            ) : (
              /* State 2: Box Opened - Reward Celebration */
              <div className="space-y-4 py-2 animate-in zoom-in-95 duration-200">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[11px] font-black uppercase tracking-wider">
                  🎉 {reward?.badge}
                </div>

                <div className="text-6xl my-2 filter drop-shadow-[0_10px_25px_rgba(16,185,129,0.5)]">
                  {reward?.icon}
                </div>

                <div>
                  <h3 className="text-xl font-black text-white">{reward?.title}</h3>
                  <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/10">
                    {reward?.description}
                  </p>
                </div>

                {reward?.code && (
                  <div className="bg-amber-400/10 border border-amber-400/30 p-2.5 rounded-xl font-mono text-sm font-black text-amber-300">
                    COD: {reward.code}
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  {reward?.shareToUnlock ? (
                    <button
                      type="button"
                      onClick={handleShare}
                      className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs shadow-lg transition flex items-center justify-center gap-2"
                    >
                      <Share2 size={16} />
                      {copied ? "Link Copiat în Clipboard!" : "Trimite pe WhatsApp să revendici"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="w-full py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-xs shadow-lg transition"
                    >
                      Revendică Premiul
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
