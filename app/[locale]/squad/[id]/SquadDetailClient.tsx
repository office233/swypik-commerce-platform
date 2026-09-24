"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowLeft, Clock, Users, Share2, CheckCircle2, Sparkles, Copy, Check } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { playCashRegisterSound, playVictorySound } from "@/lib/audio/sfx";
import { triggerConfetti } from "@/lib/confetti";
import { SQUAD_DISCOUNT_PCT } from "@/lib/squad/config";
import { logger } from "@/lib/logger";

interface SquadData {
    id: string;
    product_id: string;
    creator_name: string;
    creator_avatar: string | null;
    required_members: number;
    current_members: number;
    squad_price_cents: number;
    regular_price_cents: number;
    status: "active" | "completed" | "expired";
    expires_at: string;
    product_title?: string;
    product_image?: string;
}

interface Member {
    id: string;
    user_name: string;
    user_avatar: string | null;
    joined_at: string;
}

export default function SquadDetailClient({ squadId }: { squadId: string }) {
    const t = useTranslations("sellerGrowthPublicSquad");
    const router = useRouter();
    const [squad, setSquad] = useState<SquadData | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [copied, setCopied] = useState(false);
    const [timeLeft, setTimeLeft] = useState<string>("");

    useEffect(() => {
        fetch(`/api/squad/${squadId}`)
            .then((r) => r.json())
            .then((d) => {
                if (d.success) {
                    setSquad(d.squad);
                    setMembers(d.members || []);
                }
            })
            .catch((err) => logger.warn({ err, squadId }, "Squad detail: failed to load squad"))
            .finally(() => setLoading(false));
    }, [squadId]);

    // Countdown timer
    useEffect(() => {
        if (!squad?.expires_at) return;
        const tick = () => {
            const diff = new Date(squad.expires_at).getTime() - Date.now();
            if (diff <= 0) {
                setTimeLeft(t("expired"));
                return;
            }
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            setTimeLeft(`${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);
        };
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` is stable from useTranslations; only the expiry timestamp should restart the countdown.
    }, [squad?.expires_at]);

    const formatLei = (cents: number) => (cents / 100).toFixed(2) + " lei";

    const shareWhatsApp = () => {
        haptic("tap");
        if (!squad) return;
        const currentUrl = typeof window !== "undefined" ? window.location.href : "";
        const title = squad.product_title || t("thisProductFallback");
        const price = formatLei(squad.squad_price_cents);
        const oldPrice = formatLei(squad.regular_price_cents);
        const msg = encodeURIComponent(t("detailWhatsappMessage", { title, price, oldPrice, pct: SQUAD_DISCOUNT_PCT, url: currentUrl }));
        window.open(`https://wa.me/?text=${msg}`, "_blank");
    };

    const copyLink = () => {
        haptic("tap");
        if (typeof window !== "undefined") {
            navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const joinSquad = async () => {
        haptic("tap");
        setJoining(true);
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
                setSquad(data.squad);
                if (data.squad?.status === "completed") {
                    playCashRegisterSound();
                    triggerConfetti();
                } else {
                    playVictorySound();
                }
                // Refresh members
                const r2 = await fetch(`/api/squad/${squadId}`).then((r) => r.json()).catch(() => ({}));
                if (r2.success) setMembers(r2.members || []);
            } else {
                alert(data.error || t("errorJoinSquad"));
            }
        } catch (err) {
            logger.error({ err, squadId }, "Squad detail: failed to join squad");
            alert(t("errorJoinSquad"));
        } finally {
            setJoining(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-dvh bg-[#0A0A0C] text-white flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
            </div>
        );
    }

    if (!squad) {
        return (
            <div className="min-h-dvh bg-[#0A0A0C] text-white p-6 text-center">
                <p>{t("notFound")}</p>
                <button onClick={() => router.push("/squad")} className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-sm">
                    {t("backToSquads")}
                </button>
            </div>
        );
    }

    const isCompleted = squad.status === "completed" || squad.current_members >= squad.required_members;
    const isExpired = squad.status === "expired" || timeLeft === t("expired");

    return (
        <div className="min-h-dvh bg-[#0A0A0C] text-white pb-32">
            {/* Header */}
            <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0A0A0C]/90 px-4 py-3 backdrop-blur-xl">
                <div className="mx-auto flex max-w-lg items-center justify-between">
                    <button
                        type="button"
                        onClick={() => router.push("/squad")}
                        className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition active:scale-95"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <span className="text-sm font-black tracking-tight">{t("detailTitle")}</span>
                    <button
                        type="button"
                        onClick={copyLink}
                        className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition active:scale-95"
                    >
                        {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                    </button>
                </div>
            </header>

            <main className="mx-auto max-w-lg px-4 pt-5">
                {/* Product Card Highlight */}
                <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 mb-5">
                    <div className="flex gap-4 items-center">
                        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-black/40 border border-white/10">
                            {squad.product_image ? (
                                <Image src={squad.product_image} alt="" fill sizes="112px" className="object-cover" />
                            ) : (
                                <div className="grid h-full place-items-center"><Users size={28} /></div>
                            )}
                            <span className="absolute left-1.5 top-1.5 rounded-lg bg-fuchsia-600 px-2 py-0.5 text-[10px] font-black text-white">
                                {t("pctOff", { pct: SQUAD_DISCOUNT_PCT })}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-fuchsia-400 mb-1">
                                <Sparkles size={12} /> {t("groupDiscount")}
                            </span>
                            <h2 className="line-clamp-2 text-sm font-bold text-white mb-2">{squad.product_title || t("productFallback")}</h2>
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-black text-white">{formatLei(squad.squad_price_cents)}</span>
                                <span className="text-xs text-white/40 line-through">{formatLei(squad.regular_price_cents)}</span>
                            </div>
                            <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">{t("savePerPerson", { amount: formatLei(squad.regular_price_cents - squad.squad_price_cents) })}</p>
                        </div>
                    </div>
                </div>

                {/* Squad Status & Avatars */}
                <div className="rounded-3xl border border-fuchsia-500/30 bg-gradient-to-b from-fuchsia-950/40 to-white/5 p-6 text-center mb-6">
                    {isCompleted ? (
                        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-black text-emerald-400 border border-emerald-500/30 mb-4">
                            <CheckCircle2 size={16} /> {t("squadCompletedSuccess")}
                        </div>
                    ) : isExpired ? (
                        <div className="inline-flex items-center gap-2 rounded-full bg-red-500/20 px-4 py-1.5 text-xs font-black text-red-400 border border-red-500/30 mb-4">
                            {t("timeExpired")}
                        </div>
                    ) : (
                        <div className="inline-flex items-center gap-2 rounded-full bg-fuchsia-500/20 px-4 py-1.5 text-xs font-black text-fuchsia-300 border border-fuchsia-500/40 mb-4">
                            <Clock size={14} className="text-amber-400" /> {t("expiresIn")}: <span className="font-mono text-white text-sm">{timeLeft}</span>
                        </div>
                    )}

                    <h3 className="text-lg font-black text-white mb-6">
                        {isCompleted
                            ? t("ordersConfirmed")
                            : t("needsOnePersonToUnlock")}
                    </h3>

                    {/* 2 Avatars Slots */}
                    <div className="flex items-center justify-center gap-6 mb-6">
                        {/* Member 1 (Creator) */}
                        <div className="flex flex-col items-center">
                            <div className="relative h-16 w-16 rounded-full border-2 border-fuchsia-500 bg-gradient-to-br from-fuchsia-600 to-violet-600 grid place-items-center shadow-lg shadow-fuchsia-500/40">
                                <span className="text-xl font-black text-white">{squad.creator_name.charAt(0).toUpperCase()}</span>
                                <span className="absolute -bottom-1 -right-1 rounded-full bg-fuchsia-500 px-1.5 py-0.2 text-[9px] font-black text-white">
                                    {t("leader")}
                                </span>
                            </div>
                            <span className="mt-2 text-xs font-bold text-white truncate max-w-[90px]">{squad.creator_name}</span>
                        </div>

                        {/* Member 2 (Friend / Slot) */}
                        <div className="flex flex-col items-center">
                            {members.length > 1 ? (
                                <div className="relative h-16 w-16 rounded-full border-2 border-emerald-500 bg-gradient-to-br from-emerald-600 to-teal-600 grid place-items-center shadow-lg shadow-emerald-500/40">
                                    <span className="text-xl font-black text-white">{members[1].user_name.charAt(0).toUpperCase()}</span>
                                    <span className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 p-0.5 text-white">
                                        <CheckCircle2 size={12} />
                                    </span>
                                </div>
                            ) : (
                                <div className="h-16 w-16 rounded-full border-2 border-dashed border-white/30 grid place-items-center text-white/40 animate-pulse bg-white/5">
                                    <span className="text-2xl font-black">?</span>
                                </div>
                            )}
                            <span className="mt-2 text-xs font-bold text-white/70">
                                {members.length > 1 ? members[1].user_name : t("emptySpot")}
                            </span>
                        </div>
                    </div>

                    <p className="text-xs text-white/60 max-w-xs mx-auto">
                        {t("bothSpotsHint", { price: formatLei(squad.squad_price_cents) })}
                    </p>
                </div>

                {/* Viral CTA Buttons */}
                {!isCompleted && !isExpired && (
                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={shareWhatsApp}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] py-4 text-sm font-black text-white shadow-xl shadow-emerald-600/30 transition active:scale-[0.98]"
                        >
                            <Share2 size={18} /> {t("inviteFriendWhatsapp", { pct: SQUAD_DISCOUNT_PCT })}
                        </button>

                        <button
                            type="button"
                            disabled={joining}
                            onClick={joinSquad}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 py-3.5 text-sm font-black text-white shadow-lg transition active:scale-[0.98] disabled:opacity-50"
                        >
                            {joining ? t("joining") : t("joinAtDiscountedPrice")}
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
