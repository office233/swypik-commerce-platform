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

// ─── SEO Page Definitions ───────────────────────────────────────
const SEO_PAGES: Record<string, {
  title: string;
  h1: string;
  description: string;
  intro: string;
  search: string;
  sort?: string;
  maxPrice?: number;
}> = {
  "casti-wireless": {
    title: "Cele mai bune căști wireless 2026 — AICeVrei",
    h1: "🎧 Cele mai bune căști wireless",
    description: "Top căști wireless selectate de AI. Calitate verificată, prețuri bune, livrare în România.",
    intro: "Am analizat sute de căști wireless și le-am filtrat pe cele care chiar merită. Fiecare produs are rating 4.5+ și recenzii reale.",
    search: "headphones earbuds wireless bluetooth",
  },
  "setup-gaming": {
    title: "Setup gaming complet 2026 — Selectat de AI — AICeVrei",
    h1: "🎮 Setup gaming complet — AI Pick",
    description: "Construiește-ți setup-ul de gaming perfect. Mouse, tastatură, căști, monitor — toate verificate de AI.",
    intro: "AI-ul nostru a selectat cele mai bune componente pentru un setup de gaming performant. Toate produsele au review-uri excelente și raport calitate-preț validat.",
    search: "gaming mouse keyboard headset monitor",
  },
  "cadouri-sub-200": {
    title: "Cadouri sub 200 lei — Idei creative 2026 — AICeVrei",
    h1: "🎁 Cadouri sub 200 lei — Idei creative",
    description: "Idei de cadouri sub 200 lei selectate de AI. Originale, calitative și cu livrare rapidă în România.",
    intro: "Nu știi ce cadou să alegi? AI-ul nostru a selectat cele mai apreciate produse sub 200 lei — originale și cu recenzii reale.",
    search: "gift creative",
    maxPrice: 200,
  },
  "gadgeturi-auto": {
    title: "Cele mai bune gadgeturi auto 2026 — AICeVrei",
    h1: "🚗 Gadgeturi auto — Top picks",
    description: "Gadgeturi auto utile selectate de AI. Suporturi telefon, organizatoare, lumini LED și accesorii verificate.",
    intro: "Am analizat cele mai populare gadgeturi auto și le-am filtrat pe cele cu rating excelent și utilitate reală.",
    search: "car accessories phone holder organizer LED",
  },
  "skincare-routine": {
    title: "Rutină skincare completă 2026 — Selectat de AI — AICeVrei",
    h1: "💄 Rutină skincare completă",
    description: "Produse skincare de calitate la prețuri accesibile. Serumuri, creme, măști — toate verificate de AI.",
    intro: "AI-ul nostru a creat o rutină skincare completă cu produse testate și validate de mii de utilizatori.",
    search: "skincare cream serum face mask moisturizer",
  },
  "birou-acasa": {
    title: "Setup birou de acasă 2026 — Selectat de AI — AICeVrei",
    h1: "💻 Setup birou de acasă — AI Pick",
    description: "Tot ce ai nevoie pentru un birou de acasă productiv. Organizatoare, lumini, accesorii — verificate de AI.",
    intro: "Lucrezi de acasă? AI-ul nostru a selectat cele mai bune produse pentru un spațiu de lucru productiv și estetic.",
    search: "desk organizer lamp office accessories",
  },
  "fitness-acasa": {
    title: "Kit fitness acasă 2026 — Echipament selectat de AI — AICeVrei",
    h1: "🏋️ Kit fitness acasă",
    description: "Echipament fitness pentru acasă selectat de AI. Benzi elastice, greutăți, covorașe — calitate verificată.",
    intro: "Nu ai nevoie de sală pentru a fi în formă. AI-ul nostru a selectat cele mai bune echipamente fitness pentru antrenament acasă.",
    search: "fitness yoga resistance band dumbbell exercise mat",
  },
};

type Props = { params: Promise<{ slug: string }> };

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

export function generateStaticParams() {
  return Object.keys(SEO_PAGES).map((slug) => ({ slug }));
}

export default async function BestPage({ params }: Props) {
  const { slug } = await params;
  const page = SEO_PAGES[slug];
  if (!page) notFound();

  // Fetch products server-side
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  let products: any[] = [];
  try {
    const url = new URL("/api/products", baseUrl);
    url.searchParams.set("search", page.search);
    url.searchParams.set("limit", "20");
    url.searchParams.set("sort", page.sort || "popular");
    if (page.maxPrice) url.searchParams.set("maxPrice", String(page.maxPrice));

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    const data = await res.json();
    products = data.products || [];
  } catch (e) {
    console.error("[SEO] Failed to fetch products for", slug);
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
                  <span>{p.orders}+ comenzi</span>
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
            <p className="mt-2 text-sm text-[#6E6E80]">AI-ul analizează rating-ul, numărul de comenzi, prețul și feedback-ul real al cumpărătorilor pentru a identifica produsele cu cel mai bun raport calitate-preț.</p>
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
