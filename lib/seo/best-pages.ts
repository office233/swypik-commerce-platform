/**
 * Shared SEO landing page definitions for /best routes.
 *
 * Used by:
 *   - app/best/page.tsx        → index/listing page
 *   - app/best/[slug]/page.tsx → individual curation pages
 */

export type BestPageDef = {
  title: string;
  h1: string;
  description: string;
  intro: string;
  search: string;
  sort?: string;
  maxPrice?: number;
};

export const SEO_PAGES: Record<string, BestPageDef> = {
  "rochii-vara": {
    title: "Cele mai frumoase rochii de vară 2026 — Swypik",
    h1: "👗 Cele mai frumoase rochii de vară",
    description: "Rochii de vară trendy selectate de AI. Calitate verificată, stil actual și livrare în România.",
    intro: "Am analizat mii de rochii și le-am filtrat pe cele cu cel mai bun raport calitate-preț. Fiecare are rating ridicat și scoruri de popularitate verificate din catalog.",
    search: "dress summer",
  },
  "outfit-complet": {
    title: "Outfit complet coordonat 2026 — Selectat de AI — Swypik",
    h1: "👠 Outfit complet — seturi coordonate",
    description: "Seturi de haine coordonate selectate de AI. Combini perfect și economisești timp.",
    intro: "Nu mai pierde timp combinând piese. AI-ul nostru a selectat cele mai bine cotate seturi complete — ready to wear.",
    search: "set",
  },
  "cadouri-sub-200": {
    title: "Cadouri sub 200 lei — Idei creative 2026 — Swypik",
    h1: "🎁 Cadouri sub 200 lei — Idei creative",
    description: "Idei de cadouri sub 200 lei selectate de AI. Originale, calitative și cu livrare rapidă în România.",
    intro: "Nu știi ce cadou să alegi? AI-ul nostru a selectat cele mai apreciate produse sub 200 lei — originale și cu scor de popularitate ridicat.",
    search: "top",
    maxPrice: 200,
  },
  "tinute-office": {
    title: "Ținute office elegante 2026 — Swypik",
    h1: "💼 Ținute office elegante",
    description: "Haine de birou elegante selectate de AI. Bluze, pantaloni, sacouri — toate verificate pentru calitate.",
    intro: "AI-ul a selectat piesele perfecte pentru garderoba de birou. Eleganță, confort și prețuri accesibile.",
    search: "suit",
  },
  "casual-streetwear": {
    title: "Streetwear casual trendy 2026 — Swypik",
    h1: "🔥 Streetwear casual — trending acum",
    description: "Haine casual și streetwear la prețuri excelente. Selectate de AI pentru stil și calitate.",
    intro: "Cele mai populare piese streetwear, verificate de AI. Stil actual, prețuri bune și livrare rapidă.",
    search: "casual",
  },
  "fitness-yoga": {
    title: "Echipament fitness și yoga 2026 — Selectat de AI — Swypik",
    h1: "🏋️ Echipament fitness & yoga",
    description: "Echipament sport și yoga de calitate. Selectat de AI pentru performanță și confort.",
    intro: "AI-ul nostru a selectat cele mai bine cotate echipamente fitness și yoga — comfort, durabilitate și stil.",
    search: "yoga",
  },
  "vintage-retro": {
    title: "Modă vintage & retro 2026 — Swypik",
    h1: "✨ Modă vintage & retro — AI Pick",
    description: "Haine vintage și retro selectate de AI. Piese unice cu stil atemporal.",
    intro: "Stilul vintage nu se demodează niciodată. AI-ul nostru a găsit cele mai bune piese retro, verificate pentru calitate.",
    search: "vintage",
  },
};
