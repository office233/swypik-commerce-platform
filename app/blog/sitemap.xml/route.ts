import { NextResponse } from "next/server";
import { listPublishedSlugs } from "@/lib/db/blog-queries";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";
const LOCALES = ["ro", "en"] as const;

/**
 * /blog/sitemap.xml \u2014 referenced by the root sitemap index.
 * Lists /blog and /en/blog plus every published article URL in both locales,
 * with xhtml:link hreflang annotations so Google indexes both variants.
 */
export async function GET() {
  const now = new Date().toISOString();

  // Hub URLs (one per locale)
  const hubEntries = LOCALES.map((loc) => ({
    loc: `${BASE_URL}${loc === "ro" ? "" : `/${loc}`}/blog`,
    lastmod: now,
    priority: "0.8",
    changefreq: "daily",
    alternates: LOCALES.map((alt) => ({
      hreflang: alt,
      href: `${BASE_URL}${alt === "ro" ? "" : `/${alt}`}/blog`,
    })),
  }));

  // Article URLs (RO canonical slug + EN slug if present; usually identical)
  type Entry = {
    loc: string;
    lastmod: string;
    priority: string;
    changefreq: string;
    alternates: Array<{ hreflang: string; href: string }>;
  };
  const articleEntries: Entry[] = [];

  try {
    const [roSlugs, enSlugs] = await Promise.all([
      listPublishedSlugs("ro"),
      listPublishedSlugs("en"),
    ]);
    const enBySlug = new Map(enSlugs.map((s) => [s.slug, s]));

    for (const ro of roSlugs) {
      const en = enBySlug.get(ro.slug);
      const lastmod = en && en.updatedAt > ro.updatedAt ? en.updatedAt : ro.updatedAt;
      const alternates: Entry["alternates"] = [
        { hreflang: "ro", href: `${BASE_URL}/blog/${ro.slug}` },
      ];
      if (en) alternates.push({ hreflang: "en", href: `${BASE_URL}/en/blog/${en.slug}` });
      alternates.push({ hreflang: "x-default", href: `${BASE_URL}/blog/${ro.slug}` });

      // RO entry
      articleEntries.push({
        loc: `${BASE_URL}/blog/${ro.slug}`,
        lastmod,
        priority: "0.7",
        changefreq: "weekly",
        alternates,
      });

      // EN entry (only if translation exists)
      if (en) {
        articleEntries.push({
          loc: `${BASE_URL}/en/blog/${en.slug}`,
          lastmod,
          priority: "0.7",
          changefreq: "weekly",
          alternates,
        });
      }
    }
  } catch (err) {
    console.warn("[blog sitemap] failed", err);
  }

  const entries = [...hubEntries, ...articleEntries];

  const renderUrl = (e: typeof entries[number]) => `  <url>
    <loc>${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
${e.alternates.map((a) => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`).join("\n")}
  </url>`;

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.map(renderUrl).join("\n")}
</urlset>
`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
