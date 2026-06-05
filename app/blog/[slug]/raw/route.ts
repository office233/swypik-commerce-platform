import { NextRequest, NextResponse } from "next/server";
import { getBlogArticleBySlug } from "@/lib/db/blog-queries";

/**
 * /blog/[slug]/raw — returns the article body as plain Markdown with YAML
 * frontmatter. Designed for AI ingestion (RAG, citation, summarization).
 *
 * Supports ?locale=en to fetch the English translation.
 */

export const dynamic = "force-dynamic";
export const revalidate = 300;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";

function yamlEscape(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\n/g, " ").trim();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const locale = (req.nextUrl.searchParams.get("locale") || "ro").toLowerCase();
  const validLocale = locale === "en" ? "en" : "ro";

  const article = await getBlogArticleBySlug(slug, validLocale);
  if (!article) {
    return new NextResponse(`# 404 Not Found\n\nArticle "${slug}" does not exist.\n`, {
      status: 404,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  const url = validLocale === "en"
    ? `${BASE_URL}/en/blog/${article.slug}`
    : `${BASE_URL}/blog/${article.slug}`;

  const frontmatter: string[] = ["---"];
  frontmatter.push(`title: "${yamlEscape(article.title)}"`);
  if (article.publishedAt) frontmatter.push(`date: "${article.publishedAt}"`);
  frontmatter.push(`author: "${yamlEscape(article.authorName || "Swypik Editorial")}"`);
  if (article.category) frontmatter.push(`category: "${yamlEscape(article.category)}"`);
  if (article.tags?.length) frontmatter.push(`tags: [${article.tags.map(t => `"${yamlEscape(t)}"`).join(", ")}]`);
  if (article.heroImageUrl) frontmatter.push(`hero_image: "${article.heroImageUrl}"`);
  if (article.excerpt) frontmatter.push(`excerpt: "${yamlEscape(article.excerpt)}"`);
  frontmatter.push(`url: "${url}"`);
  frontmatter.push(`language: "${validLocale}"`);
  frontmatter.push(`read_time_min: ${article.readTimeMin || 3}`);
  if (article.linkedProductCount) frontmatter.push(`linked_products: ${article.linkedProductCount}`);
  frontmatter.push("---");
  frontmatter.push("");

  const body = `${frontmatter.join("\n")}\n${article.bodyMdx}\n`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Robots-Tag": "noindex, nofollow",
      "Link": `<${url}>; rel="canonical"`,
    },
  });
}
