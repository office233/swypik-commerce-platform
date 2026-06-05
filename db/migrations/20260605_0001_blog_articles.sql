-- =====================================================================
-- Blog articles — SEO-driven content layer for Swypik
-- 
-- Schema:
--   blog_articles            : canonical content (one row per article)
--   blog_article_products    : N:M link to marketplace_products (inline cards)
--   blog_article_translations: i18n SEO content per locale (similar to product_translations)
--
-- Strategy:
--   - Body stored as MDX text (parsed at render time)
--   - <InlineProductCard productId="..."/> tags in MDX resolve to live product data
--   - linked_product_ids[] kept denormalized on blog_articles for fast "related"
--     queries, but blog_article_products is source of truth for analytics
--   - FTS via tsvector generated column (similar to product_translations FTS)
--
-- Owner: swypik_app (set after creation — see ALTER OWNER at bottom).
-- Idempotent. Safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS blog_articles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text        NOT NULL UNIQUE,
  locale          text        NOT NULL DEFAULT 'ro',
  -- Content
  title           text        NOT NULL,
  excerpt         text,
  body_mdx        text        NOT NULL,
  hero_image_url  text,
  hero_image_alt  text,
  -- Taxonomy
  category        text,                                   -- 'casa', 'tech', 'beauty', 'moda', 'fitness', 'animale', 'cadouri'
  tags            text[]      NOT NULL DEFAULT '{}',
  -- SEO
  seo_title       text,
  seo_description text,
  seo_keywords    text[]      NOT NULL DEFAULT '{}',
  og_image_url    text,
  -- Authorship
  author_name     text        NOT NULL DEFAULT 'Swypik Editorial',
  author_avatar   text,
  -- Product linking (denormalized for fast queries; FK source of truth = blog_article_products)
  linked_product_ids integer[] NOT NULL DEFAULT '{}',
  -- Workflow
  status          text        NOT NULL DEFAULT 'draft'    -- 'draft' | 'review' | 'published' | 'archived'
                              CHECK (status IN ('draft','review','published','archived')),
  -- Engagement (denormalized counters, updated by triggers/cron)
  view_count      integer     NOT NULL DEFAULT 0,
  read_time_min   integer     NOT NULL DEFAULT 5,
  -- Generator metadata
  generator       text,                                   -- 'manual' | 'claude-opus' | 'gpt-4' etc
  generator_meta  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Timestamps
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS blog_articles_published_idx
  ON blog_articles (locale, status, published_at DESC NULLS LAST)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS blog_articles_category_idx
  ON blog_articles (locale, category, published_at DESC NULLS LAST)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS blog_articles_tags_gin
  ON blog_articles USING GIN (tags);

CREATE INDEX IF NOT EXISTS blog_articles_linked_products_gin
  ON blog_articles USING GIN (linked_product_ids);

CREATE INDEX IF NOT EXISTS blog_articles_slug_idx
  ON blog_articles (slug);

-- FTS for search ("Caută articole...")
-- NOTE: We CANNOT use a GENERATED column here because array_to_string(tags, ' ')
-- is not IMMUTABLE in PostgreSQL. Maintained via trigger instead.
ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION tg_blog_articles_update_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.excerpt, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags, ' '), '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.category, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_articles_search_vector_update ON blog_articles;
CREATE TRIGGER blog_articles_search_vector_update
  BEFORE INSERT OR UPDATE OF title, excerpt, tags, category
  ON blog_articles
  FOR EACH ROW EXECUTE FUNCTION tg_blog_articles_update_search_vector();

CREATE INDEX IF NOT EXISTS blog_articles_search_idx
  ON blog_articles USING GIN (search_vector);

