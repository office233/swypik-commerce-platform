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
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { haptic } from "@/lib/haptic";

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

const VERTICALS = [
    { id: "food", brand: "Swypik Food", emoji: "🍔", href: "/food", accent: "#2DBE60" },
    { id: "fly", brand: "Swypik Fly", emoji: "✈️", href: "/fly", accent: "#1D4ED8" },
    { id: "go", brand: "Swypik Go", emoji: "🚕", href: "/go", accent: "#F59E0B" },
] as const;

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

    const verticalItems = VERTICALS.map((v) => ({
        ...v,
        label: tv(`${v.id === "food" ? "eats" : v.id}.label`),
    }));

    if (!mounted || !open) return null;

    return createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
            <button
                type="button"
                aria-label={t("close")}
                className="absolute inset-0 bg-black/40"
                onClick={() => onOpenChange(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
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
                <div className="flex-1 overflow-y-auto p-3">
                    <p className="px-3 pb-1 text-[11px] font-extrabold uppercase tracking-widest text-[#A1A1AA]">Swypik</p>
                    {verticalItems.map((v) => (
                        <button
                            key={v.id}
                            type="button"
                            onClick={() => goVertical(v.href)}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-bold text-[#0D0D0D] transition hover:bg-[#F7F7F8]"
                        >
                            <span
                                className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                                style={{ backgroundColor: `${v.accent}22` }}
                            >
                                {v.emoji}
                            </span>
                            {v.brand}
                            <span className="ml-auto text-[11px] font-semibold text-[#A1A1AA]">{v.label}</span>
                        </button>
                    ))}

                    <div className="mx-3 my-2 h-px bg-black/10" aria-hidden />
                    <p className="px-3 pb-1 text-[11px] font-extrabold uppercase tracking-widest text-[#A1A1AA]">{t("categories")}</p>

                    <button
                        type="button"
                        onClick={() => pick(null)}
                        aria-pressed={!activeCategory}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-bold ${!activeCategory ? "bg-[#0D0D0D] text-white" : "text-[#0D0D0D] hover:bg-[#F7F7F8]"}`}
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
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-bold ${active ? "bg-violet-600 text-white" : "text-[#0D0D0D] hover:bg-[#F7F7F8]"}`}
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
        </div>,
        document.body
    );
}
