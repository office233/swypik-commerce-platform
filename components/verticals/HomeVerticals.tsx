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
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { haptic } from "@/lib/haptic";
import { liveVerticals, type Vertical } from "@/lib/verticals/catalog";

/** Cardurile mari, în ordinea impactului comercial. */
const HERO_IDS = ["eats", "shop", "estates", "auto"];

/** Ordinea grupelor sub eroi. */
const GROUP_ORDER = ["local", "shop", "travel", "property", "services", "mobility", "work", "social"] as const;

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

    const all = liveVerticals(1);
    const byId = (id: string) => all.find((v) => v.id === id);

    const heroes = HERO_IDS.map(byId).filter(Boolean) as Vertical[];
    // TOATE celelalte, mereu vizibile — zero butoane ascunse, doar scroll.
    const rest = all.filter((v) => !HERO_IDS.includes(v.id));

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

            {/* ── GRUPE: aerisit, cu titlu — creierul procesează 4-6 iconițe, nu 28 ── */}
            {GROUP_ORDER.map((g) => {
                const items = rest.filter((v) => v.group === g);
                if (!items.length) return null;
                return (
                    <div key={g} className="mt-6">
                        <h3 className="mb-2.5 px-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#9A9AA8]">
                            {th(`groups.${g}`)}
                        </h3>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                            {items.map((v) => (
                                <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => go(v.id)}
                                    className="group flex flex-col items-center gap-1.5 rounded-xl py-1.5 transition active:scale-95"
                                >
                                    <span
                                        className="grid h-14 w-14 place-items-center rounded-2xl text-2xl shadow-sm transition group-active:scale-90"
                                        style={{ backgroundColor: `${v.accent}1A`, boxShadow: `inset 0 0 0 1.5px ${v.accent}33` }}
                                        aria-hidden
                                    >
                                        {v.emoji}
                                    </span>
                                    <span className="text-center text-[10px] font-bold leading-tight text-[#0D0D0D]">
                                        {v.brand.replace("Swypik ", "")}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}
