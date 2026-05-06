-- ═══════════════════════════════════════════════════════════════════
-- AICeVrei.ro — AliExpress / DSers Product Database
-- Schema v1.0 — Optimized for OTAPI AliExpress provider
-- Database: aicevrei_products_dser
-- ═══════════════════════════════════════════════════════════════════

-- 1. CATEGORIES — AliExpress category tree (3 levels)
CREATE TABLE categories (
  id              SERIAL PRIMARY KEY,
  ae_category_id  VARCHAR(200) UNIQUE NOT NULL,   -- ex: ae-200000345
  name_en         VARCHAR(300) NOT NULL,
  name_ro         VARCHAR(300),
  parent_en       VARCHAR(300),
  parent_category_id VARCHAR(200),
  level           INTEGER DEFAULT 1,               -- 1=root, 2=sub, 3=leaf
  product_count   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cat_parent ON categories(parent_category_id);
CREATE INDEX idx_cat_level ON categories(level);

-- 2. COUNTRIES — Target markets (same as CJ, already proven)
CREATE TABLE countries (
  id                    SERIAL PRIMARY KEY,
  code                  VARCHAR(5) UNIQUE NOT NULL,
  name                  VARCHAR(100) NOT NULL,
  region                VARCHAR(50) NOT NULL,        -- EU, NA, UK, MENA, APAC
  vat_percent           NUMERIC(5,2) DEFAULT 0,
  ioss_required         BOOLEAN DEFAULT FALSE,
  currency              VARCHAR(5) NOT NULL,
  exchange_rate_to_usd  NUMERIC(10,4) DEFAULT 1.0,
  active                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-populate countries
INSERT INTO countries (code, name, region, vat_percent, ioss_required, currency, exchange_rate_to_usd) VALUES
  -- EU (IOSS required)
  ('RO', 'Romania',        'EU',   19.00, true,  'RON', 0.22),
  ('DE', 'Germany',        'EU',   19.00, true,  'EUR', 1.08),
  ('FR', 'France',         'EU',   20.00, true,  'EUR', 1.08),
  ('IT', 'Italy',          'EU',   22.00, true,  'EUR', 1.08),
  ('ES', 'Spain',          'EU',   21.00, true,  'EUR', 1.08),
  ('NL', 'Netherlands',    'EU',   21.00, true,  'EUR', 1.08),
  ('BE', 'Belgium',        'EU',   21.00, true,  'EUR', 1.08),
  ('AT', 'Austria',        'EU',   20.00, true,  'EUR', 1.08),
  ('PL', 'Poland',         'EU',   23.00, true,  'PLN', 0.25),
  ('CZ', 'Czech Republic', 'EU',   21.00, true,  'CZK', 0.043),
  ('HU', 'Hungary',        'EU',   27.00, true,  'HUF', 0.0027),
  ('BG', 'Bulgaria',       'EU',   20.00, true,  'BGN', 0.55),
  ('HR', 'Croatia',        'EU',   25.00, true,  'EUR', 1.08),
  ('GR', 'Greece',         'EU',   24.00, true,  'EUR', 1.08),
  ('PT', 'Portugal',       'EU',   23.00, true,  'EUR', 1.08),
  ('SE', 'Sweden',         'EU',   25.00, true,  'SEK', 0.095),
  ('DK', 'Denmark',        'EU',   25.00, true,  'DKK', 0.145),
  ('FI', 'Finland',        'EU',   24.00, true,  'EUR', 1.08),
  ('IE', 'Ireland',        'EU',   23.00, true,  'EUR', 1.08),
  ('SK', 'Slovakia',       'EU',   20.00, true,  'EUR', 1.08),
  -- Non-EU Europe
  ('UK', 'United Kingdom', 'UK',   20.00, false, 'GBP', 1.27),
  -- North America
  ('US', 'United States',  'NA',    0,    false, 'USD', 1.0),
  ('CA', 'Canada',         'NA',    5.00, false, 'CAD', 0.74),
  -- Middle East
  ('AE', 'UAE / Dubai',    'MENA',  5.00, false, 'AED', 0.27),
  ('SA', 'Saudi Arabia',   'MENA', 15.00, false, 'SAR', 0.27),
  ('IL', 'Israel',         'MENA', 17.00, false, 'ILS', 0.28),
  ('TR', 'Turkey',         'MENA', 20.00, false, 'TRY', 0.031),
  -- Asia-Pacific
  ('AU', 'Australia',      'APAC', 10.00, false, 'AUD', 0.66),
  ('JP', 'Japan',          'APAC', 10.00, false, 'JPY', 0.0067),
  ('KR', 'South Korea',    'APAC', 10.00, false, 'KRW', 0.00074);

-- 3. PRODUCTS — Core AliExpress product data
CREATE TABLE products (
  id                SERIAL PRIMARY KEY,

  -- ─── AliExpress Identifiers ────────────────────────────────────
  aliexpress_id     VARCHAR(100) UNIQUE NOT NULL,     -- ex: 1005009101414334
  aliexpress_url    TEXT,                              -- full URL to product page

  -- ─── Basic Info ────────────────────────────────────────────────
  title             TEXT NOT NULL,
  title_ro          TEXT,                              -- translated title
  description       TEXT,                              -- HTML description (from detail call)

  -- ─── Category ──────────────────────────────────────────────────
  category_id       INTEGER REFERENCES categories(id),
  category_name     VARCHAR(300),                      -- denormalized for speed

  -- ─── Pricing (all in USD) ──────────────────────────────────────
  price_usd         NUMERIC(10,2) NOT NULL,            -- regular price
  promotion_price_usd NUMERIC(10,2),                   -- sale/promo price (often lower!)
  delivery_price_usd  NUMERIC(10,2) DEFAULT 0,         -- AliExpress delivery cost (usually 0 = free)
  cost_usd          NUMERIC(10,2),                     -- effective cost = min(price, promo) + delivery

  -- ─── Physical ──────────────────────────────────────────────────
  weight_g          NUMERIC(8,2),                      -- actual weight (rarely available from AE)
  weight_band       VARCHAR(20),                       -- estimated: '0-50', '50-100', '100-200', etc.
  material          VARCHAR(300),                      -- from Attributes

  -- ─── Media ─────────────────────────────────────────────────────
  main_image        TEXT,                              -- MainPictureUrl (full res)
  images            TEXT[],                            -- up to 6 Large URLs (600x600)
  image_count       INTEGER DEFAULT 0,
  video_url         TEXT,                              -- MP4 video URL (from detail call)
  video_thumbnail   TEXT,                              -- video preview image

  -- ─── Stats & Social Proof ─────────────────────────────────────
  total_sales       INTEGER DEFAULT 0,                 -- TotalSales
  rating            NUMERIC(3,2) DEFAULT 0,            -- 0.00-5.00
  reviews_count     INTEGER DEFAULT 0,
  favorites_count   INTEGER DEFAULT 0,
  master_quantity   INTEGER DEFAULT 0,                 -- total stock from seller

  -- ─── Vendor ────────────────────────────────────────────────────
  vendor_id         VARCHAR(100),                      -- ae-xxx
  vendor_name       VARCHAR(300),
  vendor_score      NUMERIC(5,2) DEFAULT 0,

  -- ─── Processing Flags ──────────────────────────────────────────
  detail_fetched    BOOLEAN DEFAULT FALSE,             -- BatchGetItemFullInfo done?
  variants_fetched  BOOLEAN DEFAULT FALSE,
  pushed_to_shopify BOOLEAN DEFAULT FALSE,
  shopify_id        BIGINT,

  -- ─── Quality Flags ─────────────────────────────────────────────
  is_expired        BOOLEAN DEFAULT FALSE,             -- Features contains 'Expired'
  is_fake_quantity  BOOLEAN DEFAULT FALSE,             -- Features contains 'FakeQuantity'
  is_incomplete     BOOLEAN DEFAULT FALSE,             -- Features contains 'Incomplete'
  quality_score     INTEGER DEFAULT 50,                -- 0-100 AI quality score

  -- ─── Timestamps ────────────────────────────────────────────────
  ae_updated_at     TIMESTAMPTZ,                       -- LastUpdatedTime from AE
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_prod_category    ON products(category_id);
CREATE INDEX idx_prod_cat_name    ON products(category_name);
CREATE INDEX idx_prod_price       ON products(cost_usd);
CREATE INDEX idx_prod_promo       ON products(promotion_price_usd);
CREATE INDEX idx_prod_sales       ON products(total_sales DESC);
CREATE INDEX idx_prod_rating      ON products(rating DESC);
CREATE INDEX idx_prod_quality     ON products(quality_score DESC);
CREATE INDEX idx_prod_shopify     ON products(pushed_to_shopify);
CREATE INDEX idx_prod_detail      ON products(detail_fetched);
CREATE INDEX idx_prod_weight_band ON products(weight_band);
CREATE INDEX idx_prod_vendor      ON products(vendor_id);
-- Composite: find best products fast
CREATE INDEX idx_prod_best ON products(quality_score DESC, total_sales DESC) WHERE NOT is_expired AND NOT is_incomplete;

-- 4. VARIANTS — Product variants (color × size combinations)
CREATE TABLE variants (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER REFERENCES products(id) ON DELETE CASCADE,
  ae_variant_id   VARCHAR(100) UNIQUE NOT NULL,        -- ConfiguredItems[].Id
  variant_name    TEXT,                                 -- "Pink / L"
  variant_image   TEXT,                                 -- Attributes[].ImageUrl per color
  price_usd       NUMERIC(10,2),
  stock           INTEGER DEFAULT 0,                   -- ConfiguredItems[].Quantity
  color           VARCHAR(100),
  size            VARCHAR(50),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_var_product ON variants(product_id);
CREATE INDEX idx_var_color   ON variants(color);

-- 5. PRODUCT_ATTRIBUTES — Extra attributes per product (material, season, etc.)
CREATE TABLE product_attributes (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER REFERENCES products(id) ON DELETE CASCADE,
  attribute_name  VARCHAR(200) NOT NULL,
  attribute_value VARCHAR(500) NOT NULL,
  is_configurator BOOLEAN DEFAULT FALSE,               -- true = color/size selector
  image_url       TEXT,                                 -- some attributes have images
  UNIQUE(product_id, attribute_name, attribute_value)
);

CREATE INDEX idx_attr_product ON product_attributes(product_id);
CREATE INDEX idx_attr_name    ON product_attributes(attribute_name);

-- 6. SHIPPING_ESTIMATES — Estimated shipping per weight band (static, no API needed)
CREATE TABLE shipping_estimates (
  id              SERIAL PRIMARY KEY,
  weight_band     VARCHAR(20) NOT NULL,
  country_code    VARCHAR(5) NOT NULL REFERENCES countries(code),
  estimate_usd    NUMERIC(10,2) NOT NULL,
  estimate_days   VARCHAR(20),                         -- "15-25"
  method          VARCHAR(100) DEFAULT 'AliExpress Standard',
  notes           TEXT,
  UNIQUE(weight_band, country_code)
);

CREATE INDEX idx_ship_band    ON shipping_estimates(weight_band);
CREATE INDEX idx_ship_country ON shipping_estimates(country_code);

-- Pre-populate shipping estimates for Romania (main market)
INSERT INTO shipping_estimates (weight_band, country_code, estimate_usd, estimate_days, method) VALUES
  ('0-50',      'RO', 0.00,  '15-25', 'AliExpress Free Shipping'),
  ('50-100',    'RO', 0.00,  '15-25', 'AliExpress Free Shipping'),
  ('100-200',   'RO', 0.00,  '15-30', 'AliExpress Free Shipping'),
  ('200-500',   'RO', 1.50,  '15-30', 'AliExpress Standard'),
  ('500-1000',  'RO', 3.00,  '20-35', 'AliExpress Standard'),
  ('1000-2000', 'RO', 5.00,  '20-40', 'AliExpress Standard'),
  ('2000-5000', 'RO', 8.00,  '25-45', 'AliExpress Standard'),
  ('5000+',     'RO', 15.00, '30-50', 'AliExpress Standard');

-- 7. VIEW — Best products with calculated pricing
CREATE OR REPLACE VIEW product_catalog AS
SELECT
  p.id,
  p.aliexpress_id,
  p.aliexpress_url,
  p.title,
  p.category_name,
  p.price_usd,
  p.promotion_price_usd,
  COALESCE(p.promotion_price_usd, p.price_usd) AS effective_price_usd,
  p.delivery_price_usd,
  COALESCE(p.cost_usd, COALESCE(p.promotion_price_usd, p.price_usd) + COALESCE(p.delivery_price_usd, 0)) AS total_cost_usd,
  p.main_image,
  p.image_count,
  p.video_url,
  p.total_sales,
  p.rating,
  p.reviews_count,
  p.favorites_count,
  p.vendor_name,
  p.quality_score,
  p.weight_band,
  p.is_expired,
  p.detail_fetched,
  p.pushed_to_shopify
FROM products p
WHERE NOT p.is_expired
  AND NOT p.is_incomplete
  AND p.quality_score >= 40
ORDER BY p.quality_score DESC, p.total_sales DESC;

-- Summary
DO $$ BEGIN
  RAISE NOTICE '✅ Schema aicevrei_products_dser created:';
  RAISE NOTICE '   • categories (AliExpress tree)';
  RAISE NOTICE '   • countries (30 markets)';
  RAISE NOTICE '   • products (AliExpress optimized)';
  RAISE NOTICE '   • variants (color × size)';
  RAISE NOTICE '   • product_attributes (material, season, etc.)';
  RAISE NOTICE '   • shipping_estimates (per weight band)';
  RAISE NOTICE '   • product_catalog VIEW (best products)';
END $$;
