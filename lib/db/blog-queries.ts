import { dbQuery } from "@/lib/db";

/**
 * Blog DB layer.
 *
 * Source of truth: `blog_articles` (locale='ro' canonical).
 * Translations LEFT JOIN `blog_article_translations` (per-locale overrides).
 * Inline products: `blog_article_products` (N:M) + denormalized
 * `blog_articles.linked_product_ids` for fast "related" lookups.
 *
 * Migration: db/migrations/20260605_0001_blog_articles.sql
 */

export type BlogArticleSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  category: string | null;
  tags: string[];
  authorName: string;
  authorAvatar: string | null;
  readTimeMin: number;
  viewCount: number;
  publishedAt: string | null;
  linkedProductCount: number;
};

export type BlogArticle = BlogArticleSummary & {
  bodyMdx: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  ogImageUrl: string | null;
  linkedProductIds: string[];
};

export type BlogArticleFilters = {
  locale?: string;
  category?: string;
  tag?: string;
  search?: string;
  limit?: number;
  offset?: number;
  status?: "published" | "draft" | "review" | "all";
};

const DEFAULT_LOCALE = "ro";

type BlogArticleRow = {
  id: string | number;
  slug: string;
  title: string;
  excerpt?: string | null;
  hero_image_url?: string | null;
  hero_image_alt?: string | null;
  category?: string | null;
  tags?: string[] | null;
  author_name?: string | null;
  author_avatar?: string | null;
  read_time_min?: number | string | null;
  view_count?: number | string | null;
  published_at?: string | Date | null;
  linked_product_count?: number | string | null;
};

function rowToSummary(r: BlogArticleRow): BlogArticleSummary {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    excerpt: r.excerpt ?? null,
    heroImageUrl: r.hero_image_url ?? null,
    heroImageAlt: r.hero_image_alt ?? null,
    category: r.category ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    authorName: r.author_name ?? "Swypik Editorial",
    authorAvatar: r.author_avatar ?? null,
    readTimeMin: Number(r.read_time_min) || 5,
    viewCount: Number(r.view_count) || 0,
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
    linkedProductCount: Number(r.linked_product_count) || 0,
  };
}

/**
 * Locale-aware SELECT: prefer translation when present, fall back to canonical.
 * COALESCE(t.col, a.col) is the standard pattern (matches product_translations usage).
 */
function buildLocaleSelectFields(): string {
  return `
    a.id,
    COALESCE(t.slug, a.slug)             AS slug,
    COALESCE(t.title, a.title)           AS title,
    COALESCE(t.excerpt, a.excerpt)       AS excerpt,
    a.hero_image_url,
    a.hero_image_alt,
    a.category,
    a.tags,
    a.author_name,
    a.author_avatar,
    a.read_time_min,
    a.view_count,
    a.published_at,
    COALESCE(array_length(a.linked_product_ids, 1), 0) AS linked_product_count
  `;
}

/**
 * List articles with filters. Returns published-only by default.
 */
