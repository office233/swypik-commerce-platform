import { dbQuery } from "@/lib/db";

export type VideoResult = {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  playback_url: string | null;
  creator_id: string | null;
  creator_name: string | null;
  like_count: number;
  view_count: number;
  rank: number;
};

export type CreatorResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  follower_count: number;
};

export type ProductResult = {
  id: string;
  title: string | null;
  price_cents: number | null;
  image_url: string | null;
  rank: number;
};


export type HashtagResult = {
  tag: string;
  video_count: number;
};

export type SearchOpts = {
  limit?: number;
  offset?: number;
  userId?: string | null;
  locale?: string;
};

const clampLimit = (n: number | undefined, max = 50, def = 20) => {
  const v = Number.isFinite(n) ? Number(n) : def;
  return Math.max(1, Math.min(max, v));
};

const clampOffset = (n: number | undefined) => {
  const v = Number.isFinite(n) ? Number(n) : 0;
  return Math.max(0, v);
};

/**
 * Full-text search over videos.search_document (tsvector).
 */
export async function searchVideos(
  q: string,
  opts: SearchOpts = {}
): Promise<VideoResult[]> {
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);

  const sql = `
    WITH query AS (
      SELECT websearch_to_tsquery('simple', public.f_unaccent($1)) AS tsq,
             public.f_unaccent(lower($1)) AS qn
    )
    SELECT
      v.id::text                     AS id,
      v.title                        AS title,
      v.thumbnail_url                AS thumbnail_url,
      v.playback_url                 AS playback_url,
      v.creator_id::text             AS creator_id,
      COALESCE(u.display_name, u.username) AS creator_name,
      COALESCE(v.like_count, 0)::int       AS like_count,
      COALESCE(v.view_count, 0)::int       AS view_count,
      GREATEST(
        ts_rank_cd(v.search_document, query.tsq),
        similarity(public.f_unaccent(lower(coalesce(v.title, ''))), query.qn)
      )::float AS rank
    FROM videos v
    LEFT JOIN users u ON u.id = v.creator_id
    CROSS JOIN query
    WHERE v.status = 'ready'
      AND v.visibility = 'public'
      AND COALESCE(v.is_hidden, false) = false
      AND v.effective_label = 'safe'
      AND (
        v.search_document @@ query.tsq
        OR similarity(public.f_unaccent(lower(coalesce(v.title, ''))), query.qn) > 0.2
      )
    ORDER BY rank DESC, v.like_count DESC NULLS LAST, v.published_at DESC NULLS LAST
    LIMIT $2 OFFSET $3
  `;

  const { rows } = await dbQuery(sql, [q, limit, offset]);
  return rows as VideoResult[];
}

/**
 * Creator search via trigram similarity / ILIKE on username + display_name.
 * Uses pg_trgm similarity when available; falls back to ILIKE ordering.
 */
export async function searchCreators(
  q: string,
  opts: SearchOpts = {}
): Promise<CreatorResult[]> {
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);

  const pattern = `%${q}%`;
  const prefix = `${q}%`;

  // Prefer trigram similarity if pg_trgm is installed; the operator `%`
  // requires the extension. We compute a similarity score and ORDER BY it.
  // creator_profiles is optional — LEFT JOIN with COALESCE.
  const sql = `
    SELECT
      u.id::text          AS id,
      u.username          AS username,
      u.display_name      AS display_name,
      u.avatar_url        AS avatar_url,
      u.bio               AS bio,
      COALESCE(f.followers, 0)::int AS follower_count
    FROM users u
    LEFT JOIN creator_profiles cp ON cp.user_id = u.id
    LEFT JOIN (SELECT following_user_id, COUNT(*) AS followers FROM follows GROUP BY 1) f ON f.following_user_id = u.id
    WHERE u.username       ILIKE $1
       OR u.display_name   ILIKE $1
    ORDER BY
      CASE
        WHEN u.username     ILIKE $2 THEN 0
        WHEN u.display_name ILIKE $2 THEN 1
        ELSE 2
      END,
      GREATEST(
        similarity(COALESCE(u.username, ''),     $3),
        similarity(COALESCE(u.display_name, ''), $3)
      ) DESC,
      COALESCE(f.followers, 0) DESC
    LIMIT $4 OFFSET $5
  `;

  try {
    const { rows } = await dbQuery(sql, [pattern, prefix, q, limit, offset]);
    return rows as CreatorResult[];
  } catch {
    // Fallback if creator_profiles table or similarity() is missing.
    const fallback = `
      SELECT
        u.id::text     AS id,
        u.username     AS username,
        u.display_name AS display_name,
        u.avatar_url   AS avatar_url,
        u.bio          AS bio,
        0::int         AS follower_count
      FROM users u
      WHERE u.username     ILIKE $1
         OR u.display_name ILIKE $1
      ORDER BY
        CASE
          WHEN u.username     ILIKE $2 THEN 0
          WHEN u.display_name ILIKE $2 THEN 1
          ELSE 2
        END,
        u.username ASC
      LIMIT $3 OFFSET $4
    `;
    const { rows } = await dbQuery(fallback, [pattern, prefix, limit, offset]);
    return rows as CreatorResult[];
  }
}

