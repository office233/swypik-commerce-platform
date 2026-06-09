import { NextRequest, NextResponse } from "next/server";
import { getBlogArticleBySlug, incrementArticleViews } from "@/lib/db/blog-queries";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/blog/articles/[slug]
 *
 * Returns full article (including bodyMdx + linked product ids).
 * Increments view_count async (no await before responding).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") || undefined;

  try {
    const article = await getBlogArticleBySlug(slug, locale);
    if (!article) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Fire-and-forget view count bump. Do not block response.
    incrementArticleViews(article.id).catch((e) => {
      logger.warn({ err: e }, "[blog] failed to bump view_count");
    });

    return NextResponse.json({ article }, {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    logger.error({ err }, "[blog/articles/slug] error");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
