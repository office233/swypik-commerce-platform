import { NextResponse } from "next/server";
import { listBlogArticles } from "@/lib/db/blog-queries";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(d: string | null): string {
  const date = d ? new Date(d) : new Date();
  return date.toUTCString();
}

/**
 * /blog/rss.xml ??? Blog feed (RO by default; ?locale=en for EN).
 * Lists the 30 most recently published guides. RSS 2.0 + Atom self link.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") === "en" ? "en" : "ro";
  const localePrefix = locale === "en" ? "/en" : "";
  const langTag = locale === "en" ? "en-US" : "ro-RO";

  const channelTitle = locale === "en"
    ? "Swypik ??? Product Guides & Reviews"
    : "Swypik ??? Ghiduri & Recenzii Produse";
  const channelDesc = locale === "en"
    ? "Honest product guides and reviews tested by the Swypik team."
    : "Ghiduri ??i recenzii produse testate de echipa Swypik.";

  let items: Awaited<ReturnType<typeof listBlogArticles>> = [];
  try {
    items = await listBlogArticles({ locale, limit: 30 });
  } catch (err) {
    console.warn("[blog rss] failed", err);
  }

  const channelLink = `${BASE_URL}${localePrefix}/blog`;
  const selfLink = `${BASE_URL}/blog/rss.xml${locale === "en" ? "?locale=en" : ""}`;

  const itemsXml = items.map((a) => {
    const link = `${BASE_URL}${localePrefix}/blog/${a.slug}`;
    const pub = rfc822(a.publishedAt);
    const desc = escapeXml(a.excerpt || a.title);
    const title = escapeXml(a.title);
    const category = a.category ? `\n      <category>${escapeXml(a.category)}</category>` : "";
    const enclosure = a.heroImageUrl
      ? `\n      <enclosure url="${escapeXml(a.heroImageUrl)}" type="image/jpeg" />`
      : "";
    return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pub}</pubDate>
      <description>${desc}</description>${category}${enclosure}
      <author>noreply@swypik.com (${escapeXml(a.authorName)})</author>
    </item>`;
  }).join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${channelLink}</link>
    <atom:link href="${selfLink}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(channelDesc)}</description>
    <language>${langTag}</language>
    <lastBuildDate>${rfc822(null)}</lastBuildDate>
    <ttl>30</ttl>
${itemsXml}
  </channel>
</rss>
`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