/**
 * Product search — locale-aware FTS over product_translations.
 *
 * Why product_translations (not marketplace_products)?
 *   marketplace_products.search_document is built from the original English
 *   AliExpress title/description. So "husa" (Romanian for "phone case")
 *   matched ZERO products even though we have 83 cases in the catalog
 *   visible as "Husă pentru iPhone…" through the RO translation.
 *
 *   product_translations has 152k rows per locale (ro/en/es/fr/de/pt/it),
 *   each with its own search_document tsvector (see migration
 *   20260527_0002_product_translations_fts.sql). Searching there gives us
 *   native-language matches in the user's locale, falling back to EN for
 *   any product missing a translation in that locale.
 *
 * Strategy:
 *   1. FTS hit in pt(locale)  →  rank 1.0 + ts_rank
 *   2. FTS hit in pt(en)      →  rank 0.7 + ts_rank  (so EN-only catalog rows still surface)
 *   3. Trigram similarity on the localized title for typo tolerance
 *   4. taxonomy slug match (covers "rochie" → fashion-women-dresses) as a tiebreaker
 *
 * The slug expansion that existed in the prior version is kept but no longer
 * the load-bearing path; it only adds a small rank boost when titles also hit.
 */
export async function searchProducts(
  q: string,
  opts: SearchOpts = {}
): Promise<ProductResult[]> {
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);
  const locale = (opts.locale || 'ro').toLowerCase();

  // Cross-language taxonomy slug expansion (rank boost only).
  let matchedSlugs: string[] = [];
  try {
    const { rows: slugRows } = await dbQuery<{ node_slug: string }>(
      `WITH q AS (SELECT public.f_unaccent(lower($1)) AS qn)
       SELECT DISTINCT node_slug
         FROM taxonomy_translations, q
        WHERE locale IN ('ro','de','fr','en','es','pt','it')
          AND char_length(qn) >= 3
          AND (
            public.f_unaccent(lower(label)) LIKE qn || '%'
            OR qn LIKE public.f_unaccent(lower(label)) || '%'
            OR public.f_unaccent(lower(label)) LIKE '%' || qn || '%'
            OR word_similarity(qn, public.f_unaccent(lower(label))) > 0.65
          )
        LIMIT 50`,
      [q]
    );
    matchedSlugs = slugRows.map((r) => r.node_slug);
  } catch {}

  // Main query: search product_translations (target locale + EN fallback),
  // join back to marketplace_products to apply visibility/safety filters.
  const ftsSql = `
    WITH query AS (
      SELECT websearch_to_tsquery('simple', public.f_unaccent($1)) AS tsq,
             public.f_unaccent(lower($1)) AS qn
    ),
    hits AS (
      -- Target-locale FTS hits (highest weight)
      SELECT pt.product_id,
             ts_rank_cd(pt.search_document, query.tsq) AS r,
             1.0::float AS locale_boost
        FROM product_translations pt
        CROSS JOIN query
       WHERE pt.locale = $5
         AND pt.search_document @@ query.tsq
      UNION ALL
      -- English fallback FTS hits (so EN-only entries still surface)
      SELECT pt.product_id,
             ts_rank_cd(pt.search_document, query.tsq) AS r,
             0.7::float AS locale_boost
        FROM product_translations pt
        CROSS JOIN query
       WHERE pt.locale = 'en'
         AND $5 <> 'en'
         AND pt.search_document @@ query.tsq
      UNION ALL
      -- Trigram similarity on the target-locale title (typo tolerance).
      -- Cheap because of the trigram GIN; only triggered when FTS missed.
      SELECT pt.product_id,
             similarity(public.f_unaccent(lower(coalesce(pt.title, ''))), query.qn) AS r,
             0.9::float AS locale_boost
        FROM product_translations pt
        CROSS JOIN query
       WHERE pt.locale = $5
         AND char_length(query.qn) >= 3
         AND similarity(public.f_unaccent(lower(coalesce(pt.title, ''))), query.qn) > 0.3
    ),
    ranked AS (
      SELECT product_id, MAX(r * locale_boost) AS rank
        FROM hits
       GROUP BY product_id
    )
    SELECT
      mp.id::text                                              AS id,
      COALESCE(pt_target.title, pt_en.title, mp.title)         AS title,
      mp.price_cents                                           AS price_cents,
      mp.image_url                                             AS image_url,
      (ranked.rank
        + CASE WHEN mp.taxonomy_node_slug = ANY($4::text[]) THEN 0.05 ELSE 0 END
      )::float                                                 AS rank
    FROM ranked
    JOIN marketplace_products mp ON mp.id = ranked.product_id
    LEFT JOIN product_translations pt_target ON pt_target.product_id = mp.id AND pt_target.locale = $5
    LEFT JOIN product_translations pt_en     ON pt_en.product_id     = mp.id AND pt_en.locale     = 'en'
   WHERE mp.status = 'active'
     AND COALESCE(mp.is_adult, false) = false
     AND mp.effective_label = 'safe'
   ORDER BY rank DESC
   LIMIT $2 OFFSET $3
  `;

  try {
    const { rows } = await dbQuery(ftsSql, [q, limit, offset, matchedSlugs, locale]);
    if (rows.length > 0) return rows as ProductResult[];
    // Fall through to ILIKE if FTS returned 0 — covers very short queries
    // and edge cases where tsquery parsing gave us an empty tsq.
  } catch {
    // Schema drift safety net — fall through to ILIKE.
  }

  const pattern = `%${q}%`;
  const ilikeSql = `
    SELECT
      mp.id::text     AS id,
      COALESCE(pt_target.title, pt_en.title, mp.title) AS title,
      mp.price_cents  AS price_cents,
      mp.image_url    AS image_url,
      0::float        AS rank
    FROM marketplace_products mp
    LEFT JOIN product_translations pt_target
      ON pt_target.product_id = mp.id AND pt_target.locale = $4
    LEFT JOIN product_translations pt_en
      ON pt_en.product_id = mp.id     AND pt_en.locale = 'en'
    WHERE mp.status = 'active'
      AND COALESCE(mp.is_adult, false) = false
      AND mp.effective_label = 'safe'
      AND (
        COALESCE(pt_target.title, '') ILIKE $1
        OR COALESCE(pt_en.title, '')   ILIKE $1
        OR mp.title                    ILIKE $1
      )
    ORDER BY mp.title ASC
    LIMIT $2 OFFSET $3
  `;
  const { rows } = await dbQuery(ilikeSql, [pattern, limit, offset, locale]);
  return rows as ProductResult[];
}



