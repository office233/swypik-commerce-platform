/**
 * SEO Landing Pages — /best/[slug]
 * Auto-generated product curation pages for Google ranking
 * 
 * Examples:
 *   /best/casti-wireless     → "Cele mai bune căști wireless"
 *   /best/setup-gaming       → "Setup gaming complet — AI Pick"
 *   /best/cadouri-sub-200    → "Cadouri sub 200 lei — Top 10"
 */

import { Metadata } from "next";
import { notFound } from "next/navigation";

// ─── SEO Page Definitions (matched to actual catalog inventory) ──
const SEO_PAGES: Record<string, {
  title: string;
  h1: string;
  description: string;
  intro: string;
  search: string;
  sort?: string;
  maxPrice?: number;
}> = {
  "rochii-vara": {
    title: "Cele mai frumoase rochii de vară 2026 — AICeVrei",
    h1: "👗 Cele mai frumoase rochii de vară",
    description: "Rochii de vară trendy selectate de AI. Calitate verificată, stil actual și livrare în România.",
    intro: "Am analizat mii de rochii și le-am filtrat pe cele cu cel mai bun raport calitate-preț. Fiecare are rating ridicat și scoruri de popularitate verificate din catalog.",
    search: "dress summer",
  },
  "outfit-complet": {
    title: "Outfit complet coordonat 2026 — Selectat de AI — AICeVrei",
    h1: "👠 Outfit complet — seturi coordonate",
    description: "Seturi de haine coordonate selectate de AI. Combini perfect și economisești timp.",
    intro: "Nu mai pierde timp combinând piese. AI-ul nostru a selectat cele mai bine cotate seturi complete — ready to wear.",
    search: "set",
  },
  "cadouri-sub-200": {
    title: "Cadouri sub 200 lei — Idei creative 2026 — AICeVrei",
    h1: "🎁 Cadouri sub 200 lei — Idei creative",
    description: "Idei de cadouri sub 200 lei selectate de AI. Originale, calitative și cu livrare rapidă în România.",
    intro: "Nu știi ce cadou să alegi? AI-ul nostru a selectat cele mai apreciate produse sub 200 lei — originale și cu scor de popularitate ridicat.",
    search: "top",
    maxPrice: 200,
  },
  "tinute-office": {
    title: "Ținute office elegante 2026 — AICeVrei",
    h1: "💼 Ținute office elegante",
    description: "Haine de birou elegante selectate de AI. Bluze, pantaloni, sacouri — toate verificate pentru calitate.",
    intro: "AI-ul a selectat piesele perfecte pentru garderoba de birou. Eleganță, confort și prețuri accesibile.",
    search: "suit",
  },
  "casual-streetwear": {
    title: "Streetwear casual trendy 2026 — AICeVrei",
    h1: "🔥 Streetwear casual — trending acum",
    description: "Haine casual și streetwear la prețuri excelente. Selectate de AI pentru stil și calitate.",
    intro: "Cele mai populare piese streetwear, verificate de AI. Stil actual, prețuri bune și livrare rapidă.",
    search: "casual",
  },
  "fitness-yoga": {
    title: "Echipament fitness și yoga 2026 — Selectat de AI — AICeVrei",
    h1: "🏋️ Echipament fitness & yoga",
    description: "Echipament sport și yoga de calitate. Selectat de AI pentru performanță și confort.",
    intro: "AI-ul nostru a selectat cele mai bine cotate echipamente fitness și yoga — comfort, durabilitate și stil.",
    search: "yoga",
  },
  "vintage-retro": {
    title: "Modă vintage & retro 2026 — AICeVrei",
    h1: "✨ Modă vintage & retro — AI Pick",
    description: "Haine vintage și retro selectate de AI. Piese unice cu stil atemporal.",
    intro: "Stilul vintage nu se demodează niciodată. AI-ul nostru a găsit cele mai bune piese retro, verificate pentru calitate.",
    search: "vintage",
  },
};

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = SEO_PAGES[slug];
  if (!page) return { title: "Pagină negăsită — AICeVrei" };
  return {
    title: page.title,
    description: page.description,
    openGraph: { title: page.h1, description: page.description },
  };
}

