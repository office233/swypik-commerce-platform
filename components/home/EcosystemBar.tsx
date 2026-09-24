"use client";
import { isEnabledClient } from "@/lib/feature-flags-client";

import { useRouter } from "next/navigation";
import { Users, UtensilsCrossed, Car, BedDouble, Plane, HeartHandshake } from "lucide-react";
import { haptic } from "@/lib/haptic";

export default function EcosystemBar() {
    const router = useRouter();

    const items = [
        ...(isEnabledClient("squadBuy") ? [{
            id: "squad",
            title: "Squad Buy",
            badge: "-30%",
            badgeColor: "bg-fuchsia-600 text-white",
            icon: Users,
            iconBg: "from-fuchsia-500 to-violet-600",
            onClick: () => {
                haptic("tap");
                router.push("/squad");
            },
        }] : []),
        {
            id: "food",
            title: "Food",
            badge: "Eats",
            badgeColor: "bg-emerald-500 text-white",
            icon: UtensilsCrossed,
            iconBg: "from-emerald-500 to-teal-600",
            onClick: () => {
                haptic("tap");
                router.push("/food");
            },
        },
        {
            id: "go",
            title: "Go",
            badge: "Ride",
            badgeColor: "bg-amber-500 text-black",
            icon: Car,
            iconBg: "from-amber-400 to-yellow-500",
            onClick: () => {
                haptic("tap");
                router.push("/go");
            },
        },
        {
            id: "stays",
            title: "Stays",
            badge: "Hotel",
            badgeColor: "bg-teal-600 text-white",
            icon: BedDouble,
            iconBg: "from-teal-500 to-cyan-600",
            onClick: () => {
                haptic("tap");
                router.push("/stays");
            },
        },
        {
            id: "fly",
            title: "Fly",
            badge: "Zbor",
            badgeColor: "bg-sky-500 text-white",
            icon: Plane,
            iconBg: "from-sky-400 to-blue-600",
            onClick: () => {
                haptic("tap");
                router.push("/fly");
            },
        },
        {
            id: "cares",
            title: "Cares",
            badge: "0% Fee",
            badgeColor: "bg-pink-600 text-white",
            icon: HeartHandshake,
            iconBg: "from-pink-500 to-rose-600",
            onClick: () => {
                haptic("tap");
                router.push("/cares");
            },
        },
    ];

    return (
        <div className="w-full py-2.5 overflow-x-auto no-scrollbar [scrollbar-width:none]">
            <div className="flex items-center gap-3 px-3 min-w-max">
                {items.map((it) => {
                    const Icon = it.icon;
                    return (
                        <button
                            key={it.id}
                            type="button"
                            onClick={it.onClick}
                            className="group flex flex-col items-center gap-1.5 transition active:scale-95 text-left focus:outline-none"
                        >
                            <div className="relative">
                                <div
                                    className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${it.iconBg} text-white shadow-md transition-transform group-hover:scale-105`}
                                >
                                    <Icon size={22} className="drop-shadow-sm" />
                                </div>
                                {it.badge && (
                                    <span
                                        className={`absolute -top-1.5 -right-2 rounded-full px-1.5 py-0.2 text-[9px] font-black uppercase tracking-tight shadow-sm ${it.badgeColor}`}
                                    >
                                        {it.badge}
                                    </span>
                                )}
                            </div>
                            <span className="text-[11px] font-extrabold text-[#0D0D0D] dark:text-white/90">
                                {it.title}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
