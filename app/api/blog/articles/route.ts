import { NextRequest, NextResponse } from "next/server";
import { listBlogArticles } from "@/lib/db/blog-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/blog/articles
 *
 * Query params:
 *   locale     — defaults to 'ro'
 *   category   — 'casa' | 'tech' | 'beauty' | ...
 *   tag        — single tag filter
 *   search     — FTS query against title + excerpt + tags
 *   limit      — default 24, max 100
 *   offset     — pagination
 *
 * Returns: { articles: BlogArticleSummary[], hasMore: boolean }
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 24, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  try {
    const articles = await listBlogArticles({
      locale: url.searchParams.get("locale") || undefined,
      category: url.searchParams.get("category") || undefined,
      tag: url.searchParams.get("tag") || undefined,
      search: url.searchParams.get("search") || undefined,
      limit: limit + 1, // fetch one extra to detect hasMore
      offset,
    });

    const hasMore = articles.length > limit;
    return NextResponse.json({
      articles: hasMore ? articles.slice(0, limit) : articles,
      hasMore,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("[blog/articles] error", err);
    return NextResponse.json({ articles: [], hasMore: false }, { status: 200 });
  }
}