export default async function BestPage({ params }: Props) {
  const { slug } = await params;
  const page = SEO_PAGES[slug];
  if (!page) notFound();

  // Import directly from DB (server component — no HTTP self-fetch needed)
  let products: any[] = [];
  try {
    const { searchProducts } = await import("@/lib/db/product-queries");
    const result = await searchProducts({
      search: page.search,
      limit: 20,
      sort: (page.sort as any) || "popular",
      maxPrice: page.maxPrice,
    });
    products = result.products || [];
  } catch (e: any) {
    console.error("[SEO] Failed to fetch products for", slug, e.message);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#F0F2F5] to-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#6E6E80] hover:text-[#0D0D0D] mb-6">
          ← Înapoi la AICeVrei.ro
        </a>

        <h1 className="text-4xl font-black text-[#0D0D0D] leading-tight">{page.h1}</h1>
        <p className="mt-3 text-lg font-medium text-[#6E6E80] leading-relaxed">{page.intro}</p>

        <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#10A37F]">
          <span className="inline-block h-2 w-2 rounded-full bg-[#10A37F] animate-pulse"></span>
          Actualizat automat de AI — {new Date().toLocaleDateString("ro-RO", { month: "long", year: "numeric" })}
        </div>

        {/* Products Grid */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {products.map((p: any, i: number) => (
            <a
              key={p.id}
              href={`/product/${p.pgId || p.id}`}
              className="flex gap-4 rounded-2xl bg-white border border-[#E5E5E5] p-4 hover:border-[#10A37F] hover:shadow-md transition-all"
            >
              {p.images?.[0] && (
                <img src={p.images[0]} alt={p.title} className="h-24 w-24 rounded-xl object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-black text-[#10A37F]">#{i + 1}</span>
                  {p.commerceBadge && (
                    <span className="text-[10px] font-bold text-[#F59E0B]">{p.commerceBadge}</span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-[#0D0D0D] line-clamp-2">{p.title}</h3>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-[#6E6E80]">
                  <span className="text-[#F59E0B]">★ {p.rating}</span>
                  {p.socialProofLabel && <span>{p.socialProofLabel}</span>}
                </div>
                <div className="mt-1.5 flex items-end gap-2">
                  <span className="text-lg font-black text-[#10A37F]">{p.price} lei</span>
                  {p.oldPrice > p.price && (
                    <span className="text-xs text-[#6E6E80] line-through">{p.oldPrice} lei</span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>

        {products.length === 0 && (
          <p className="mt-12 text-center text-[#6E6E80] font-medium">Se încarcă produsele...</p>
        )}

        {/* CTA */}
        <div className="mt-10 rounded-2xl bg-[#0D0D0D] p-6 text-center">
          <p className="text-sm font-bold text-[#10A37F] uppercase tracking-widest">AI Shopping Assistant</p>
          <h2 className="mt-2 text-2xl font-black text-white">Vrei un bundle personalizat?</h2>
          <p className="mt-1 text-sm text-[#A1A1AA]">Spune-i AI-ului exact ce cauți și primești recomandări inteligente.</p>
          <a href="/" className="mt-4 inline-block rounded-xl bg-[#10A37F] px-8 py-3 font-bold text-white hover:bg-[#0E9371] transition-colors">
            Încearcă AI Shopping →
          </a>
        </div>

        {/* FAQ Schema */}
        <div className="mt-8 space-y-3">
          <h2 className="text-xl font-black text-[#0D0D0D]">Întrebări frecvente</h2>
          <details className="rounded-xl border border-[#E5E5E5] bg-white p-4">
            <summary className="font-bold text-sm cursor-pointer">Cum selectează AI-ul produsele?</summary>
            <p className="mt-2 text-sm text-[#6E6E80]">AI-ul analizează datele de catalog — preț, categorie, disponibilitate și scoruri de popularitate — pentru a identifica produsele cu cel mai bun raport calitate-preț.</p>
          </details>
          <details className="rounded-xl border border-[#E5E5E5] bg-white p-4">
            <summary className="font-bold text-sm cursor-pointer">Se livrează în România?</summary>
            <p className="mt-2 text-sm text-[#6E6E80]">Da, toate produsele listate pe AICeVrei.ro au livrare disponibilă în România, cu un timp estimat de 5-15 zile lucrătoare.</p>
          </details>
          <details className="rounded-xl border border-[#E5E5E5] bg-white p-4">
            <summary className="font-bold text-sm cursor-pointer">Pot returna produsele?</summary>
            <p className="mt-2 text-sm text-[#6E6E80]">Da, beneficiezi de protecție la cumpărare conform legislației UE. Contactează-ne în 14 zile de la primire pentru retur.</p>
          </details>
        </div>
      </div>
    </main>
  );
}
