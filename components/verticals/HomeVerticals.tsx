"use client";

/**
 * HomeVerticals — vitrina principală a homepage-ului.
 *
 * Brandul e eroul: pe card scrie mare „Swypik Food”, nu „Mâncare”.
 * Traducerea rămâne ca subtitlu discret, pentru claritate locală.
 *
 * Psihologia culorilor (de ce dai click):
 *   • gradient diagonal → adâncime, senzație de card fizic pe care apeși
 *   • emoji uriaș semi-transparent → recunoaștere instantă, fără citit
 *   • badge cu cârlig → urgență/beneficiu, cel mai puternic declanșator
 *   • target tactil ≥ 132px pe eroi, ≥ 104px pe restul
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { liveVerticals, type Vertical } from "@/lib/verticals/catalog";

/** Cardurile mari, în ordinea impactului comercial. */
const HERO_IDS = ["eats", "shop", "estates", "auto"];

/** Verticalele afișate compact sub eroi (înainte de „vezi toate”). */
const POPULAR_IDS = ["home", "build", "farm", "stays", "pro", "go"];

/** A doua culoare a gradientului — mai închisă, pentru adâncime. */
const GRADIENT_TO: Record<string, string> = {
    eats: "#15803D",
    shop: "#4C1D95",
    estates: "#1E3A8A",
    auto: "#7F1D1D",
};

export default function HomeVerticals({ className = "" }: { className?: string }) {
    const t = useTranslations("verticals");
    const th = useTranslations("home");
    const router = useRouter();
    const [expanded, setExpanded] = useState(false);

    const all = liveVerticals(1);
    const byId = (id: string) => all.find((v) => v.id === id);

    const heroes = HERO_IDS.map(byId).filter(Boolean) as Vertical[];
    const popular = POPULAR_IDS.map(byId).filter(Boolean) as Vertical[];
    const others = all.filter((v) => !HERO_IDS.includes(v.id) && !POPULAR_IDS.includes(v.id));
    const compact = expanded ? [...popular, ...others] : popular;

    const go = (id: string) => {
        haptic("tap");
        router.push(`/v/${id}`);
    };

    return (
        <section className={className} aria-label={t("railLabel")}>
            {/* ── EROII ── */}
            <div className="grid grid-cols-2 gap-3">
                {heroes.map((v) => (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => go(v.id)}
                        className="group relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-3xl p-4 text-left shadow-lg shadow-black/10 transition duration-200 active:scale-[0.97]"
                        style={{
                            backgroundImage: `linear-gradient(135deg, ${v.accent} 0%, ${GRADIENT_TO[v.id] ?? v.accent} 100%)`,
                        }}
                    >
                        <span
                            className="pointer-events-none absolute -bottom-5 -right-4 select-none text-[5.5rem] leading-none opacity-20 transition duration-300 group-active:scale-110"
                            aria-hidden
                        >
                            {v.emoji}
                        </span>
                        <span
                            className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent"
                            aria-hidden
                        />

                        <span className="relative inline-flex w-fit items-center rounded-full bg-white/25 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
                            {th(`hooks.${v.id}`)}
                        </span>

                        <span className="relative">
                            {/* BRANDUL e titlul */}
                            <span className="block text-[17px] font-black leading-none text-white drop-shadow-sm">
                                {v.brand}
                            </span>
                            <span className="mt-1 block text-[11px] font-bold text-white/85">
                                {t(`${v.labelKey}.label`)}
                            </span>
                        </span>
                    </button>
                ))}
            </div>

            {/* ── COMPACT ── */}
            <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                {compact.map((v) => (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => go(v.id)}
                        className="group flex min-h-[104px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-[#E5E5E5] bg-white p-2 transition duration-150 active:scale-95"
                        style={{ borderTopColor: v.accent, borderTopWidth: 3 }}
                    >
                        <span
                            className="grid h-12 w-12 place-items-center rounded-2xl text-2xl transition group-active:scale-90"
                            style={{ backgroundColor: `${v.accent}1F` }}
                            aria-hidden
                        >
                            {v.emoji}
                        </span>
                        {/* „Swypik Food” → afișăm „Food” mare + traducerea mică */}
                        <span className="text-center text-[12px] font-black leading-none text-[#0D0D0D]">
                            {v.brand.replace("Swypik ", "")}
                        </span>
                        <span className="text-center text-[9px] font-semibold leading-tight text-[#9A9AA8]">
                            {t(`${v.labelKey}.label`)}
                        </span>
                    </button>
                ))}
            </div>

            {others.length > 0 && (
                <button
                    type="button"
                    onClick={() => {
                        haptic("tap");
                        setExpanded((e) => !e);
                    }}
                    aria-expanded={expanded}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#F7F7F8] py-3.5 text-xs font-black text-[#0D0D0D] transition active:scale-95"
                >
                    {expanded ? t("showLess") : t("showAll")}
                    <ChevronDown size={15} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
            )}
        </section>
    );
}
