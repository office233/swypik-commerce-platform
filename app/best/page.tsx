/**
 * /best — Index of all AI-curated SEO landing pages.
 *
 * Lists every entry from SEO_PAGES as a card linking to /best/[slug].
 * Server component, statically renderable (revalidates daily).
 */

import { Metadata } from "next";
import Link from "next/link";
import { SEO_PAGES } from "@/lib/seo/best-pages";

export const dynamic = "force-static";
export const revalidate = 86400; // 24h

export const metadata: Metadata = {
  title: "Cele mai bune produse 2026 — Selectate de AI — Swypik",
  description:
    "Colecții curate de AI: rochii de vară, outfit complet, cadouri sub 200 lei, ținute office, streetwear, fitness și vintage. Top produse cu rating ridicat și livrare în România.",
  openGraph: {
    title: "Cele mai bune produse — AI Picks — Swypik",
    description:
      "Descoperă colecțiile noastre selectate de AI: top produse pe categorii, cu rating verificat și livrare rapidă în România.",
  },
};

export default function BestIndexPage() {
  const entries = Object.entries(SEO_PAGES);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#F0F2F5] to-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-[#6E6E80] hover:text-[#0D0D0D] mb-6"
        >
          ← Înapoi la Swypik
        </Link>

        <h1 className="text-4xl font-black text-[#0D0D0D] leading-tight">
          ✨ Cele mai bune produse — AI Picks
        </h1>
        <p className="mt-3 text-lg font-medium text-[#6E6E80] leading-relaxed">
          Colecții curate automat de AI, pe categorii. Fiecare listă conține produse cu
          rating ridicat și raport calitate-preț verificat.
        </p>

        <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#0D0D0D]">
          <span className="inline-block h-2 w-2 rounded-full bg-[#0D0D0D] animate-pulse"></span>
          Actualizate automat —{" "}
          {new Date().toLocaleDateString("ro-RO", { month: "long", year: "numeric" })}
        </div>

        {/* Grid de colecții */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {entries.map(([slug, page]) => (
            <Link
              key={slug}
              href={`/best/${slug}`}
              className="group rounded-2xl bg-white border border-[#E5E5E5] p-5 hover:border-[#0D0D0D] hover:shadow-md transition-all"
            >
              <h2 className="text-lg font-black text-[#0D0D0D] leading-snug group-hover:text-[#0D0D0D]">
                {page.h1}
              </h2>
              <p className="mt-2 text-sm font-medium text-[#6E6E80] line-clamp-3">
                {page.description}
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#0D0D0D]">
                Vezi top produse →
              </div>
            </Link>
          ))}
        </div>

        {/* CTA spre Shop */}
        <div className="mt-10 rounded-2xl bg-[#0D0D0D] p-6 text-center">
          <p className="text-sm font-bold text-[#0D0D0D] uppercase tracking-widest">
            Catalog complet
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            Vrei să explorezi tot catalogul?
          </h2>
          <p className="mt-1 text-sm text-[#A1A1AA]">
            Peste 160.000 de produse cu filtre avansate, sortare și căutare inteligentă.
          </p>
          <Link
            href="/shop"
            className="mt-4 inline-block rounded-xl bg-[#0D0D0D] px-8 py-3 font-bold text-white hover:bg-[#0E9371] transition-colors"
          >
            Deschide Shop →
          </Link>
        </div>
      </div>
    </main>
  );
}
