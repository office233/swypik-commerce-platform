import { NextResponse } from "next/server";
import { listPublishedSlugs } from "@/lib/db/blog-queries";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";

/**
 * /blog/sitemap.xml — referenced by the root sitemap index.
 * Lists /blog plus every published article URL with lastmod.
 */
export async function GET() {
  const now = new Date().toISOString();
  let entries: Array<{ loc: string; lastmod: string; priority: string; changefreq: string }> = [
    { loc: `${BASE_URL}/blog`, lastmod: now, priority: "0.8", changefreq: "daily" },
  ];

  try {
    const slugs = await listPublishedSlugs();
    entries.push(
      ...slugs.map((s) => ({
        loc: `${BASE_URL}/blog/${s.slug}`,
        lastmod: s.updatedAt,
        priority: "0.7",
        changefreq: "weekly",
      })),
    );
  } catch (err) {
    console.warn("[blog sitemap] failed", err);
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url>
    <loc>${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
