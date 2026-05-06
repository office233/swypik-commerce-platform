-- ═══════════════════════════════════════════════════════════════════
-- AICeVrei.ro — CJ Dropshipping Product Database
-- Schema v2.0 — Multi-country shipping + real pricing
-- ═══════════════════════════════════════════════════════════════════

-- 1. CATEGORIES — CJ category tree (3 levels)
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  cj_category_id VARCHAR(200) UNIQUE NOT NULL,
  name_en VARCHAR(300) NOT NULL,
  name_ro VARCHAR(300),
  parent_en VARCHAR(300),
  parent_category_id VARCHAR(200),
  level INTEGER DEFAULT 3,        -- 1=main, 2=sub, 3=leaf
  product_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cat_parent ON categories(parent_category_id);
CREATE INDEX idx_cat_level ON categories(level);

-- 2. COUNTRIES — Target markets
CREATE TABLE countries (
  id SERIAL PRIMARY KEY,
  code VARCHAR(5) UNIQUE NOT NULL,    -- ISO: RO, DE, US
  name VARCHAR(100) NOT NULL,
  region VARCHAR(50) NOT NULL,        -- EU, NA, UK, MENA, APAC, LATAM, AF
  vat_percent NUMERIC(5,2) DEFAULT 0, -- 19.00 for RO, 0 for US
  ioss_required BOOLEAN DEFAULT FALSE,
  currency VARCHAR(5) NOT NULL,       -- EUR, USD, GBP, AED, RON
  exchange_rate_to_usd NUMERIC(10,4) DEFAULT 1.0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-populate countries
INSERT INTO countries (code, name, region, vat_percent, ioss_required, currency, exchange_rate_to_usd) VALUES
  -- EU (IOSS required, TVA varies)
  ('RO', 'Romania', 'EU', 19.00, true, 'RON', 0.22),
  ('DE', 'Germany', 'EU', 19.00, true, 'EUR', 1.08),
  ('FR', 'France', 'EU', 20.00, true, 'EUR', 1.08),
  ('IT', 'Italy', 'EU', 22.00, true, 'EUR', 1.08),
  ('ES', 'Spain', 'EU', 21.00, true, 'EUR', 1.08),
  ('NL', 'Netherlands', 'EU', 21.00, true, 'EUR', 1.08),
  ('BE', 'Belgium', 'EU', 21.00, true, 'EUR', 1.08),
  ('AT', 'Austria', 'EU', 20.00, true, 'EUR', 1.08),
  ('PL', 'Poland', 'EU', 23.00, true, 'PLN', 0.25),
  ('CZ', 'Czech Republic', 'EU', 21.00, true, 'CZK', 0.043),
  ('HU', 'Hungary', 'EU', 27.00, true, 'HUF', 0.0027),
  ('BG', 'Bulgaria', 'EU', 20.00, true, 'BGN', 0.55),
  ('HR', 'Croatia', 'EU', 25.00, true, 'EUR', 1.08),
  ('GR', 'Greece', 'EU', 24.00, true, 'EUR', 1.08),
  ('PT', 'Portugal', 'EU', 23.00, true, 'EUR', 1.08),
  ('SE', 'Sweden', 'EU', 25.00, true, 'SEK', 0.095),
  ('DK', 'Denmark', 'EU', 25.00, true, 'DKK', 0.145),
  ('FI', 'Finland', 'EU', 24.00, true, 'EUR', 1.08),
  ('IE', 'Ireland', 'EU', 23.00, true, 'EUR', 1.08),
  ('SK', 'Slovakia', 'EU', 20.00, true, 'EUR', 1.08),
  -- Non-EU Europe
  ('UK', 'United Kingdom', 'UK', 20.00, false, 'GBP', 1.27),
  -- North America
  ('US', 'United States', 'NA', 0, false, 'USD', 1.0),
  ('CA', 'Canada', 'NA', 5.00, false, 'CAD', 0.74),
  -- Middle East
  ('AE', 'UAE / Dubai', 'MENA', 5.00, false, 'AED', 0.27),
  ('SA', 'Saudi Arabia', 'MENA', 15.00, false, 'SAR', 0.27),
  ('IL', 'Israel', 'MENA', 17.00, false, 'ILS', 0.28),
  ('TR', 'Turkey', 'MENA', 20.00, false, 'TRY', 0.031),
  -- Asia-Pacific
  ('AU', 'Australia', 'APAC', 10.00, false, 'AUD', 0.66),
  ('JP', 'Japan', 'APAC', 10.00, false, 'JPY', 0.0067),
  ('KR', 'South Korea', 'APAC', 10.00, false, 'KRW', 0.00074);

-- 3. PRODUCTS — Core product data
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  cj_pid VARCHAR(100) UNIQUE NOT NULL,
  cj_sku VARCHAR(100),
  title TEXT NOT NULL,
  title_ro TEXT,
  description TEXT,
  
  -- Category
  category_id INTEGER REFERENCES categories(id),
  category VARCHAR(300),
  
  -- Price
  cost_usd NUMERIC(10,2) NOT NULL,
  
  -- Physical (from product/query - enrichment phase)
  weight_g NUMERIC(8,2),
  packing_weight_g NUMERIC(8,2),
  weight_band VARCHAR(20),           -- '0-50', '50-100', '100-200', etc.
  material VARCHAR(300),
  
  -- Images
  main_image TEXT,
  images TEXT[],
  image_count INTEGER DEFAULT 0,
  
  -- Stats
  variant_count INTEGER DEFAULT 0,
  total_stock INTEGER DEFAULT 0,
  listed_count INTEGER DEFAULT 0,    -- popularity on CJ
  
  -- Processing status
  weight_fetched BOOLEAN DEFAULT FALSE,
  variants_fetched BOOLEAN DEFAULT FALSE,
  pushed_to_shopify BOOLEAN DEFAULT FALSE,
  shopify_id BIGINT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prod_category ON products(category);
CREATE INDEX idx_prod_weight_band ON products(weight_band);
CREATE INDEX idx_prod_cost ON products(cost_usd);
CREATE INDEX idx_prod_listed ON products(listed_count DESC);
CREATE INDEX idx_prod_shopify ON products(pushed_to_shopify);
CREATE INDEX idx_prod_weight_fetched ON products(weight_fetched);

-- 4. VARIANTS — Product variants (color, size, model)
CREATE TABLE variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  cj_vid VARCHAR(100) UNIQUE NOT NULL,   -- CRITICAL: needed for orders!
  cj_variant_sku VARCHAR(100),
  variant_name TEXT,
  variant_image TEXT,
  price_usd NUMERIC(10,2),
  stock INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_var_product ON variants(product_id);
CREATE INDEX idx_var_vid ON variants(cj_vid);

-- 5. SHIPPING_RATES — Real CJ prices per weight band × country
-- This is the MAGIC TABLE — only ~240 rows but covers ALL products
CREATE TABLE shipping_rates (
  id SERIAL PRIMARY KEY,
  country_code VARCHAR(5) NOT NULL REFERENCES countries(code),
  weight_band VARCHAR(20) NOT NULL,
  
  -- Cheapest method
  cheapest_method VARCHAR(100),
  cheapest_shipping_usd NUMERIC(10,2),
  cheapest_total_usd NUMERIC(10,2),   -- includes clearance fees
  cheapest_days VARCHAR(20),
  
  -- Fastest method
  fastest_method VARCHAR(100),
  fastest_shipping_usd NUMERIC(10,2),
  fastest_total_usd NUMERIC(10,2),
  fastest_days VARCHAR(20),
  
  -- All methods (JSONB array)
  all_methods JSONB,
  methods_count INTEGER DEFAULT 0,
  
  -- Meta
  sample_vid VARCHAR(100),            -- which variant was used to sample
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(country_code, weight_band)
);

CREATE INDEX idx_ship_country ON shipping_rates(country_code);
CREATE INDEX idx_ship_band ON shipping_rates(weight_band);

-- 6. Helper VIEW — Product with pricing for any country
CREATE OR REPLACE VIEW product_pricing AS
SELECT 
  p.id,
  p.cj_pid,
  p.title,
  p.category,
  p.cost_usd,
  p.weight_band,
  p.main_image,
  p.image_count,
  p.listed_count,
  c.code AS country_code,
  c.name AS country_name,
  c.currency,
  c.vat_percent,
  c.ioss_required,
  s.cheapest_shipping_usd,
  s.cheapest_total_usd,
  s.cheapest_days,
  s.cheapest_method,
  s.methods_count,
  -- Calculated pricing
  ROUND(p.cost_usd + COALESCE(s.cheapest_total_usd, s.cheapest_shipping_usd, 5.0), 2) AS total_cost_usd,
  ROUND((p.cost_usd + COALESCE(s.cheapest_total_usd, s.cheapest_shipping_usd, 5.0)) * (1 + c.vat_percent/100), 2) AS total_with_vat_usd
FROM products p
CROSS JOIN countries c
LEFT JOIN shipping_rates s ON s.country_code = c.code AND s.weight_band = p.weight_band;

-- Summary
DO $$ BEGIN
  RAISE NOTICE '✅ Schema created: categories, countries (30), products, variants, shipping_rates, product_pricing VIEW';
END $$;
