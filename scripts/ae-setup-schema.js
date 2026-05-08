/**
 * 🏗️ CREEAZĂ TABELELE + IMPORTĂ CATEGORIILE (fără produse!)
 */
const crypto = require('crypto');
const { Client } = require('pg');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

function sign(params) {
  const sorted = Object.keys(params).filter(k => k !== 'sign').sort();
  return crypto.createHmac('sha256', APP_SECRET).update(sorted.map(k => k + params[k]).join('')).digest('hex').toUpperCase();
}
async function callAPI(method, extra = {}) {
  const params = { app_key: APP_KEY, method, sign_method: 'sha256', timestamp: Date.now().toString(), format: 'json', v: '2.0', session: TOKEN, ...extra };
  params.sign = sign(params);
  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return (await fetch('https://api-sg.aliexpress.com/sync?' + qs)).json();
}

const SCHEMA = `
-- =============================================
-- TABEL 1: CATEGORII (3 nivele)
-- =============================================
CREATE TABLE ae_categories (
  id SERIAL PRIMARY KEY,
  ae_category_id INT UNIQUE NOT NULL,
  parent_id INT REFERENCES ae_categories(ae_category_id),
  name VARCHAR(200) NOT NULL,
  name_ro VARCHAR(200),
  level INT NOT NULL,               -- 1=principal, 2=subcategorie, 3=sub-sub
  product_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cat_parent ON ae_categories(parent_id);
CREATE INDEX idx_cat_level ON ae_categories(level);

-- =============================================
-- TABEL 2: PRODUSE (detalii complete)
-- =============================================
CREATE TABLE ae_products (
  id SERIAL PRIMARY KEY,
  ae_product_id BIGINT UNIQUE NOT NULL,
  category_id INT NOT NULL REFERENCES ae_categories(ae_category_id),

  -- Titlu & Descriere
  title TEXT NOT NULL,
  title_ro TEXT,
  description TEXT,
  mobile_detail JSONB,

  -- Prețuri USD
  min_price_usd DECIMAL(10,2) NOT NULL,
  max_price_usd DECIMAL(10,2),
  original_price_usd DECIMAL(10,2),

  -- Prețul NOSTRU (RON cu markup)
  price_ron INT,
  old_price_ron INT,
  markup DECIMAL(3,1),

  -- Imagini & Video
  main_image TEXT,
  images TEXT[],
  video_url TEXT,
  video_poster TEXT,
  has_video BOOLEAN DEFAULT false,

  -- Rating & Vânzări
  rating DECIMAL(2,1),
  rating_count INT DEFAULT 0,
  orders_count INT DEFAULT 0,
  product_status VARCHAR(20) DEFAULT 'onSelling',

  -- Proprietăți
  brand VARCHAR(100),
  properties JSONB,

  -- Shipping România
  ship_method VARCHAR(100),
  ship_cost_usd DECIMAL(10,2) DEFAULT 0,
  ship_free BOOLEAN DEFAULT false,
  ship_days_min INT,
  ship_days_max INT,
  ship_tracking BOOLEAN DEFAULT false,
  ship_from VARCHAR(5) DEFAULT 'CN',

  -- Magazin
  store_id BIGINT,
  store_name VARCHAR(200),
  store_rating DECIMAL(2,1),

  -- Meta
  variants_count INT DEFAULT 1,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_prod_category ON ae_products(category_id);
CREATE INDEX idx_prod_price ON ae_products(price_ron);
CREATE INDEX idx_prod_orders ON ae_products(orders_count DESC NULLS LAST);
CREATE INDEX idx_prod_rating ON ae_products(rating DESC NULLS LAST);
CREATE INDEX idx_prod_video ON ae_products(has_video) WHERE has_video = true;
CREATE INDEX idx_prod_ship_free ON ae_products(ship_free) WHERE ship_free = true;

-- =============================================
-- TABEL 3: VARIANTE (SKU-uri per produs)
-- =============================================
CREATE TABLE ae_variants (
  id SERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES ae_products(ae_product_id),
  sku_id VARCHAR(30) NOT NULL,

  -- Preț
  price_usd DECIMAL(10,2) NOT NULL,
  original_price_usd DECIMAL(10,2),
  price_ron INT,

  -- Variantă
  variant_name VARCHAR(200),
  variant_image TEXT,
  stock INT DEFAULT 0,
  properties JSONB,

  UNIQUE(product_id, sku_id)
);
CREATE INDEX idx_var_product ON ae_variants(product_id);
`;

