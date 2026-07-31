"use client";

/**
 * PartnerLanding — layout comun pentru paginile de recrutare partener
 * (șofer Go, curier Food, franciză), în stilul paginii /become-a-seller:
 * hero mare → 3 argumente „de ce noi" → formular de aplicare.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export type Feature = { title: string; description: string };

type Props = {
    /** Eticheta discretă din dreapta sus (ex. „Swypik Go · Șoferi"). */
    portalLabel: string;
    headline: string;
    headlineMuted: string;
    subheadline: string;
    ctaLabel: string;
    whyTitle: string;
    features: Feature[];
    formTitle: string;
    formSubtitle: string;
    children: ReactNode;
};

export default function PartnerLanding({
    portalLabel,
    headline,
    headlineMuted,
    subheadline,
    ctaLabel,
    whyTitle,
    features,
    formTitle,
    formSubtitle,
    children,
}: Props) {
    return (
        <div className="min-h-screen bg-white font-sans text-black">
            <nav className="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
                <Link href="/" className="text-2xl font-bold tracking-tight text-black">
                    Swypik
                </Link>
                <div className="text-sm font-medium text-gray-500">{portalLabel}</div>
            </nav>

            <section className="mx-auto max-w-4xl px-6 py-20 text-center md:py-32">
                <h1 className="mb-6 text-5xl font-extrabold tracking-tight md:text-7xl">
                    {headline}
                    <br className="hidden md:block" />
                    <span className="text-gray-400"> {headlineMuted}</span>
                </h1>
                <p className="mx-auto mb-10 max-w-2xl text-lg text-gray-500 md:text-xl">{subheadline}</p>
                <a
                    href="#apply"
                    className="inline-flex items-center gap-2 rounded-full bg-black px-8 py-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
                >
                    {ctaLabel} <ArrowRight className="h-4 w-4" />
                </a>
            </section>

            <section className="border-y border-[#E5E5E5] bg-gray-50/50">
                <div className="mx-auto max-w-5xl px-6 py-16">
                    <h2 className="mb-10 text-center text-2xl font-bold tracking-tight">{whyTitle}</h2>
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                        {features.map((f) => (
                            <div key={f.title} className="flex flex-col items-center text-center">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#E5E5E5] bg-white">
                                    <CheckCircle2 className="h-6 w-6 text-black" />
                                </div>
                                <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                                <p className="text-sm text-gray-500">{f.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section id="apply" className="mx-auto max-w-xl px-6 py-20">
                <div className="mb-10 text-center">
                    <h2 className="mb-3 text-3xl font-bold tracking-tight">{formTitle}</h2>
                    <p className="text-gray-500">{formSubtitle}</p>
                </div>
                {children}
            </section>
        </div>
    );
}
