"use client";

/**
 * CategorySidebar — drawer de categorii, stil Facebook, ultra curat.
 *
 * Secțiunea 1: verticalele funcționale (Fly, Food, Go) — navighează.
 * Secțiunea 2: categoriile marketplace — filtrează feed-ul.
 *
 * NU e vizibil permanent: se deschide doar din butonul ☰ de lângă
 * logo-ul „Swypik" din header (controlat prin props open/onOpenChange).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { haptic } from "@/lib/haptic";
import { VERTICAL_CATALOG as VERTICALS } from "@/lib/verticals/catalog";

export type CategoryNode = {
    id?: string | number;
    name: string;
    tag?: string;
    slug?: string;
    children?: CategoryNode[];
};

type Props = {
    categories: CategoryNode[];
    /** Slug-ul taxonomiei active (id-ul nodului). */
    activeCategory: string | null;
    onSelectCategory: (slug: string | null) => void;
    /** Drawer controlat din exterior (butonul ☰ de lângă logo). */
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

function nodeSlug(c: CategoryNode): string {
    return String(c.tag ?? c.slug ?? c.id ?? c.name);
}

/**
 * DOAR verticalele funcționale — cu pagină dedicată și flux complet
 * (căutare/comandă/plată). Restul catalogului (28 de verticale) merge pe
 * feed generic /v/<id>, care e momentan GOL (0 produse, 0 video-uri
 * publicate) — nu le expunem ca să nu ducem userul în pagini fără conținut.
 *
 * Cum activezi una nouă: adaug-o aici DOAR după ce are pagină proprie
 * funcțională sau conținut real în feed.
 */
const LIVE_VERTICALS: { id: string; href: string; note: string }[] = [
    { id: "eats", href: "/food", note: "Mâncare" },
    { id: "fly", href: "/fly", note: "Zboruri" },
    { id: "stays", href: "/stays", note: "Cazări" },
    { id: "go", href: "/go", note: "Transport" },
    { id: "pay", href: "/pay", note: "Moneda SWYP" },
];

/** Emoji fallback pe categorii marketplace frecvente. */
function categoryEmoji(name: string): string {
    const n = name.toLowerCase();
    if (/(elect|tech|phone|laptop)/.test(n)) return "📱";
    if (/(fashion|moda|imbrac|haine)/.test(n)) return "👕";
    if (/(home|casa|garden|gradin)/.test(n)) return "🏠";
    if (/(beauty|frumus|cosmet)/.test(n)) return "💄";
    if (/(sport|fitness)/.test(n)) return "⚽";
    if (/(kid|copii|toy|jucar)/.test(n)) return "🧸";
    if (/(auto|car|masin)/.test(n)) return "🚗";
    if (/(pet|animal)/.test(n)) return "🐾";
    if (/(book|carte|carti)/.test(n)) return "📚";
    if (/(jewel|bijut|watch|ceas)/.test(n)) return "⌚";
    return "🏷️";
}

export default function CategorySidebar({ categories, activeCategory, onSelectCategory, open, onOpenChange }: Props) {
    const t = useTranslations("homeFeed");
    const tv = useTranslations("verticals");
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [open, onOpenChange]);

    const goVertical = (href: string) => {
        haptic("tap");
        onOpenChange(false);
        router.push(href);
    };

    const pick = (slug: string | null) => {
        haptic("tap");
        onOpenChange(false);
        onSelectCategory(slug);
    };

    /** Serviciile active — datele vin din catalog, lista din LIVE_VERTICALS. */
    const verticalItems = LIVE_VERTICALS.flatMap((lv) => {
        const v = VERTICALS.find((x) => x.id === lv.id);
        if (!v) return [];
        return [{
            id: v.id,
            brand: v.brand,
            emoji: v.emoji,
            accent: v.accent,
            href: lv.href,
            label: lv.note,
        }];
    });

    if (!mounted || !open) return null;

    return createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
            <button
                type="button"
                aria-label={t("close")}
                className="absolute inset-0 bg-black/40"
                onClick={() => onOpenChange(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-[#FAFAFB] shadow-2xl">
                <div className="flex items-center justify-between border-b border-black/5 bg-white px-4 py-3">
                    <p className="text-[16px] font-extrabold text-[#0D0D0D]">{t("allCategories")}</p>
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="rounded-full p-1.5 hover:bg-[#F0F0F2]"
                        aria-label={t("close")}
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    <p className="pb-2 text-[11px] font-extrabold uppercase tracking-widest text-[#A1A1AA]">Serviciile Swypik</p>
                    <div className="space-y-2.5">
                        {verticalItems.map((v) => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => goVertical(v.href)}
                                className="group flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
                            >
                                <span
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
                                    style={{ backgroundColor: `${v.accent}1A` }}
                                >
                                    {v.emoji}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] font-extrabold text-[#0D0D0D]">{v.brand}</span>
                                    <span className="block text-[12px] font-semibold text-[#6E6E80]">{v.label}</span>
                                </span>
                                <ChevronRight size={18} className="shrink-0 transition group-hover:translate-x-0.5" style={{ color: v.accent }} />
                            </button>
                        ))}
                    </div>

                    <p className="pb-2 pt-6 text-[11px] font-extrabold uppercase tracking-widest text-[#A1A1AA]">{t("categories")}</p>

                    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                        <button
                            type="button"
                            onClick={() => pick(null)}
                            aria-pressed={!activeCategory}
                            className={`flex w-full items-center gap-3 border-b border-black/5 px-3.5 py-3 text-left text-[14px] font-bold last:border-0 ${!activeCategory ? "bg-[#0D0D0D] text-white" : "text-[#0D0D0D] hover:bg-[#F7F7F8]"}`}
                        >
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-lg">✨</span>
                            {t("all")}
                        </button>
                        {categories.map((c) => {
                            const active = activeCategory === nodeSlug(c);
                            return (
                                <button
                                    key={String(c.id ?? c.name)}
                                    type="button"
                                    onClick={() => pick(active ? null : nodeSlug(c))}
                                    aria-pressed={active}
                                    className={`flex w-full items-center gap-3 border-b border-black/5 px-3.5 py-3 text-left text-[14px] font-bold last:border-0 ${active ? "bg-violet-600 text-white" : "text-[#0D0D0D] hover:bg-[#F7F7F8]"}`}
                                >
                                    <span className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${active ? "bg-white/20" : "bg-black/5"}`}>
                                        {categoryEmoji(c.name)}
                                    </span>
                                    <span className="truncate">{c.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
