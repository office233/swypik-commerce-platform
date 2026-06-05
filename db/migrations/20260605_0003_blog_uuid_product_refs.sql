-- =====================================================================
-- 20260605_0003 — Blog: convert product_id references INTEGER -> UUID
--
-- The marketplace_products table uses UUID primary keys (no integer
-- surrogate). Migrations 0001/0002 wrongly assumed an integer pg_id.
--
-- Safe because:
--   * blog_articles is currently empty (0 published, 0 draft).
--   * No production data depends on linked_product_ids[] yet.
--
-- We rebuild only the two affected columns + their trigger/index/FK,
-- preserving everything else (FTS, search_vector, translations, etc.).
-- =====================================================================

BEGIN;

-- --- 1. Drop dependent objects on the integer columns ---
DROP INDEX IF EXISTS blog_articles_linked_products_gin;
DROP INDEX IF EXISTS blog_article_products_product_idx;
DROP TRIGGER IF EXISTS blog_article_products_sync ON blog_article_products;

-- --- 2. Truncate the join + denormalized array (empty anyway, but be explicit) ---
TRUNCATE TABLE blog_article_products;
UPDATE blog_articles SET linked_product_ids = '{}'::integer[] WHERE linked_product_ids <> '{}'::integer[];

-- --- 3. Convert column types ---
ALTER TABLE blog_articles
  ALTER COLUMN linked_product_ids DROP DEFAULT,
  ALTER COLUMN linked_product_ids TYPE uuid[]
    USING '{}'::uuid[],
  ALTER COLUMN linked_product_ids SET DEFAULT '{}'::uuid[],
  ALTER COLUMN linked_product_ids SET NOT NULL;

ALTER TABLE blog_article_products
  ALTER COLUMN product_id TYPE uuid USING gen_random_uuid();
-- NOTE: USING gen_random_uuid() is safe here because the table is empty.

-- --- 4. Add real FK to marketplace_products(id) for integrity ---
ALTER TABLE blog_article_products
  ADD CONSTRAINT blog_article_products_product_fk
  FOREIGN KEY (product_id) REFERENCES marketplace_products(id) ON DELETE CASCADE;

-- --- 5. Recreate indexes ---
CREATE INDEX IF NOT EXISTS blog_articles_linked_products_gin
  ON blog_articles USING GIN (linked_product_ids);

CREATE INDEX IF NOT EXISTS blog_article_products_product_idx
  ON blog_article_products (product_id);

-- --- 6. Recreate the sync trigger with uuid[] ---
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
  ), '{}'::uuid[])
  WHERE id = target_article;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_article_products_sync ON blog_article_products;
CREATE TRIGGER blog_article_products_sync
  AFTER INSERT OR UPDATE OR DELETE ON blog_article_products
  FOR EACH ROW EXECUTE FUNCTION tg_blog_articles_sync_linked_products();

-- --- 7. Ownership (idempotent) ---
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'swypik_app') THEN
    EXECUTE 'ALTER FUNCTION tg_blog_articles_sync_linked_products() OWNER TO swypik_app';
  END IF;
END $$;

COMMIT;
