"use client";

/**
 * VerticalGrid — punctul principal de acces la verticale, pe homepage.
 *
 * Carduri mari, tap-friendly (min 88px înălțime), 3 pe rând pe mobil.
 * Fără scroll orizontal ascuns: tot ce e important se vede din prima.
 * Verticalele secundare se dezvăluie la „Vezi tot”.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { liveVerticals } from "@/lib/verticals/catalog";

/** Câte se arată înainte de „Vezi tot” (2 rânduri pe mobil). */
const PRIMARY_COUNT = 6;

export default function VerticalGrid({ className = "" }: { className?: string }) {
    const t = useTranslations("verticals");
    const router = useRouter();
    const [expanded, setExpanded] = useState(false);

    const all = liveVerticals(1);
    const shown = expanded ? all : all.slice(0, PRIMARY_COUNT);

    const go = (id: string) => {
        haptic("tap");
        router.push(`/v/${id}`);
    };

    return (
        <section className={className} aria-label={t("railLabel")}>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                {shown.map((v) => (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => go(v.id)}
                        className="group flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-[#E5E5E5] bg-white p-2 transition active:scale-95"
                    >
                        <span
                            className="grid h-11 w-11 place-items-center rounded-xl text-xl transition group-active:scale-90"
                            style={{ backgroundColor: `${v.accent}1A` }}
                            aria-hidden
                        >
                            {v.emoji}
                        </span>
                        <span className="text-center text-[11px] font-bold leading-tight text-[#0D0D0D]">
                            {t(`${v.labelKey}.label`)}
                        </span>
                    </button>
                ))}
            </div>

            {all.length > PRIMARY_COUNT && (
                <button
                    type="button"
                    onClick={() => {
                        haptic("tap");
                        setExpanded((e) => !e);
                    }}
                    aria-expanded={expanded}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#F7F7F8] py-2.5 text-xs font-bold text-[#6E6E80] transition active:scale-95"
                >
                    {expanded ? t("showLess") : t("showAll")}
                    <ChevronDown
                        size={14}
                        className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                </button>
            )}
        </section>
    );
}
