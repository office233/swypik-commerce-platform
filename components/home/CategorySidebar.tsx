"use client";

/**
 * CategorySidebar — stânga home, stil Facebook, ultra curat.
 *
 * Secțiunea 1: verticalele funcționale (Fly, Food, Go) — navighează.
 * Secțiunea 2: categoriile marketplace — filtrează feed-ul.
 *
 * Mobil (<lg): rail îngust de 64px cu iconițe + drawer complet la ☰.
 * Desktop (lg+): sidebar de 240px permanent.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
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
};

function nodeSlug(c: CategoryNode): string {
    return String(c.tag ?? c.slug ?? c.id ?? c.name);
}

const VERTICALS = [
    { id: "food", emoji: "🍔", href: "/food", accent: "#2DBE60" },
    { id: "fly", emoji: "✈️", href: "/fly", accent: "#1D4ED8" },
    { id: "go", emoji: "🚕", href: "/go", accent: "#F59E0B" },
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

export default function CategorySidebar({ categories, activeCategory, onSelectCategory }: Props) {
    const t = useTranslations("homeFeed");
    const tv = useTranslations("verticals");
    const router = useRouter();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);
    useEffect(() => {
        if (!drawerOpen) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [drawerOpen]);

    const goVertical = (href: string) => {
        haptic("tap");
        setDrawerOpen(false);
        router.push(href);
    };

    const pick = (name: string | null) => {
        haptic("tap");
        setDrawerOpen(false);
        onSelectCategory(name);
    };

    const verticalItems = VERTICALS.map((v) => ({
        ...v,
        label: tv(`${v.id === "food" ? "eats" : v.id}.label`),
    }));

    return (
        <>
            {/* ── Rail mobil (64px) ─────────────────────────────── */}
            <nav
                className="sticky top-2 flex max-h-[calc(100dvh-100px)] w-16 shrink-0 flex-col items-center gap-1 overflow-y-auto pb-4 [scrollbar-width:none] lg:hidden"
                aria-label={t("categories")}
            >
                <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5 active:scale-95"
                    aria-label={t("allCategories")}
                >
                    <Menu size={20} className="text-[#0D0D0D]" />
                </button>

                {verticalItems.map((v) => (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => goVertical(v.href)}
                        className="flex w-14 flex-col items-center gap-0.5 rounded-2xl py-1.5 active:scale-95"
                        aria-label={v.label}
                    >
                        <span
                            className="flex h-10 w-10 items-center justify-center rounded-full text-lg shadow-sm"
                            style={{ backgroundColor: `${v.accent}22` }}
                        >
                            {v.emoji}
                        </span>
                        <span className="w-full truncate text-center text-[9px] font-bold text-[#6E6E80]">{v.label}</span>
                    </button>
                ))}

                <div className="my-1 h-px w-8 bg-black/10" aria-hidden />

                <button
                    type="button"
                    onClick={() => pick(null)}
                    aria-pressed={!activeCategory}
                    className="flex w-14 flex-col items-center gap-0.5 rounded-2xl py-1.5 active:scale-95"
                >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${!activeCategory ? "bg-[#0D0D0D] text-white" : "bg-white shadow-sm ring-1 ring-black/5"}`}>
                        ✨
                    </span>
                    <span className={`w-full truncate text-center text-[9px] font-bold ${!activeCategory ? "text-[#0D0D0D]" : "text-[#6E6E80]"}`}>{t("all")}</span>
                </button>

                {categories.map((c) => {
                    const active = activeCategory === nodeSlug(c);
                    return (
                        <button
                            key={String(c.id ?? c.name)}
                            type="button"
                            onClick={() => pick(active ? null : nodeSlug(c))}
                            aria-pressed={active}
                            className="flex w-14 flex-col items-center gap-0.5 rounded-2xl py-1.5 active:scale-95"
                        >
                            <span className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${active ? "bg-violet-600" : "bg-white shadow-sm ring-1 ring-black/5"}`}>
                                {categoryEmoji(c.name)}
                            </span>
                            <span className={`w-full truncate text-center text-[9px] font-bold ${active ? "text-violet-600" : "text-[#6E6E80]"}`}>
                                {c.name}
                            </span>
                        </button>
                    );
                })}
            </nav>

            {/* ── Sidebar desktop (240px) ───────────────────────── */}
            <nav
                className="sticky top-4 hidden max-h-[calc(100dvh-120px)] w-60 shrink-0 flex-col gap-1 overflow-y-auto pb-4 lg:flex"
                aria-label={t("categories")}
            >
                <p className="px-3 pb-1 text-[11px] font-extrabold uppercase tracking-widest text-[#A1A1AA]">Swypik</p>
                {verticalItems.map((v) => (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => goVertical(v.href)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-bold text-[#0D0D0D] transition hover:bg-white"
                    >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full text-base" style={{ backgroundColor: `${v.accent}22` }}>
                            {v.emoji}
                        </span>
                        {v.label}
                    </button>
                ))}

                <div className="mx-3 my-2 h-px bg-black/10" aria-hidden />
                <p className="px-3 pb-1 text-[11px] font-extrabold uppercase tracking-widest text-[#A1A1AA]">{t("categories")}</p>

                <button
                    type="button"
                    onClick={() => pick(null)}
                    aria-pressed={!activeCategory}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-bold transition ${!activeCategory ? "bg-[#0D0D0D] text-white" : "text-[#0D0D0D] hover:bg-white"}`}
                >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-base">✨</span>
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
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-bold transition ${active ? "bg-violet-600 text-white" : "text-[#0D0D0D] hover:bg-white"}`}
                        >
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-base">{categoryEmoji(c.name)}</span>
                            <span className="truncate">{c.name}</span>
                        </button>
                    );
                })}
            </nav>

            {/* ── Drawer mobil complet ──────────────────────────── */}
            {mounted && drawerOpen && createPortal(
                <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
                    <button type="button" aria-label={t("close")} className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
                    <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                            <p className="text-[16px] font-extrabold text-[#0D0D0D]">{t("allCategories")}</p>
                            <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-full p-1.5 hover:bg-[#F0F0F2]" aria-label={t("close")}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            {verticalItems.map((v) => (
                                <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => goVertical(v.href)}
                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-bold text-[#0D0D0D] transition hover:bg-[#F7F7F8]"
                                >
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg" style={{ backgroundColor: `${v.accent}22` }}>
                                        {v.emoji}
                                    </span>
                                    Swypik {v.id === "food" ? "Food" : v.id === "fly" ? "Fly" : "Go"}
                                    <span className="ml-auto text-[11px] font-semibold text-[#A1A1AA]">{v.label}</span>
                                </button>
                            ))}
                            <div className="mx-3 my-2 h-px bg-black/10" aria-hidden />
                            <button
                                type="button"
                                onClick={() => pick(null)}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-bold ${!activeCategory ? "bg-[#0D0D0D] text-white" : "text-[#0D0D0D] hover:bg-[#F7F7F8]"}`}
                            >
                                ✨ {t("all")}
                            </button>
                            {categories.map((c) => {
                                const active = activeCategory === nodeSlug(c);
                                return (
                                    <button
                                        key={String(c.id ?? c.name)}
                                        type="button"
                                        onClick={() => pick(active ? null : nodeSlug(c))}
                                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-bold ${active ? "bg-violet-600 text-white" : "text-[#0D0D0D] hover:bg-[#F7F7F8]"}`}
                                    >
                                        {categoryEmoji(c.name)} <span className="truncate">{c.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
