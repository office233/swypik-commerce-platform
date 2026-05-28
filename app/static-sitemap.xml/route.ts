/**
 * Static sitemap — referenced by /sitemap.xml index.
 * Contains: home, explore, categories, search, legal pages, SEO landings, category slugs.
 */

import { isEnabled } from "@/lib/feature-flags";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";

type Entry = { url: string; priority: number; changefreq: string };

const STATIC: Entry[] = [
  { url: BASE_URL, priority: 1.0, changefreq: "daily" },
  { url: `${BASE_URL}/explore`, priority: 0.9, changefreq: "daily" },
  { url: `${BASE_URL}/categories`, priority: 0.9, changefreq: "daily" },
  { url: `${BASE_URL}/search`, priority: 0.7, changefreq: "daily" },
  { url: `${BASE_URL}/about`, priority: 0.5, changefreq: "monthly" },
  { url: `${BASE_URL}/help`, priority: 0.5, changefreq: "monthly" },
  { url: `${BASE_URL}/terms`, priority: 0.3, changefreq: "yearly" },
  { url: `${BASE_URL}/privacy`, priority: 0.3, changefreq: "yearly" },
  { url: `${BASE_URL}/legal/cookies`, priority: 0.2, changefreq: "yearly" },
  { url: `${BASE_URL}/become-a-creator`, priority: 0.6, changefreq: "monthly" },
  { url: `${BASE_URL}/become-a-seller`, priority: 0.6, changefreq: "monthly" },
  { url: `${BASE_URL}/unsubscribe`, priority: 0.1, changefreq: "yearly" },
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

export async function GET() {
  const now = new Date().toISOString();
  const all: Entry[] = [...STATIC];

  for (const slug of CATEGORY_SLUGS) {
    all.push({ url: `${BASE_URL}/categories/${slug}`, priority: 0.85, changefreq: "daily" });
  }

  if (isEnabled("seoPages")) {
    for (const slug of SEO_SLUGS_WHEN_ENABLED) {
      all.push({ url: `${BASE_URL}/best/${slug}`, priority: 0.8, changefreq: "weekly" });
    }
  }

  const body = all
    .map(
      (e) =>
        `  <url><loc>${e.url}</loc><lastmod>${now}</lastmod><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
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
