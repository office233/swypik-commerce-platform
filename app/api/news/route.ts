import { NextRequest, NextResponse } from "next/server";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { listArticles, getArticleBySlug, incrementViewCount } from "@/lib/news/repository";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isEnabled("news")) return frozenResponse("news");

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");

    if (slug) {
      const article = await getArticleBySlug(slug);
      if (!article) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
      // Best-effort, once per request — never blocks the response.
      incrementViewCount(article.id).catch((err) => logger.warn({ err }, "[news] view count increment failed"));
      return NextResponse.json({ ok: true, article });
    }

    const category = url.searchParams.get("category");
    const breaking = url.searchParams.get("breaking") === "true";
    const articles = await listArticles({ category, breaking, limit: 30 });

    return NextResponse.json({ ok: true, articles });
  } catch (err: unknown) {
    logger.error({ err }, "[news] GET failed");
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
