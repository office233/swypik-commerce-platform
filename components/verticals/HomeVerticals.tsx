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
        // Verticalele cu experiență dedicată au ruta lor proprie.
        if (id === "go") {
            router.push("/go");
            return;
        }
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
                        className="group relative flex min-h-[156px] flex-col justify-between overflow-hidden rounded-[28px] p-4 text-left shadow-xl shadow-black/15 transition duration-200 hover:-translate-y-0.5 active:scale-[0.97]"
                        style={{
                            backgroundImage: `linear-gradient(135deg, ${v.accent} 0%, ${GRADIENT_TO[v.id] ?? v.accent} 100%)`,
                        }}
                    >
                        <span
                            className="pointer-events-none absolute -bottom-6 -right-5 select-none text-[7rem] leading-none opacity-20 transition duration-300 group-hover:scale-105 group-active:scale-110"
                            aria-hidden
                        >
                            {v.emoji}
                        </span>
                        <span
                            className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent"
                            aria-hidden
                        />

                        <span className="relative inline-flex w-fit items-center rounded-full bg-white/25 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-white backdrop-blur-sm">
                            {th(`hooks.${v.id}`)}
                        </span>

                        <span className="relative">
                            <span className="block text-[22px] font-extrabold leading-none tracking-tight text-white drop-shadow">
                                {v.brand}
                            </span>
                            <span className="mt-1.5 block text-[12px] font-semibold text-white/85">
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
                        <h3 className="mb-3 px-0.5 text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#6E6E80]">
                            {th(`groups.${g}`)}
                        </h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                            {items.map((v) => (
                                <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => go(v.id)}
                                    className="group relative flex min-h-[92px] items-center gap-3 overflow-hidden rounded-2xl border border-black/5 bg-white p-3 shadow-sm transition duration-200 hover:shadow-md active:scale-[0.97]"
                                >
                                    {/* dâră de culoare pe margine — identitate fără zgomot */}
                                    <span
                                        className="absolute inset-y-0 left-0 w-1.5"
                                        style={{ backgroundColor: v.accent }}
                                        aria-hidden
                                    />
                                    <span
                                        className="ml-1 grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[28px] transition duration-200 group-hover:scale-105 group-active:scale-95"
                                        style={{ backgroundColor: `${v.accent}1A` }}
                                        aria-hidden
                                    >
                                        {v.emoji}
                                    </span>
                                    <span className="min-w-0 flex-1 text-left">
                                        <span className="block truncate text-[15px] font-extrabold leading-tight tracking-tight text-[#0D0D0D]">
                                            {v.brand.replace("Swypik ", "")}
                                        </span>
                                        <span className="mt-0.5 block truncate text-[11px] font-semibold leading-tight text-[#8E8EA0]">
                                            {t(`${v.labelKey}.label`)}
                                        </span>
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
