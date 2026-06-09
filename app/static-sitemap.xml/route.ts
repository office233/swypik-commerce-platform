/**
 * Static sitemap — referenced by /sitemap.xml index.
 * Contains: home, explore, categories, search, legal pages, SEO landings, category slugs.
 *
 * Pentru fiecare URL emitem variante hreflang (ro/en/es/fr/de/pt/it + x-default),
 * astfel încât Google să indexeze corect paginile localizate.
 */

import { isEnabled } from "@/lib/feature-flags";
import { NextResponse } from "next/server";
import { buildSitemapHreflangTags } from "@/lib/seo/hreflang";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";

type Entry = {
  // canonical path (fără prefix de limbă, ex. "/explore", "/categories/fashion")
  path: string;
  priority: number;
  changefreq: string;
  // dacă true, NU emitem hreflang (pagini exclusiv RO / non-localizate)
  noLocalize?: boolean;
};

const STATIC: Entry[] = [
  { path: "/", priority: 1.0, changefreq: "daily" },
  { path: "/explore", priority: 0.9, changefreq: "daily" },
  { path: "/categories", priority: 0.9, changefreq: "daily" },
  { path: "/search", priority: 0.7, changefreq: "daily" },
  { path: "/about", priority: 0.5, changefreq: "monthly" },
  { path: "/help", priority: 0.5, changefreq: "monthly" },
  { path: "/terms", priority: 0.3, changefreq: "yearly" },
  { path: "/privacy", priority: 0.3, changefreq: "yearly" },
  { path: "/legal/cookies", priority: 0.2, changefreq: "yearly" },
  { path: "/become-a-creator", priority: 0.6, changefreq: "monthly" },
  { path: "/become-a-seller", priority: 0.6, changefreq: "monthly" },
  { path: "/swyp/genesis", priority: 0.7, changefreq: "weekly" },
  { path: "/unsubscribe", priority: 0.1, changefreq: "yearly", noLocalize: true },
];

const CATEGORY_SLUGS = [
  "fashion", "fashion-women", "fashion-women-clothing", "fashion-women-dresses",
  "fashion-women-tops", "fashion-women-pants", "fashion-women-outerwear",
  "fashion-men", "fashion-men-clothing-basic", "fashion-men-tshirts",
  "fashion-men-shirts", "fashion-men-polo", "fashion-men-pants", "fashion-men-jeans",
  "fashion-men-shorts", "fashion-men-coats", "fashion-men-hoodies", "fashion-men-underwear",
  "fashion-shoes", "fashion-shoes-accessories",
  "fashion-underwear", "fashion-underwear-women", "fashion-underwear-men", "fashion-underwear-socks",
  "fashion-accessories", "fashion-accessories-bags",
  "beauty", "beauty-makeup", "beauty-makeup-face", "beauty-makeup-lips",
  "home", "home-garden", "home-decor", "home-kitchen",
  "kids", "kids-general", "kids-toys",
  "electronics", "sports", "jewelry",
];

const SEO_SLUGS_WHEN_ENABLED = [
  "rochii-vara", "outfit-complet", "cadouri-sub-200",
  "tinute-office", "casual-streetwear", "fitness-yoga", "vintage-retro",
];

function renderEntry(entry: Entry, now: string): string {
  // loc-ul rămâne forma RO (canonical, fără prefix); hreflang tags adaugă restul.
  const loc = `${BASE_URL}${entry.path === "/" ? "" : entry.path}`;
  const hreflang = entry.noLocalize ? "" : `\n${buildSitemapHreflangTags(entry.path)}`;
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>${hreflang}
  </url>`;
}

export async function GET() {
  const now = new Date().toISOString();
  const all: Entry[] = [...STATIC];

  for (const slug of CATEGORY_SLUGS) {
    all.push({ path: `/categories/${slug}`, priority: 0.85, changefreq: "daily" });
  }

  if (isEnabled("seoPages")) {
    for (const slug of SEO_SLUGS_WHEN_ENABLED) {
      all.push({ path: `/best/${slug}`, priority: 0.8, changefreq: "weekly" });
    }
  }

  const body = all.map((e) => renderEntry(e, now)).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
