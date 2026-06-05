-- Migration: blog_keyword_candidates
-- Tabel pentru keyword research bazat pe Google Autocomplete (RO + EN)
-- Folosit de blog-keyword-research.mjs (writer) si blog-discover-topics.mjs (reader)

CREATE TABLE IF NOT EXISTS blog_keyword_candidates (
  id                       UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword                  TEXT NOT NULL,
  locale                   TEXT NOT NULL CHECK (locale IN ('ro','en','es','fr','de','pt','it')),
  source                   TEXT NOT NULL CHECK (source IN ('google_autocomplete','people_also_ask','manual','seed_expansion')),
  parent_category          TEXT,                                 -- ex: "Igienă dentară" sau "Dental care"
  seed_query               TEXT,                                 -- prefixul care a generat (ex: "cele mai bune")
  autocomplete_position    INTEGER,                              -- pozitia in lista Google (1-10)
  commercial_intent_score  INTEGER NOT NULL DEFAULT 0,           -- 0-100, calculat de script (cuvinte: best/top/review/buy)
  product_supply_score     INTEGER NOT NULL DEFAULT 0,           -- 0-100, cate produse din catalog match
  composite_score          INTEGER NOT NULL DEFAULT 0,           -- 0-1000, final pentru sortare
  matched_product_count    INTEGER NOT NULL DEFAULT 0,           -- numar produse curate care matcheaza
  matched_category_count   INTEGER NOT NULL DEFAULT 0,           -- numar categorii care matcheaza
  discovered_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at             TIMESTAMPTZ NOT NULL DEFAULT now(),   -- update la fiecare run
  used_at                  TIMESTAMPTZ,                          -- NULL daca neutilizat
  used_article_id          UUID REFERENCES blog_articles(id) ON DELETE SET NULL,
  notes                    JSONB NOT NULL DEFAULT '{}'::jsonb,   -- extra meta (related queries, etc)
  CONSTRAINT blog_keyword_candidates_unique UNIQUE (keyword, locale)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS blog_keyword_candidates_score_idx
  ON blog_keyword_candidates (locale, composite_score DESC, last_seen_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS blog_keyword_candidates_category_idx
  ON blog_keyword_candidates (locale, parent_category, composite_score DESC);

CREATE INDEX IF NOT EXISTS blog_keyword_candidates_used_idx
  ON blog_keyword_candidates (used_at DESC NULLS LAST)
  WHERE used_at IS NOT NULL;

-- Comments
COMMENT ON TABLE  blog_keyword_candidates IS 'Keyword candidates from Google Autocomplete for blog topic generation (real demand-driven, not supply-driven).';
COMMENT ON COLUMN blog_keyword_candidates.commercial_intent_score IS '0-100. Higher = clear commercial intent (best/top/review/buy/vs).';
COMMENT ON COLUMN blog_keyword_candidates.product_supply_score    IS '0-100. Higher = we have many matching quality products in catalog.';
COMMENT ON COLUMN blog_keyword_candidates.composite_score         IS '0-1000. Final ranking: commercial_intent * autocomplete_position_bonus * product_supply.';
