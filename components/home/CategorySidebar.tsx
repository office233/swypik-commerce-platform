"use client";

import { SUPPORT_EMAIL } from "@/lib/contact";

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
import {
    X,
    ChevronRight,
    Smartphone,
    Shirt,
    Home,
    Sparkles,
    Dumbbell,
    Baby,
    Car,
    PawPrint,
    BookOpen,
    Watch,
    Tag,
    UtensilsCrossed,
    Plane,
    BedDouble,
    Coins,
    Users,
    Gift,
    HeartHandshake,
    Wallet,
    Store,
    type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { haptic } from "@/lib/haptic";
import LocaleQuickPicker from "@/components/i18n/LocaleQuickPicker";

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
 * Super-App Modules — toate cele 10 module active ale ecosistemului Swypik.
 * Fiecare modul are rută dedicată, icon, culori de brand și etichetă clară.
 */
export type SuperAppModule = {
    id: string;
    brand: string;
    label: string;
    badge?: string;
    badgeColor?: string;
    accent: string;
    Icon: LucideIcon;
    href?: string;
    isAction?: boolean;
};

const SUPERAPP_MODULES: SuperAppModule[] = [
    {
        id: "squad",
        brand: "Swypik Squad",
        label: "Cumpărături în grup -30%",
        badge: "-30%",
        badgeColor: "bg-fuchsia-600 text-white",
        accent: "#D946EF",
        Icon: Users,
        href: "/squad",
    },
    {
        id: "mystery",
        brand: "Mystery Drop",
        label: "Cutia Zilei • Cadou Gratuit",
        badge: "Cadou",
        badgeColor: "bg-amber-500 text-black",
        accent: "#F59E0B",
        Icon: Gift,
        isAction: true,
    },
    {
        id: "food",
        brand: "Swypik Food",
        label: "Restaurante & Livrare Rapidă",
        badge: "Eats",
        badgeColor: "bg-emerald-600 text-white",
        accent: "#10B981",
        Icon: UtensilsCrossed,
        href: "/food",
    },
    {
        id: "go",
        brand: "Swypik Go",
        label: "Curse Urbane & Transport",
        badge: "Ride",
        badgeColor: "bg-amber-500 text-black",
        accent: "#F59E0B",
        Icon: Car,
        href: "/go",
    },
    {
        id: "stays",
        brand: "Swypik Stays",
        label: "Cazări, Vile & Hoteluri",
        badge: "Hotel",
        badgeColor: "bg-teal-600 text-white",
        accent: "#0D9488",
        Icon: BedDouble,
        href: "/stays",
    },
    {
        id: "fly",
        brand: "Swypik Fly",
        label: "Bilete de Avion & Zboruri",
        badge: "Zbor",
        badgeColor: "bg-sky-600 text-white",
        accent: "#0284C7",
        Icon: Plane,
        href: "/fly",
    },
    {
        id: "cares",
        brand: "Swypik Cares",
        label: "Donații & Cauze Caritabile",
        badge: "0% Fee",
        badgeColor: "bg-rose-600 text-white",
        accent: "#E11D48",
        Icon: HeartHandshake,
        href: "/cares",
    },
    {
        id: "pay",
        brand: "SWYP Pay",
        label: "Portofel Digital (-10% Cashback)",
        badge: "-10%",
        badgeColor: "bg-indigo-600 text-white",
        accent: "#7C3AED",
        Icon: Wallet,
        href: "/pay",
    },
    {
        id: "seller",
        brand: "Portal Comercianți",
        label: "ERP Magazine, Ads & Squad",
        badge: "Business",
        badgeColor: "bg-violet-700 text-white",
        accent: "#6D28D9",
        Icon: Store,
        href: "/seller",
    },
    {
        id: "creator",
        brand: "Creator Studio",
        label: "Monetizare & Clipurile mele",
        badge: "Creator",
        badgeColor: "bg-pink-600 text-white",
        accent: "#EC4899",
        Icon: Sparkles,
        href: "/creator",
    },
];

/** Icon fallback pe categorii marketplace frecvente. */
function categoryIcon(name: string): LucideIcon {
    const n = name.toLowerCase();
    if (/(elect|tech|phone|laptop)/.test(n)) return Smartphone;
    if (/(fashion|moda|imbrac|haine)/.test(n)) return Shirt;
    if (/(home|casa|garden|gradin)/.test(n)) return Home;
    if (/(beauty|frumus|cosmet)/.test(n)) return Sparkles;
    if (/(sport|fitness)/.test(n)) return Dumbbell;
    if (/(kid|copii|toy|jucar)/.test(n)) return Baby;
    if (/(auto|car|masin)/.test(n)) return Car;
    if (/(pet|animal)/.test(n)) return PawPrint;
    if (/(book|carte|carti)/.test(n)) return BookOpen;
    if (/(jewel|bijut|watch|ceas)/.test(n)) return Watch;
    return Tag;
}

export default function CategorySidebar({ categories, activeCategory, onSelectCategory, open, onOpenChange }: Props) {
    const t = useTranslations("homeFeed");
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

    const handleModuleClick = (m: SuperAppModule) => {
        haptic("tap");
        onOpenChange(false);
        if (m.isAction && m.id === "mystery") {
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("open-mystery-drop"));
            }
            return;
        }
        if (m.href) {
            router.push(m.href);
        }
    };

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
                    <p className="pb-2 text-[11px] font-extrabold uppercase tracking-widest text-[#A1A1AA]">Module Swypik Super-App</p>
                    <div className="space-y-2">
                        {SUPERAPP_MODULES.map((v) => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => handleModuleClick(v)}
                                className="group flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
                            >
                                <span
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition group-hover:scale-105"
                                    style={{ backgroundColor: `${v.accent}18` }}
                                >
                                    <v.Icon size={20} style={{ color: v.accent }} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                        <span className="text-[14px] font-extrabold text-[#0D0D0D] truncate">{v.brand}</span>
                                        {v.badge && (
                                            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-tight ${v.badgeColor || "bg-violet-600 text-white"}`}>
                                                {v.badge}
                                            </span>
                                        )}
                                    </span>
                                    <span className="block text-[11px] font-medium text-[#6E6E80] truncate">{v.label}</span>
                                </span>
                                <ChevronRight size={16} className="shrink-0 text-[#A1A1AA] transition group-hover:translate-x-0.5 group-hover:text-black" />
                            </button>
                        ))}
                    </div>

                    <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                        {categories.map((c) => {
                            const active = activeCategory === nodeSlug(c);
                            const CatIcon = categoryIcon(c.name);
                            return (
                                <button
                                    key={String(c.id ?? c.name)}
                                    type="button"
                                    onClick={() => pick(active ? null : nodeSlug(c))}
                                    aria-pressed={active}
                                    className={`flex w-full items-center gap-3 border-b border-black/5 px-3.5 py-3 text-left text-[14px] font-bold last:border-0 ${active ? "bg-violet-600 text-white" : "text-[#0D0D0D] hover:bg-[#F7F7F8]"}`}
                                >
                                    <span className={`flex h-9 w-9 items-center justify-center rounded-full ${active ? "bg-white/20" : "bg-black/5"}`}>
                                        <CatIcon size={18} />
                                    </span>
                                    <span className="truncate">{c.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Footer legal — mobil-first: ținte de atins mari (44px),
                    grid 2 coloane, safe-area pentru iPhone. Linkurile SAL/SOL
                    sunt obligatorii (Reg. UE 524/2013). */}
                <div className="mt-6 border-t border-black/5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4">
                    <div className="flex items-center justify-center pb-2">
                            <LocaleQuickPicker variant="light" />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        {[
                            { label: "Termeni", href: "/terms" },
                            { label: "Confidențialitate", href: "/privacy" },
                            { label: "Cookie-uri", href: "/legal/cookies" },
                            { label: "ANPC", href: "/legal/anpc" },
                        ].map((l) => (
                            <button
                                key={l.href}
                                type="button"
                                onClick={() => goVertical(l.href)}
                                className="flex min-h-[32px] items-center justify-center rounded-lg bg-black/[0.03] px-2 text-center text-[10px] font-semibold text-[#6E6E80] transition active:scale-[0.97]"
                            >
                                {l.label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noreferrer"
                            className="flex min-h-[28px] items-center justify-center rounded-lg px-2 text-center text-[10px] font-medium text-[#A1A1AA] underline-offset-2 active:scale-[0.97]">
                            SAL — litigii
                        </a>
                        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer"
                            className="flex min-h-[28px] items-center justify-center rounded-lg px-2 text-center text-[10px] font-medium text-[#A1A1AA] underline-offset-2 active:scale-[0.97]">
                            SOL — platforma UE
                        </a>
                    </div>
                    <p className="mt-2 text-center text-[10px] leading-relaxed text-[#C7C7CC]">
                        © {new Date().getFullYear()} Swypik Technology
                        <span className="block">{SUPPORT_EMAIL}</span>
                    </p>
                </div>
            </div>
        </div>,
        document.body
    );
}
