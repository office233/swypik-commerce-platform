import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isEnabled("news")) return frozenResponse("news");

  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const breaking = url.searchParams.get("breaking") === "true";

    let query = `
      SELECT a.id, a.slug, a.title, a.summary_tldr, a.cover_image_url,
             a.is_breaking, a.reading_time_minutes, a.view_count, a.fact_check_score,
             a.published_at, c.name as category_name, c.slug as category_slug
      FROM news_articles a
      JOIN news_categories c ON a.category_id = c.id
      WHERE a.status = 'published'
    `;
    const params: any[] = [];

    if (category && category !== "all") {
      params.push(category);
      query += ` AND c.slug = $${params.length}`;
    }

    if (breaking) {
      query += ` AND a.is_breaking = true`;
    }

    query += ` ORDER BY a.published_at DESC LIMIT 30`;

    const { rows } = await dbQuery(query, params);

    return NextResponse.json({
      ok: true,
      articles: rows,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