/**
 * Hashtag search: aggregates over videos.tags array. Strips leading '#' and matches case-insensitive prefix.
 */
export async function searchHashtags(
  q: string,
  opts: SearchOpts = {}
): Promise<HashtagResult[]> {
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);
  const cleaned = q.replace(/^#+/, "").trim();
  if (!cleaned) return [];
  const pattern = cleaned + "%";
  const pattern2 = "%" + cleaned + "%";

  const sql = `
    SELECT
      lower(tag)            AS tag,
      COUNT(*)::int         AS video_count
    FROM videos v, unnest(v.tags) AS tag
    WHERE v.status = 'ready'
      AND v.visibility = 'public'
      AND COALESCE(v.is_hidden, false) = false
      AND v.effective_label = 'safe'
      AND (lower(tag) ILIKE $1 OR lower(tag) ILIKE $2)
    GROUP BY lower(tag)
    ORDER BY
      CASE WHEN lower(tag) ILIKE $1 THEN 0 ELSE 1 END,
      video_count DESC,
      lower(tag) ASC
    LIMIT $3 OFFSET $4
  `;
  try {
    const { rows } = await dbQuery(sql, [pattern, pattern2, limit, offset]);
    return rows as HashtagResult[];
  } catch {
    return [];
  }
}

export async function searchAll(
  q: string,
  opts: SearchOpts = {}
): Promise<{
  videos: VideoResult[];
  creators: CreatorResult[];
  products: ProductResult[];
  hashtags: HashtagResult[];
}> {
  // Per-tab fanout cap. Note: locale MUST be forwarded so searchProducts
  // can query the right product_translations row; previously it defaulted
  // to 'ro' which broke EN searches.
  const fanOpts: SearchOpts = {
    limit: 10,
    offset: 0,
    userId: opts.userId,
    locale: opts.locale,
  };
  const [videos, creators, products, hashtags] = await Promise.all([
    searchVideos(q, fanOpts).catch(() => [] as VideoResult[]),
    searchCreators(q, fanOpts).catch(() => [] as CreatorResult[]),
    searchProducts(q, fanOpts).catch(() => [] as ProductResult[]),
    searchHashtags(q, fanOpts).catch(() => [] as HashtagResult[]),
  ]);
  return { videos, creators, products, hashtags };
}
