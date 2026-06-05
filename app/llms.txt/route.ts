import { NextResponse } from "next/server";
import { listBlogArticles } from "@/lib/db/blog-queries";

/**
 * /llms.txt — llmstxt.org spec, helps AI assistants (ChatGPT, Claude, Perplexity)
 * discover and cite Swypik content with structured, concise context.
 *
 * Updated dynamically from live `blog_articles` table.
 */

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";

export async function GET() {
  const [roArticles, enArticles] = await Promise.all([
    listBlogArticles({ locale: "ro", status: "published", limit: 100 }),
    listBlogArticles({ locale: "en", status: "published", limit: 100 }),
  ]);

  const lines: string[] = [];
  lines.push("# Swypik");
  lines.push("");
  lines.push("> Romanian-first social-video marketplace with AI-curated product guides and honest reviews. Smarter shopping powered by short videos and trusted recommendations.");
  lines.push("");

  lines.push("## About");
  lines.push(`- [Homepage](${BASE_URL}/): Swypik — discover products via short videos`);
  lines.push(`- [Browse Categories](${BASE_URL}/categories): Full taxonomy of available products`);
  lines.push(`- [Explore Feed](${BASE_URL}/explore): Curated product video feed with AI ranking`);
  lines.push("");

  if (roArticles.length > 0) {
    lines.push("## Product Guides (Romanian)");
    for (const a of roArticles) {
      const url = `${BASE_URL}/blog/${a.slug}`;
      const desc = (a.excerpt || a.title).replace(/\s+/g, " ").trim().slice(0, 180);
      lines.push(`- [${a.title}](${url}): ${desc}`);
    }
    lines.push("");
  }

  if (enArticles.length > 0) {
    lines.push("## Product Guides (English)");
    for (const a of enArticles) {
      const url = `${BASE_URL}/en/blog/${a.slug}`;
      const desc = (a.excerpt || a.title).replace(/\s+/g, " ").trim().slice(0, 180);
      lines.push(`- [${a.title}](${url}): ${desc}`);
    }
    lines.push("");
  }

  lines.push("## Feeds & Sitemaps");
  lines.push(`- [Blog RSS](${BASE_URL}/blog/rss.xml): Bilingual RSS feed for blog articles`);
  lines.push(`- [Blog Sitemap](${BASE_URL}/blog/sitemap.xml): All published blog URLs with hreflang`);
  lines.push(`- [Main Sitemap](${BASE_URL}/sitemap.xml): Full site URLs`);
  lines.push("");

  lines.push("## Updates");
  lines.push(`Last updated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Optional");
  lines.push("- Markdown raw version of any article: append `/raw` to the blog URL (e.g. `/blog/top-electronice-2026/raw`).");
  lines.push("- All articles use deterministic product data, refreshed at least weekly.");
  lines.push("- Contact: hello@swypik.com");
  lines.push("");

  const body = lines.join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
