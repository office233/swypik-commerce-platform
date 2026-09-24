/**
 * lib/news/repository.ts — server-side data access for the News module.
 *
 * Centralizes the SQL used by both the server components (app/[locale]/news)
 * and the API routes (app/api/news/**) so slug lookups, view-count increments
 * and source attribution stay consistent in one place.
 */
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface NewsArticleListItem {
  id: string;
  slug: string;
  title: string;
  summary_tldr: string;
  cover_image_url: string;
  is_breaking: boolean;
  reading_time_minutes: number;
  view_count: number;
  fact_check_score: number;
  published_at: string;
  category_name: string;
  category_slug: string;
}

export interface NewsArticleSource {
  original_url: string;
  original_title: string | null;
  source_name: string | null;
}

export interface NewsArticleDetail extends NewsArticleListItem {
  content_markdown: string;
  fact_check_notes: string | null;
  ai_disclaimer: string;
  sources: NewsArticleSource[];
}

const LIST_COLUMNS = `
  a.id, a.slug, a.title, a.summary_tldr, a.cover_image_url,
  a.is_breaking, a.reading_time_minutes, a.view_count, a.fact_check_score,
  a.published_at, c.name as category_name, c.slug as category_slug
`;

export async function listArticles(opts: {
  category?: string | null;
  breaking?: boolean;
  limit?: number;
}): Promise<NewsArticleListItem[]> {
  const params: unknown[] = [];
  let query = `
    SELECT ${LIST_COLUMNS}
    FROM news_articles a
    JOIN news_categories c ON a.category_id = c.id
    WHERE a.status = 'published'
  `;

  if (opts.category && opts.category !== "all") {
    params.push(opts.category);
    query += ` AND c.slug = $${params.length}`;
  }
  if (opts.breaking) {
    query += ` AND a.is_breaking = true`;
  }

  const limit = Math.min(60, Math.max(1, opts.limit ?? 30));
  params.push(limit);
  query += ` ORDER BY a.published_at DESC LIMIT $${params.length}`;

  const { rows } = await dbQuery<NewsArticleListItem>(query, params);
  return rows;
}

export async function getArticleBySlug(slug: string): Promise<NewsArticleDetail | null> {
  if (!slug || typeof slug !== "string" || slug.length > 200) return null;

  const { rows } = await dbQuery<NewsArticleListItem & {
    content_markdown: string;
    fact_check_notes: string | null;
    ai_disclaimer: string;
  }>(
    `SELECT ${LIST_COLUMNS}, a.content_markdown, a.fact_check_notes, a.ai_disclaimer
     FROM news_articles a
     JOIN news_categories c ON a.category_id = c.id
     WHERE a.slug = $1 AND a.status = 'published'
     LIMIT 1`,
    [slug]
  );

  const row = rows[0];
  if (!row) return null;

  const { rows: sourceRows } = await dbQuery<NewsArticleSource>(
    `SELECT nas.original_url, nas.original_title, ns.name as source_name
     FROM news_article_sources nas
     LEFT JOIN news_sources ns ON ns.id = nas.source_id
     WHERE nas.article_id = $1
     ORDER BY nas.created_at ASC`,
    [row.id]
  );

  return { ...row, sources: sourceRows };
}

/**
 * Increments view_count once per call. Callers decide the dedup strategy
 * (e.g. skipping the call when a per-session cookie was already set).
 */
export async function incrementViewCount(articleId: string): Promise<void> {
  try {
    await dbQuery(`UPDATE news_articles SET view_count = view_count + 1 WHERE id = $1`, [articleId]);
  } catch (err) {
    logger.warn({ err }, "[news] incrementViewCount failed");
  }
}

/** Count of AI-generated articles published today — used for the daily generation cap. */
export async function countArticlesPublishedToday(): Promise<number> {
  const { rows } = await dbQuery<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM news_articles WHERE created_at >= date_trunc('day', now())`
  );
  return Number(rows[0]?.count || "0");
}
