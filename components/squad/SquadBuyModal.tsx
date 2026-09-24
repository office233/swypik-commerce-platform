"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Users, Clock, Share2, Sparkles, X, Check, ArrowRight, ShieldCheck, Flame } from "lucide-react";
import { playCashRegisterSound, playPopSound } from "@/lib/audio/sfx";
import { triggerConfetti } from "@/lib/confetti";
import { haptic } from "@/lib/haptic";
import { SQUAD_DISCOUNT_PCT, SQUAD_TTL_HOURS } from "@/lib/squad/config";
import { logger } from "@/lib/logger";

interface SquadBuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    id: string;
    title: string;
    image?: string;
    price: number; // în lei
  };
}

interface ActiveSquad {
  id: string;
  creator_name: string;
  creator_avatar: string | null;
  expires_at: string;
  current_members: number;
  required_members: number;
  squad_price_cents: number;
}

export function SquadBuyModal({ isOpen, onClose, product }: SquadBuyModalProps) {
  const t = useTranslations("sellerGrowthSquadBuyModal");
  const router = useRouter();
  const [activeSquads, setActiveSquads] = useState<ActiveSquad[]>([]);
  const [loading, setLoading] = useState(false);
  const [createdSquad, setCreatedSquad] = useState<{ id: string; shareUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const regularPrice = product.price;
  const discountFactor = SQUAD_DISCOUNT_PCT / 100;
  const squadPrice = (regularPrice * (1 - discountFactor)).toFixed(2);
  const savings = (regularPrice * discountFactor).toFixed(2);

  useEffect(() => {
    if (!isOpen || !product.id) return;
    setCreatedSquad(null);
    setLoading(true);

    fetch(`/api/squad?productId=${product.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.squads)) {
          setActiveSquads(d.squads);
        }
      })
      .catch((err) => logger.warn({ err }, "SquadBuyModal: failed to load active squads"))
      .finally(() => setLoading(false));
  }, [isOpen, product.id]);

  if (!isOpen) return null;

  const handleCreateSquad = async () => {
    playPopSound();
    haptic("tap");
    setLoading(true);
    try {
      const res = await fetch("/api/squad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.squad) {
        setCreatedSquad({
          id: data.squad.id,
          shareUrl: data.shareUrl || `/squad/${data.squad.id}`,
        });
        playCashRegisterSound();
        triggerConfetti();
      } else {
        alert(data.error || t("errorCreateSquad"));
      }
    } catch (err) {
      logger.error({ err }, "SquadBuyModal: failed to create squad");
      alert(t("errorConnection"));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSquad = async (squadId: string) => {
    playPopSound();
    haptic("tap");
    setLoading(true);
    try {
      const res = await fetch(`/api/squad/${squadId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No userName: the server derives the joiner's identity from the
        // authenticated session instead of a hardcoded placeholder.
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        playCashRegisterSound();
        triggerConfetti();
        router.push(`/squad/${squadId}`);
      } else {
        alert(data.error || t("errorJoin"));
      }
    } catch (err) {
      logger.error({ err }, "SquadBuyModal: failed to join squad");
      alert(t("errorJoinConnection"));
    } finally {
      setLoading(false);
    }
  };

  const handleShareWhatsApp = () => {
    if (!createdSquad) return;
    playPopSound();
    const fullUrl = `${window.location.origin}${createdSquad.shareUrl}`;
    const msg = encodeURIComponent(t("whatsappMessage", { title: product.title, squadPrice, regularPrice, pct: SQUAD_DISCOUNT_PCT, url: fullUrl }));
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const handleCopyLink = () => {
    if (!createdSquad) return;
    playPopSound();
    const fullUrl = `${window.location.origin}${createdSquad.shareUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative bg-gradient-to-b from-[#1C1A27] to-[#0E0C15] border border-violet-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl text-white overflow-hidden">
        {/* Glow ambient */}
        <div className="absolute -top-24 -left-24 w-52 h-52 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-52 h-52 bg-pink-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-neutral-400 hover:text-white transition"
          aria-label={t("close")}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 text-violet-400 font-black text-xs uppercase tracking-widest mb-2">
          <Flame size={16} className="text-orange-400" />
          <span>{t("headerBadge", { pct: SQUAD_DISCOUNT_PCT })}</span>
        </div>

        {/* Product Snapshot */}
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 mb-5">
          {product.image && (
            <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external product image host */}
              <img src={product.image} alt={product.title} width={64} height={64} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-black truncate">{product.title}</h4>
            <div className="flex items-baseline gap-2 mt-1 flex-wrap">
              <span className="text-lg font-black text-emerald-400">{squadPrice} lei</span>
              <span className="text-xs text-neutral-400 line-through">{regularPrice} lei</span>
              <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
                {t("discountBadge", { pct: SQUAD_DISCOUNT_PCT, savings })}
              </span>
            </div>
          </div>
        </div>

        {createdSquad ? (
          /* Stare: Squad creat cu succes, invită prieten */
          <div className="space-y-4 py-2 text-center animate-in zoom-in-95 duration-200">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-black uppercase tracking-wider">
              <Sparkles size={14} /> {t("squadCreatedSuccess")}
            </div>

            <p className="text-xs text-neutral-300">
              {t.rich("squadCreatedHint", { price: squadPrice, b: (chunks) => <strong className="text-white">{chunks}</strong> })}
            </p>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center gap-3">
              <div className="flex -space-x-2">
                <div className="w-10 h-10 rounded-full bg-violet-600 border-2 border-[#1C1A27] flex items-center justify-center font-black text-xs text-white">
                  {t("you")}
                </div>
                <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-dashed border-white/30 flex items-center justify-center text-xs text-neutral-400 font-bold">
                  +1
                </div>
              </div>
              <div className="text-left text-xs font-medium text-neutral-300">
                {t("waitingForFriend", { hours: SQUAD_TTL_HOURS })}
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="w-full py-3.5 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-neutral-950 font-black text-sm shadow-lg flex items-center justify-center gap-2 transition active:scale-98"
              >
                <Share2 size={18} />
                {t("sendWhatsapp", { pct: SQUAD_DISCOUNT_PCT })}
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition flex items-center justify-center gap-2"
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : null}
                {copied ? t("linkCopied") : t("copyLink")}
              </button>

              <button
                type="button"
                onClick={() => router.push(createdSquad.shareUrl)}
                className="w-full py-2.5 text-xs text-violet-400 hover:text-violet-300 font-black flex items-center justify-center gap-1"
              >
                {t("viewFullSquadPage")} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          /* Stare Normală: Squad-uri deschise sau Inițiere */
          <div className="space-y-4">
            {activeSquads.length > 0 && (
              <div>
                <h5 className="text-xs font-black text-neutral-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Users size={14} className="text-violet-400" />
                  {t("openSquadsForProduct", { count: activeSquads.length })}
                </h5>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {activeSquads.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-violet-500/40 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-violet-600/30 text-violet-300 font-black text-xs flex items-center justify-center border border-violet-500/40 shrink-0">
                          {s.creator_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-white truncate">{s.creator_name}</p>
                          <p className="text-[10px] text-neutral-400 flex items-center gap-1">
                            <Clock size={10} /> {t("oneSpotLeft")}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleJoinSquad(s.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-black text-xs shadow transition active:scale-95 disabled:opacity-50 shrink-0"
                      >
                        {t("joinFor", { price: squadPrice })}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA Inițiază Squad Nou */}
            <div className="pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={handleCreateSquad}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-black text-sm shadow-xl shadow-violet-600/30 flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50"
              >
                <Users size={18} />
                {loading ? t("initiating") : t("startNewSquad", { price: squadPrice, pct: SQUAD_DISCOUNT_PCT })}
              </button>

              <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-400 mt-3 text-center">
                <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
                <span>{t("guarantee", { hours: SQUAD_TTL_HOURS })}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