export async function listBlogArticles(filters: BlogArticleFilters = {}): Promise<BlogArticleSummary[]> {
  const locale = filters.locale || DEFAULT_LOCALE;
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const status = filters.status ?? "published";

  const params: Array<string | number> = [locale];
  const where: string[] = [];

  if (status !== "all") {
    params.push(status);
    where.push(`a.status = $${params.length}`);
  }
  if (filters.category) {
    params.push(filters.category);
    where.push(`a.category = $${params.length}`);
  }
  if (filters.tag) {
    params.push(filters.tag);
    where.push(`$${params.length} = ANY(a.tags)`);
  }
  if (filters.search && filters.search.trim()) {
    params.push(filters.search.trim());
    where.push(`a.search_vector @@ plainto_tsquery('simple', $${params.length})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit, offset);

  const sql = `
    SELECT ${buildLocaleSelectFields()}
    FROM blog_articles a
    LEFT JOIN blog_article_translations t
      ON t.article_id = a.id AND t.locale = $1
    ${whereSql}
    ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const { rows } = await dbQuery(sql, params);
  return rows.map(rowToSummary);
}

/**
 * Fetch one article by slug. Tries translation slug first, then canonical.
 */
export async function getBlogArticleBySlug(slug: string, locale?: string): Promise<BlogArticle | null> {
  const loc = locale || DEFAULT_LOCALE;

  const sql = `
    SELECT
      a.id,
      COALESCE(t.slug, a.slug)              AS slug,
      COALESCE(t.title, a.title)            AS title,
      COALESCE(t.excerpt, a.excerpt)        AS excerpt,
      COALESCE(t.body_mdx, a.body_mdx)      AS body_mdx,
      a.hero_image_url,
      a.hero_image_alt,
      a.category,
      a.tags,
      a.author_name,
      a.author_avatar,
      a.read_time_min,
      a.view_count,
      a.published_at,
      a.linked_product_ids,
      COALESCE(array_length(a.linked_product_ids, 1), 0) AS linked_product_count,
      COALESCE(t.seo_title, a.seo_title)               AS seo_title,
      COALESCE(t.seo_description, a.seo_description)   AS seo_description,
      a.seo_keywords,
      a.og_image_url
    FROM blog_articles a
    LEFT JOIN blog_article_translations t
      ON t.article_id = a.id AND t.locale = $2
    WHERE a.status = 'published'
      AND (a.slug = $1 OR t.slug = $1)
    LIMIT 1
  `;

  const { rows } = await dbQuery(sql, [slug, loc]);
  if (!rows.length) return null;
  const r = rows[0];

  return {
    ...rowToSummary(r),
    bodyMdx: String(r.body_mdx || ""),
    seoTitle: r.seo_title ?? null,
    seoDescription: r.seo_description ?? null,
    seoKeywords: Array.isArray(r.seo_keywords) ? r.seo_keywords : [],
    ogImageUrl: r.og_image_url ?? null,
    linkedProductIds: Array.isArray(r.linked_product_ids) ? r.linked_product_ids.map(String) : [],
  };
}

/**
 * Find articles that mention a given product. Used on product detail pages
 * to surface "Read more about this product".
 */
export async function listArticlesByProduct(productId: string, locale?: string, limit = 5): Promise<BlogArticleSummary[]> {
  const loc = locale || DEFAULT_LOCALE;
  const sql = `
    SELECT ${buildLocaleSelectFields()}
    FROM blog_articles a
    LEFT JOIN blog_article_translations t
      ON t.article_id = a.id AND t.locale = $1
    WHERE a.status = 'published'
      AND $2 = ANY(a.linked_product_ids)
    ORDER BY a.published_at DESC NULLS LAST
    LIMIT $3
  `;
  const { rows } = await dbQuery(sql, [loc, productId, Math.min(limit, 20)]);
  return rows.map(rowToSummary);
}

/**
 * Increment view count. Fire-and-forget from API; do not await UI render.
 */
export async function incrementArticleViews(articleId: string): Promise<void> {
  await dbQuery(
    `UPDATE blog_articles SET view_count = view_count + 1 WHERE id = $1`,
    [articleId],
  );
}

/**
 * Slugs only — for sitemap.xml generation. Cheap query, no joins.
 */
export async function listPublishedSlugs(locale?: string): Promise<Array<{ slug: string; updatedAt: string }>> {
  const loc = locale || DEFAULT_LOCALE;
  const sql = `
    SELECT COALESCE(t.slug, a.slug) AS slug,
           GREATEST(a.updated_at, COALESCE(t.updated_at, a.updated_at)) AS updated_at
    FROM blog_articles a
    LEFT JOIN blog_article_translations t
      ON t.article_id = a.id AND t.locale = $1
    WHERE a.status = 'published'
    ORDER BY a.published_at DESC NULLS LAST
  `;
  const { rows } = await dbQuery<{ slug: string; updated_at: string | Date }>(sql, [loc]);
  return rows.map((r) => ({
    slug: String(r.slug),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}
