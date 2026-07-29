"use client";

/**
 * HomeHeader — header minimal, mobile-first.
 * Logo · selector oraș · coș. Search-ul e o iconiță discretă:
 * feed-first, user-ul nu trebuie să caute.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/lib/i18n/navigation";
import { useTranslations } from "next-intl";
import { MapPin, Search, ShoppingBag } from "lucide-react";
import { haptic } from "@/lib/haptic";

const CITY_KEY = "swypik_city";

export default function HomeHeader({ cartCount = 0 }: { cartCount?: number }) {
    const t = useTranslations("home");
    const router = useRouter();
    const [city, setCity] = useState<string | null>(null);

    useEffect(() => {
        setCity(localStorage.getItem(CITY_KEY));
    }, []);

    const pickCity = () => {
        haptic("tap");
        const c = prompt(t("cityPrompt"), city ?? "");
        if (c && c.trim()) {
            const v = c.trim();
            localStorage.setItem(CITY_KEY, v);
            setCity(v);
        }
    };

    return (
        <header className="sticky top-0 z-40 border-b border-[#E5E5E5] bg-white/95 backdrop-blur-xl safe-top">
            <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-4">
                <Link href="/" className="text-xl font-black tracking-tight text-[#0D0D0D]">
                    Swypik
                </Link>

                <button
                    type="button"
                    onClick={pickCity}
                    className="ml-1 inline-flex h-9 min-w-0 items-center gap-1 rounded-full bg-[#F7F7F8] px-3 text-xs font-bold text-[#0D0D0D] transition active:scale-95"
                >
                    <MapPin size={14} className="shrink-0 text-[#6E6E80]" />
                    <span className="truncate max-w-[90px]">{city ?? t("chooseCity")}</span>
                </button>

                <div className="ml-auto flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => {
                            haptic("tap");
                            router.push("/search");
                        }}
                        aria-label={t("search")}
                        className="grid h-10 w-10 place-items-center rounded-full transition active:scale-95 hover:bg-[#F7F7F8]"
                    >
                        <Search size={20} className="text-[#0D0D0D]" />
                    </button>

                    <Link
                        href="/cart"
                        aria-label={t("cart")}
                        className="relative grid h-10 w-10 place-items-center rounded-full transition active:scale-95 hover:bg-[#F7F7F8]"
                    >
                        <ShoppingBag size={20} className="text-[#0D0D0D]" />
                        {cartCount > 0 && (
                            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-[#7C3AED] px-1 text-[10px] font-black text-white">
                                {cartCount > 99 ? "99+" : cartCount}
                            </span>
                        )}
                    </Link>
                </div>
            </div>
        </header>
    );
}