-- =====================================================================
-- N:M: article ↔ product (analytics + integrity)
-- =====================================================================
CREATE TABLE IF NOT EXISTS blog_article_products (
  article_id   uuid    NOT NULL REFERENCES blog_articles(id) ON DELETE CASCADE,
  product_id   integer NOT NULL,                          -- soft FK to marketplace_products(pg_id)
  position     integer NOT NULL DEFAULT 0,                -- order in article (0 = featured #1)
  variant      text    NOT NULL DEFAULT 'compact'         -- 'compact' | 'featured' | 'comparison'
                       CHECK (variant IN ('compact','featured','comparison')),
  click_count  integer NOT NULL DEFAULT 0,                -- analytics
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, product_id)
);

CREATE INDEX IF NOT EXISTS blog_article_products_product_idx
  ON blog_article_products (product_id);

CREATE INDEX IF NOT EXISTS blog_article_products_article_pos_idx
  ON blog_article_products (article_id, position);

-- =====================================================================
-- i18n translations (one row per locale; canonical stays in blog_articles)
-- =====================================================================
CREATE TABLE IF NOT EXISTS blog_article_translations (
  article_id      uuid        NOT NULL REFERENCES blog_articles(id) ON DELETE CASCADE,
  locale          text        NOT NULL,
  title           text        NOT NULL,
  excerpt         text,
  body_mdx        text        NOT NULL,
  slug            text,
  seo_title       text,
  seo_description text,
  source          text        NOT NULL DEFAULT 'llm',     -- 'manual' | 'llm' | 'admin'
  confidence      numeric(4,3),
  model_tag       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, locale)
);

CREATE INDEX IF NOT EXISTS blog_article_translations_locale_slug_idx
  ON blog_article_translations (locale, slug)
  WHERE slug IS NOT NULL;

-- =====================================================================
-- Triggers: touch updated_at
-- =====================================================================
CREATE OR REPLACE FUNCTION tg_blog_articles_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_articles_touch ON blog_articles;
CREATE TRIGGER blog_articles_touch
  BEFORE UPDATE ON blog_articles
  FOR EACH ROW EXECUTE FUNCTION tg_blog_articles_touch_updated_at();

DROP TRIGGER IF EXISTS blog_article_translations_touch ON blog_article_translations;
CREATE TRIGGER blog_article_translations_touch
  BEFORE UPDATE ON blog_article_translations
  FOR EACH ROW EXECUTE FUNCTION tg_blog_articles_touch_updated_at();

-- =====================================================================
-- Auto-sync: when a row is added/removed from blog_article_products,
-- keep blog_articles.linked_product_ids in sync (denormalized fast path).
-- =====================================================================
CREATE OR REPLACE FUNCTION tg_blog_articles_sync_linked_products()
RETURNS trigger AS $$
DECLARE
  target_article uuid;
BEGIN
  target_article := COALESCE(NEW.article_id, OLD.article_id);

  UPDATE blog_articles
  SET linked_product_ids = COALESCE((
    SELECT array_agg(product_id ORDER BY position, product_id)
    FROM blog_article_products
    WHERE article_id = target_article
  ), '{}'::integer[])
  WHERE id = target_article;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_article_products_sync ON blog_article_products;
CREATE TRIGGER blog_article_products_sync
  AFTER INSERT OR UPDATE OR DELETE ON blog_article_products
  FOR EACH ROW EXECUTE FUNCTION tg_blog_articles_sync_linked_products();

-- =====================================================================
-- Ownership: align with rest of app (swypik_app, non-superuser).
-- Pattern matches db/migrations/20260604_0001_matview_owner_swypik_app.sql
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'swypik_app') THEN
    EXECUTE 'ALTER TABLE blog_articles OWNER TO swypik_app';
    EXECUTE 'ALTER TABLE blog_article_products OWNER TO swypik_app';
    EXECUTE 'ALTER TABLE blog_article_translations OWNER TO swypik_app';
    EXECUTE 'ALTER FUNCTION tg_blog_articles_touch_updated_at() OWNER TO swypik_app';
    EXECUTE 'ALTER FUNCTION tg_blog_articles_sync_linked_products() OWNER TO swypik_app';
    EXECUTE 'ALTER FUNCTION tg_blog_articles_update_search_vector() OWNER TO swypik_app';
  END IF;
END $$;
