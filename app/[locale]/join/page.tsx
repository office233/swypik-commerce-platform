"use client";

/**
 * /join — hub „Devino partener Swypik".
 * Trei drumuri: vânzător (magazin/ERP), flotă Go (șoferi), flotă Food (curieri).
 * Linkat din pagina de autentificare și din profil.
 */
import Link from "next/link";
import { ArrowRight, Store, Car, Bike, BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";

export default function JoinPage() {
    const t = useTranslations("join");

    const cards = [
        {
            href: "/become-a-seller",
            icon: Store,
            accent: "#7C3AED",
            title: t("sellerTitle"),
            sub: t("sellerSub"),
            bullets: [t("sellerB1"), t("sellerB2"), t("sellerB3")],
        },
        {
            href: "/join/fleet?kind=driver",
            icon: Car,
            accent: "#F59E0B",
            title: t("goTitle"),
            sub: t("goSub"),
            bullets: [t("goB1"), t("goB2"), t("goB3")],
        },
        {
            href: "/join/fleet?kind=courier",
            icon: Bike,
            accent: "#2DBE60",
            title: t("foodTitle"),
            sub: t("foodSub"),
            bullets: [t("foodB1"), t("foodB2"), t("foodB3")],
        },
    ];

    return (
        <main className="min-h-screen bg-[#FAFAFB] px-4 py-8">
            <div className="mx-auto max-w-2xl">
                <Link href="/" className="text-2xl font-black tracking-tight text-[#0D0D0D]">Swypik</Link>
                <h1 className="mt-6 text-3xl font-black tracking-tight text-[#0D0D0D]">{t("title")}</h1>
                <p className="mt-2 text-[15px] text-[#6E6E80]">{t("subtitle")}</p>

                <div className="mt-8 space-y-4">
                    {cards.map((c) => {
                        const Icon = c.icon;
                        return (
                            <Link
                                key={c.href}
                                href={c.href}
                                className="group block rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
                            >
                                <div className="flex items-center gap-4">
                                    <span
                                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                                        style={{ backgroundColor: `${c.accent}1A` }}
                                    >
                                        <Icon size={24} style={{ color: c.accent }} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[17px] font-extrabold text-[#0D0D0D]">{c.title}</p>
                                        <p className="text-[13px] text-[#6E6E80]">{c.sub}</p>
                                    </div>
                                    <ArrowRight size={20} className="shrink-0 text-[#A1A1AA] transition group-hover:translate-x-1" />
                                </div>
                                <ul className="mt-4 space-y-1.5">
                                    {c.bullets.map((b) => (
                                        <li key={b} className="flex items-center gap-2 text-[13px] font-semibold text-[#3F3F46]">
                                            <BadgeCheck size={15} style={{ color: c.accent }} /> {b}
                                        </li>
                                    ))}
                                </ul>
                            </Link>
                        );
                    })}
                </div>

                <p className="mt-8 text-center text-[13px] text-[#A1A1AA]">
                    {t("haveAccount")}{" "}
                    <Link href="/auth/login" className="font-bold text-violet-600 hover:underline">{t("login")}</Link>
                </p>
            </div>
        </main>
    );
}