async function main() {
  console.log('='.repeat(80));
  console.log('  🏗️  CREARE TABELE + IMPORT CATEGORII');
  console.log('='.repeat(80));

  const db = new Client({ connectionString: NEON_URL });
  await db.connect();

  // Step 1: Create tables
  console.log('\n  📋 Creez cele 3 tabele...');
  await db.query(SCHEMA);
  console.log('  ✅ ae_categories — creat');
  console.log('  ✅ ae_products — creat');
  console.log('  ✅ ae_variants — creat');

  // Step 2: Pull categories from AliExpress
  console.log('\n  📂 Trag categoriile din AliExpress...');
  const data = await callAPI('aliexpress.ds.category.get', { category_id: '0' });
  const allCats = data.aliexpress_ds_category_get_response?.resp_result?.result?.categories?.category || [];
  console.log(`  📦 ${allCats.length} categorii primite\n`);

  // Separate levels
  const roots = allCats.filter(c => !c.parent_category_id);
  const children = allCats.filter(c => c.parent_category_id);

  // Find which children are parents of other children (level 2 vs 3)
  const parentIds = new Set(allCats.map(c => c.parent_category_id).filter(Boolean));
  const rootIds = new Set(roots.map(r => r.category_id));

  // Insert level 1 (roots)
  let inserted = 0;
  console.log('  📁 Nivel 1 — Categorii principale:');
  for (const r of roots.sort((a,b) => a.category_name.localeCompare(b.category_name))) {
    await db.query(
      'INSERT INTO ae_categories (ae_category_id, parent_id, name, level) VALUES ($1, NULL, $2, 1) ON CONFLICT DO NOTHING',
      [r.category_id, r.category_name]
    );
    inserted++;
  }
  console.log(`  ✅ ${inserted} categorii principale inserate`);

  // Insert level 2 (direct children of roots)
  let level2 = 0;
  console.log('\n  📂 Nivel 2 — Subcategorii:');
  for (const c of children) {
    if (rootIds.has(c.parent_category_id)) {
      await db.query(
        'INSERT INTO ae_categories (ae_category_id, parent_id, name, level) VALUES ($1, $2, $3, 2) ON CONFLICT DO NOTHING',
        [c.category_id, c.parent_category_id, c.category_name]
      );
      level2++;
    }
  }
  console.log(`  ✅ ${level2} subcategorii inserate`);

  // Insert level 3 (children of level 2)
  const level2Ids = new Set(children.filter(c => rootIds.has(c.parent_category_id)).map(c => c.category_id));
  let level3 = 0;
  console.log('\n  📄 Nivel 3 — Sub-subcategorii:');
  for (const c of children) {
    if (level2Ids.has(c.parent_category_id)) {
      await db.query(
        'INSERT INTO ae_categories (ae_category_id, parent_id, name, level) VALUES ($1, $2, $3, 3) ON CONFLICT DO NOTHING',
        [c.category_id, c.parent_category_id, c.category_name]
      );
      level3++;
    }
  }
  console.log(`  ✅ ${level3} sub-subcategorii inserate`);

  // Stats
  const { rows: stats } = await db.query(`
    SELECT level, COUNT(*) as cnt 
    FROM ae_categories 
    GROUP BY level ORDER BY level
  `);

  console.log('\n' + '='.repeat(80));
  console.log('  📊 REZULTAT FINAL');
  console.log('='.repeat(80));
  stats.forEach(s => {
    const label = s.level === 1 ? 'Principale' : s.level === 2 ? 'Subcategorii' : 'Sub-subcategorii';
    console.log(`  Nivel ${s.level} (${label}): ${s.cnt}`);
  });
  const { rows: total } = await db.query('SELECT COUNT(*) as cnt FROM ae_categories');
  console.log(`\n  📦 TOTAL CATEGORII: ${total[0].cnt}`);
  console.log(`  📋 Tabele: ae_categories ✅, ae_products ✅ (gol), ae_variants ✅ (gol)`);
  console.log('='.repeat(80));

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
