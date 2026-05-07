/**
 * Migrate local PostgreSQL → Neon Cloud
 * Uses Node.js pg driver for reliable SSL connection
 */
const { Pool: LocalPool } = require("pg");
const { Pool: NeonPool } = require("pg");

const LOCAL = new LocalPool({
  host: "localhost", port: 5432,
  database: "aicevrei_products_cj",
  user: "postgres", password: "postgres",
});

const NEON = new NeonPool({
  connectionString: "postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function main() {
  console.log("═".repeat(60));
  console.log("🚀 MIGRATE: Local PostgreSQL → Neon Cloud");
  console.log("═".repeat(60));

  // 1. Create tables on Neon
  console.log("\n📋 Step 1: Creating tables on Neon...");
  await NEON.query(`
    DROP TABLE IF EXISTS variants CASCADE;
    DROP TABLE IF EXISTS products CASCADE;
    DROP TABLE IF EXISTS shipping_rates CASCADE;
    DROP TABLE IF EXISTS categories CASCADE;
  `);

  await NEON.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      cj_category_id VARCHAR(200) NOT NULL UNIQUE,
      name_en VARCHAR(300) NOT NULL,
      name_ro VARCHAR(300),
      parent_en VARCHAR(300),
      parent_category_id VARCHAR(200),
      level INTEGER DEFAULT 3,
      product_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cat_level ON categories(level);
    CREATE INDEX IF NOT EXISTS idx_cat_parent ON categories(parent_category_id);
  `);

  await NEON.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      cj_pid VARCHAR(100) NOT NULL UNIQUE,
      cj_sku VARCHAR(100),
      title TEXT NOT NULL,
      title_ro TEXT,
      description TEXT,
      category_id INTEGER REFERENCES categories(id),
      category VARCHAR(300),
      cost_usd NUMERIC(10,2) NOT NULL,
      weight_g NUMERIC(8,2),
      packing_weight_g NUMERIC(8,2),
      weight_band VARCHAR(20),
      material VARCHAR(300),
      main_image TEXT,
      images TEXT[],
      image_count INTEGER DEFAULT 0,
      variant_count INTEGER DEFAULT 0,
      total_stock INTEGER DEFAULT 0,
      listed_count INTEGER DEFAULT 0,
      weight_fetched BOOLEAN DEFAULT false,
      variants_fetched BOOLEAN DEFAULT false,
      pushed_to_shopify BOOLEAN DEFAULT false,
      shopify_id BIGINT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      retail_price_usd NUMERIC(10,2),
      retail_price_gbp NUMERIC(10,2),
      profit_margin_pct NUMERIC(5,2),
      shopify_variant_id BIGINT,
      push_error TEXT,
      pushed_at TIMESTAMPTZ,
      is_filtered BOOLEAN DEFAULT false,
      filter_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_prod_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_prod_cost ON products(cost_usd);
    CREATE INDEX IF NOT EXISTS idx_prod_listed ON products(listed_count DESC);
    CREATE INDEX IF NOT EXISTS idx_prod_shopify ON products(pushed_to_shopify);
    CREATE INDEX IF NOT EXISTS idx_prod_weight_band ON products(weight_band);
  `);

  await NEON.query(`
    CREATE TABLE IF NOT EXISTS shipping_rates (
      id SERIAL PRIMARY KEY,
      country_code VARCHAR(5) NOT NULL,
      weight_band VARCHAR(20) NOT NULL,
      provider VARCHAR(100),
      cheapest_shipping_usd VARCHAR(20),
      cheapest_total_usd VARCHAR(20),
      delivery_days VARCHAR(20),
      fetched_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(country_code, weight_band)
    );
  `);

  await NEON.query(`
    CREATE TABLE IF NOT EXISTS variants (
      id SERIAL PRIMARY KEY,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      cj_vid VARCHAR(100),
      name TEXT,
      name_en TEXT,
      sku VARCHAR(200),
      pid VARCHAR(100),
      color VARCHAR(100),
      size VARCHAR(100),
      volume NUMERIC(10,2),
      weight NUMERIC(10,2),
      stock INTEGER DEFAULT 0,
      image TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("  ✅ Tables created");

  // 2. Migrate categories
  console.log("\n📂 Step 2: Migrating categories...");
  const { rows: cats } = await LOCAL.query("SELECT * FROM categories WHERE name_en IS NOT NULL ORDER BY id");
  let catOk = 0;
  for (const c of cats) {
    try {
      await NEON.query(
        `INSERT INTO categories (id, cj_category_id, name_en, name_ro, parent_en, parent_category_id, level, product_count, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [c.id, c.cj_category_id, c.name_en, c.name_ro, c.parent_en, c.parent_category_id, c.level, c.product_count, c.created_at]
      );
      catOk++;
    } catch (e) { /* skip bad rows */ }
  }
  if (catOk > 0) await NEON.query(`SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories))`);
  console.log(`  ✅ ${catOk}/${cats.length} categories migrated`);

  // 3. Migrate shipping rates
  console.log("\n🚚 Step 3: Migrating shipping rates...");
  const { rows: rates } = await LOCAL.query("SELECT * FROM shipping_rates ORDER BY id");
  for (const r of rates) {
    await NEON.query(
      `INSERT INTO shipping_rates (country_code, weight_band, provider, cheapest_shipping_usd, cheapest_total_usd, delivery_days, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [r.country_code, r.weight_band, r.provider, r.cheapest_shipping_usd, r.cheapest_total_usd, r.delivery_days, r.fetched_at]
    );
  }
  console.log(`  ✅ ${rates.length} shipping rates migrated`);

  // 4. Migrate products in batches
  console.log("\n📦 Step 4: Migrating products (109k)...");
  const { rows: countRows } = await LOCAL.query("SELECT COUNT(*) as c FROM products");
  const total = parseInt(countRows[0].c);
  console.log(`  Total: ${total} products`);

  const BATCH = 500;
  let migrated = 0;
  const startTime = Date.now();

  for (let offset = 0; offset < total; offset += BATCH) {
    const { rows: products } = await LOCAL.query(
      `SELECT * FROM products ORDER BY id LIMIT $1 OFFSET $2`, [BATCH, offset]
    );

    // Build batch insert
    const values = [];
    const placeholders = [];
    let paramIdx = 1;

    for (const p of products) {
      const vals = [
        p.id, p.cj_pid, p.cj_sku, p.title, p.title_ro, p.description,
        p.category_id, p.category, p.cost_usd, p.weight_g, p.packing_weight_g,
        p.weight_band, p.material, p.main_image, p.images, p.image_count,
        p.variant_count, p.total_stock, p.listed_count, p.weight_fetched,
        p.variants_fetched, false, null, // pushed_to_shopify = false, shopify_id = null
        p.created_at, p.updated_at, p.retail_price_usd, p.retail_price_gbp,
        p.profit_margin_pct, null, p.push_error, p.pushed_at, // shopify_variant_id = null
        p.is_filtered, p.filter_reason
      ];
      const ph = vals.map(() => `$${paramIdx++}`);
      placeholders.push(`(${ph.join(",")})`);
      values.push(...vals);
    }

    await NEON.query(
      `INSERT INTO products (id, cj_pid, cj_sku, title, title_ro, description,
        category_id, category, cost_usd, weight_g, packing_weight_g,
        weight_band, material, main_image, images, image_count,
        variant_count, total_stock, listed_count, weight_fetched,
        variants_fetched, pushed_to_shopify, shopify_id,
        created_at, updated_at, retail_price_usd, retail_price_gbp,
        profit_margin_pct, shopify_variant_id, push_error, pushed_at,
        is_filtered, filter_reason)
       VALUES ${placeholders.join(",")} ON CONFLICT (cj_pid) DO NOTHING`,
      values
    );

    migrated += products.length;
    if (migrated % 5000 === 0 || migrated === total) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const rate = Math.round(migrated / ((Date.now() - startTime) / 1000));
      console.log(`  📊 ${migrated}/${total} (${elapsed} min, ~${rate}/s)`);
    }
  }

  // Fix sequence
  await NEON.query(`SELECT setval('products_id_seq', (SELECT MAX(id) FROM products))`);
  console.log(`  ✅ ${migrated} products migrated!`);

  // 5. Verify
  console.log("\n✅ Step 5: Verification...");
  const verify = await NEON.query("SELECT COUNT(*) as c FROM products WHERE main_image IS NOT NULL");
  console.log(`  Products with images: ${verify.rows[0].c}`);

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ MIGRATION COMPLETE in ${elapsed} minutes!`);
  console.log("═".repeat(60));

  await LOCAL.end();
  await NEON.end();
}

main().catch(e => { console.error(e); process.exit(1); });
