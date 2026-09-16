"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Users, ArrowLeft, Flame, Clock, Sparkles, Share2, ShieldCheck, ChevronRight } from "lucide-react";
import { haptic } from "@/lib/haptic";

interface SquadItem {
    id: string;
    product_id: string;
    creator_name: string;
    creator_avatar: string | null;
    required_members: number;
    current_members: number;
    squad_price_cents: number;
    regular_price_cents: number;
    currency: string;
    status: string;
    expires_at: string;
    product_title?: string;
    product_image?: string;
}

export default function SquadClient() {
    const router = useRouter();
    const [squads, setSquads] = useState<SquadItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/squad")
            .then((r) => r.json())
            .then((d) => {
                if (d.success) setSquads(d.squads || []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const formatLei = (cents: number) => (cents / 100).toFixed(2) + " lei";

    return (
        <div className="min-h-dvh bg-[#0A0A0C] text-white pb-28">
            {/* Header */}
            <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0A0A0C]/90 px-4 py-3 backdrop-blur-xl">
                <div className="mx-auto flex max-w-lg items-center justify-between">
                    <button
                        type="button"
                        onClick={() => router.push("/")}
                        className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition active:scale-95"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-violet-600 shadow-lg shadow-fuchsia-500/30">
                            <Users size={18} className="text-white" />
                        </div>
                        <h1 className="text-lg font-black tracking-tight">Swypik Squad</h1>
                    </div>
                    <span className="rounded-full bg-fuchsia-500/20 px-2.5 py-1 text-xs font-black text-fuchsia-400 border border-fuchsia-500/30">
                        -30% OFF
                    </span>
                </div>
            </header>

            <main className="mx-auto max-w-lg px-4 pt-5">
                {/* Hero Banner Viral */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-fuchsia-900/60 via-violet-950/60 to-black p-6 border border-fuchsia-500/30 shadow-2xl mb-6">
                    <div className="relative z-10">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/20 px-3 py-1 text-xs font-black text-fuchsia-300 border border-fuchsia-500/40 mb-3">
                            <Sparkles size={13} /> Cumperi în 2, economisiți amândoi
                        </span>
                        <h2 className="text-2xl font-black leading-tight text-white mb-2">
                            Nu plăti prețul întreg niciodată.
                        </h2>
                        <p className="text-xs text-white/70 leading-relaxed max-w-xs mb-4">
                            Intră într-un Squad deschis sau creează-ți propriul grup de cumpărături. Trimite linkul unui prieten și comanda se confirmă la preț redus!
                        </p>
                        <div className="flex items-center gap-4 text-[11px] font-semibold text-white/60">
                            <span className="flex items-center gap-1"><ShieldCheck size={14} className="text-emerald-400" /> Banii reținuți în siguranță</span>
                            <span className="flex items-center gap-1"><Clock size={14} className="text-amber-400" /> Fereastră 24h</span>
                        </div>
                    </div>
                    <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-fuchsia-600/20 rounded-full blur-3xl pointer-events-none" />
                </div>

                {/* Squad List */}
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-wider text-white/90 flex items-center gap-2">
                        <Flame size={16} className="text-fuchsia-400" /> Squad-uri Live (Locuri Libere)
                    </h3>
                    <span className="text-xs text-white/50">{squads.length} active</span>
                </div>

                {loading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse border border-white/5" />
                        ))}
                    </div>
                ) : squads.length === 0 ? (
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center my-6">
                        <Users size={40} className="mx-auto mb-3 text-fuchsia-400 opacity-60" />
                        <h4 className="text-base font-bold text-white mb-1">Nu există Squad-uri active chiar acum</h4>
                        <p className="text-xs text-white/60 mb-5">
                            Fii primul care pornește un Squad! Alege un produs din Shop și dă click pe „Cumpără în Squad”.
                        </p>
                        <button
                            type="button"
                            onClick={() => router.push("/")}
                            className="h-11 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-6 text-xs font-black text-white shadow-lg active:scale-95 transition-transform"
                        >
                            Explorează Produse
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {squads.map((s) => (
                            <div
                                key={s.id}
                                onClick={() => {
                                    haptic("tap");
                                    router.push(`/squad/${s.id}`);
                                }}
                                className="group relative flex gap-3.5 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3.5 transition active:scale-[0.98] hover:border-fuchsia-500/40 hover:bg-white/[0.07] cursor-pointer"
                            >
                                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-black/40 border border-white/10">
                                    {s.product_image ? (
                                        <Image src={s.product_image} alt="" fill sizes="96px" className="object-cover" />
                                    ) : (
                                        <div className="grid h-full place-items-center text-white/30"><Users size={24} /></div>
                                    )}
                                    <span className="absolute left-1 top-1 rounded-md bg-fuchsia-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                                        -30%
                                    </span>
                                </div>

                                <div className="min-w-0 flex-1 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-fuchsia-400 mb-0.5">
                                            <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
                                            Inițiat de {s.creator_name}
                                        </div>
                                        <h4 className="line-clamp-1 text-sm font-bold text-white">{s.product_title || "Produs Swypik"}</h4>
                                    </div>

                                    <div className="flex items-end justify-between gap-2 mt-2">
                                        <div>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-base font-black text-white">{formatLei(s.squad_price_cents)}</span>
                                                <span className="text-[11px] text-white/40 line-through">{formatLei(s.regular_price_cents)}</span>
                                            </div>
                                            <p className="text-[10px] text-emerald-400 font-semibold">Mai e nevoie de 1 prieten</p>
                                        </div>

                                        <button
                                            type="button"
                                            className="inline-flex h-9 items-center gap-1 rounded-xl bg-fuchsia-600 px-3.5 text-xs font-black text-white shadow active:scale-95 transition-transform"
                                        >
                                            Intră <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
