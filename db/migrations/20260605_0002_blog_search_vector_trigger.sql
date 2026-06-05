-- Fix for 20260605_0001: search_vector generation expression failed because
-- array_to_string() is not IMMUTABLE in PostgreSQL. Switch to trigger-based
-- maintenance (same pattern used elsewhere in Swypik when arrays feed FTS).
--
-- Idempotent. Safe to re-run.

ALTER TABLE blog_articles DROP COLUMN IF EXISTS search_vector;
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

-- Backfill any existing rows
UPDATE blog_articles SET title = title WHERE search_vector IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'swypik_app') THEN
    EXECUTE 'ALTER FUNCTION tg_blog_articles_update_search_vector() OWNER TO swypik_app';
  END IF;
END $$;
