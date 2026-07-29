"use client";

/**
 * CaresBanner — Swypik Cares pe homepage.
 * Românii donează pentru România: comision 0%, transparență totală.
 */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heart, ChevronRight } from "lucide-react";
import { haptic } from "@/lib/haptic";

export default function CaresBanner({ className = "" }: { className?: string }) {
    const t = useTranslations("home");
    const router = useRouter();

    return (
        <button
            type="button"
            onClick={() => {
                haptic("tap");
                router.push("/v/cares");
            }}
            className="group relative flex w-full items-center gap-3 overflow-hidden rounded-3xl p-4 text-left shadow-lg shadow-rose-500/20 transition active:scale-[0.98]"
            style={{ backgroundImage: "linear-gradient(135deg, #E11D48 0%, #9F1239 100%)" }}
        >
            <span
                className="pointer-events-none absolute -right-4 -top-6 select-none text-[6rem] leading-none opacity-15"
                aria-hidden
            >
                ❤️
            </span>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/25 backdrop-blur-sm">
                <Heart size={24} className="text-white" fill="white" />
            </span>
            <span className="relative min-w-0 flex-1">
                <span className="block text-[15px] font-black leading-tight text-white">
                    Swypik Cares
                </span>
                <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-white/85">
                    {t("cares.tagline")}
                </span>
                <span className="mt-1.5 inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                    {t("cares.badge")}
                </span>
            </span>
            <ChevronRight size={20} className="relative shrink-0 text-white/70" />
        </button>
    );
}
