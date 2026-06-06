import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";
const LOCALES = ["ro", "en", "es", "fr", "de", "pt", "it"] as const;
type Locale = (typeof LOCALES)[number];

/**
 * /blog/sitemap.xml — referenced by the root sitemap index.
 *
 * Emits:
 *  - 7 hub entries (one per locale: /blog, /en/blog, ... /it/blog)
 *  - 1 entry per (locale, article) combination that actually has a published
 *    translation row in `blog_article_translations` (RO is always present).
 *
 * Each <url> carries xhtml:link hreflang annotations for every locale variant
 * that exists, plus x-default → RO canonical, so Google indexes them as the
 * same content in different languages.
 */
export async function GET() {
  const now = new Date().toISOString();
  const localePath = (loc: Locale) => (loc === "ro" ? "" : `/${loc}`);

  type Entry = {
    loc: string;
    lastmod: string;
    priority: string;
    changefreq: string;
    alternates: Array<{ hreflang: string; href: string }>;
  };

  // ---- Hub URLs ----
  const hubAlternates = [
    ...LOCALES.map((alt) => ({
      hreflang: alt,
      href: `${BASE_URL}${localePath(alt)}/blog`,
    })),
    { hreflang: "x-default", href: `${BASE_URL}/blog` },
  ];
  const hubEntries: Entry[] = LOCALES.map((loc) => ({
    loc: `${BASE_URL}${localePath(loc)}/blog`,
    lastmod: now,
    priority: "0.8",
    changefreq: "daily",
    alternates: hubAlternates,
  }));

  // ---- Article URLs ----
  const articleEntries: Entry[] = [];
  try {
    // One row per published article with: canonical slug, RO updated_at, and
    // an array of per-locale {locale, slug, updated_at} for any translations.
    const { rows } = await dbQuery<{
      canonical_slug: string;
      ro_updated_at: string;
      translations: Array<{ locale: string; slug: string | null; updated_at: string }> | null;
    }>(`
      SELECT
        a.slug AS canonical_slug,
        a.updated_at AS ro_updated_at,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'locale', t.locale,
              'slug', t.slug,
              'updated_at', t.updated_at
            ))
            FROM blog_article_translations t
            WHERE t.article_id = a.id
          ),
          '[]'::json
        ) AS translations
      FROM blog_articles a
      WHERE a.status = 'published'
      ORDER BY a.published_at DESC NULLS LAST
    `);

    for (const row of rows) {
      const canonical = row.canonical_slug;
      const roUpdated = new Date(row.ro_updated_at).toISOString();
      const translations = Array.isArray(row.translations) ? row.translations : [];

      // Map of locale → { slug, updatedAt } (always include RO)
      const variants = new Map<Locale, { slug: string; updatedAt: string }>();
      variants.set("ro", { slug: canonical, updatedAt: roUpdated });
      for (const t of translations) {
        if (!LOCALES.includes(t.locale as Locale)) continue;
        variants.set(t.locale as Locale, {
          slug: t.slug || canonical,
          updatedAt: new Date(t.updated_at).toISOString(),
        });
      }

      // Build alternates: every locale variant that exists + x-default → RO
      const alternates: Entry["alternates"] = [];
      let latest = roUpdated;
      for (const loc of LOCALES) {
        const v = variants.get(loc);
        if (!v) continue;
        alternates.push({
          hreflang: loc,
          href: `${BASE_URL}${localePath(loc)}/blog/${v.slug}`,
        });
        if (v.updatedAt > latest) latest = v.updatedAt;
      }
      alternates.push({ hreflang: "x-default", href: `${BASE_URL}/blog/${canonical}` });

      // Emit one entry per locale variant
      for (const loc of LOCALES) {
        const v = variants.get(loc);
        if (!v) continue;
        articleEntries.push({
          loc: `${BASE_URL}${localePath(loc)}/blog/${v.slug}`,
          lastmod: latest,
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

  const renderUrl = (e: Entry) => `  <url>
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
