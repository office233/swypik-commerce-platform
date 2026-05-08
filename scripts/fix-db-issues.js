/**
 * FIX DB ISSUES — No API needed, instant fixes
 * 1. Clean aberrant prices
 * 2. Generate descriptions from category templates
 * 3. Set retail prices with dynamic markup
 */
const { Pool } = require("pg");
const pool = new Pool({ host:"localhost", port:5432, database:"aicevrei_products_cj", user:"postgres", password:"postgres" });

// ─── Add missing columns ─────────────────────────────────────────
async function addColumns() {
  console.log("📐 Adding missing columns...");
  const cols = [
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price_usd NUMERIC(10,2)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price_gbp NUMERIC(10,2)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS profit_margin_pct NUMERIC(5,2)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS shopify_variant_id BIGINT",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS push_error TEXT",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_filtered BOOLEAN DEFAULT FALSE",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS filter_reason TEXT",
  ];
  for (const sql of cols) {
    try { await pool.query(sql); } catch(e) {}
  }
  console.log("  ✅ Columns ready");
}

// ─── 1. Clean aberrant prices ─────────────────────────────────────
async function cleanPrices() {
  console.log("\n🧹 STEP 1: Cleaning aberrant prices...");
  
  // Flag products with crazy prices
  const r1 = await pool.query(`
    UPDATE products SET is_filtered = true, filter_reason = 'price_too_high'
    WHERE cost_usd > 500 AND (is_filtered IS NULL OR is_filtered = false)
  `);
  console.log("  Filtered price > $500: " + r1.rowCount);

  const r2 = await pool.query(`
    UPDATE products SET is_filtered = true, filter_reason = 'price_too_low'
    WHERE cost_usd < 0.50 AND (is_filtered IS NULL OR is_filtered = false)
  `);
  console.log("  Filtered price < $0.50: " + r2.rowCount);

  // Flag no-stock
  const r3 = await pool.query(`
    UPDATE products SET is_filtered = true, filter_reason = 'no_stock'
    WHERE total_stock <= 0 AND (is_filtered IS NULL OR is_filtered = false)
  `);
  console.log("  Filtered no stock: " + r3.rowCount);

  const { rows } = await pool.query("SELECT COUNT(*) as cnt FROM products WHERE is_filtered = false OR is_filtered IS NULL");
  console.log("  ✅ Remaining good products: " + rows[0].cnt);
}

// ─── 2. Generate descriptions ──────────────────────────────────────
const DESC_TEMPLATES = {
  "Women's Clothing": (t, cat) => `<div style="font-family:system-ui;color:#333"><h3>👗 ${t}</h3><p>Discover this stunning piece from our curated ${cat} collection. Designed with attention to detail, premium fabric quality, and a flattering silhouette that suits every body type.</p><ul><li>✨ Premium quality materials</li><li>📐 True-to-size fit</li><li>🚚 Fast worldwide shipping</li><li>↩️ 30-day hassle-free returns</li></ul><p><em>Model measurements may vary. Please refer to our size chart for the perfect fit.</em></p></div>`,
  
  "Jewelry & Watches": (t, cat) => `<div style="font-family:system-ui;color:#333"><h3>💎 ${t}</h3><p>Elevate your style with this exquisite piece from our ${cat} collection. Crafted with precision and designed to make a statement.</p><ul><li>✨ High-quality craftsmanship</li><li>💧 Tarnish-resistant finish</li><li>🎁 Gift-ready packaging</li><li>🚚 Fast worldwide shipping</li></ul><p><em>Colors may vary slightly due to screen settings.</em></p></div>`,

  "Home, Garden & Furniture": (t, cat) => `<div style="font-family:system-ui;color:#333"><h3>🏠 ${t}</h3><p>Transform your living space with this carefully selected ${cat} item. Combining functionality with modern aesthetics for the perfect home upgrade.</p><ul><li>🏗️ Durable construction</li><li>📐 Space-efficient design</li><li>🧹 Easy to clean & maintain</li><li>🚚 Secure packaging for safe delivery</li></ul></div>`,

  "Health, Beauty & Hair": (t, cat) => `<div style="font-family:system-ui;color:#333"><h3>✨ ${t}</h3><p>Enhance your beauty routine with this premium ${cat} product. Formulated with care for visible, long-lasting results.</p><ul><li>🌿 Carefully selected ingredients</li><li>🧪 Dermatologically considered</li><li>💧 Suitable for all skin types</li><li>🚚 Fast worldwide shipping</li></ul><p><em>⚠️ For external use only. Discontinue if irritation occurs.</em></p></div>`,

  "Men's Clothing": (t, cat) => `<div style="font-family:system-ui;color:#333"><h3>👔 ${t}</h3><p>Upgrade your wardrobe with this sharp piece from our ${cat} collection. Built for comfort, styled for confidence.</p><ul><li>✨ Premium fabric quality</li><li>📐 Modern, comfortable fit</li><li>🧺 Easy care instructions</li><li>🚚 Fast worldwide shipping</li></ul></div>`,

  "Bags & Shoes": (t, cat) => `<div style="font-family:system-ui;color:#333"><h3>👜 ${t}</h3><p>Complete your look with this stylish ${cat} piece. Combining fashion with function for everyday elegance.</p><ul><li>🏗️ Durable materials</li><li>📐 Practical design</li><li>✨ Versatile styling options</li><li>🚚 Fast worldwide shipping</li></ul></div>`,

  "Electronics": (t, cat) => `<div style="font-family:system-ui;color:#333"><h3>⚡ ${t}</h3><p>Stay connected with this cutting-edge ${cat} device. Engineered for performance and built to last.</p><ul><li>🔋 Reliable performance</li><li>🛡️ Quality tested</li><li>📦 Includes all accessories</li><li>🚚 Fast worldwide shipping</li></ul></div>`,

  "default": (t, cat) => `<div style="font-family:system-ui;color:#333"><h3>⭐ ${t}</h3><p>Discover the quality and value of this ${cat} product. Carefully selected for our store to deliver the best experience.</p><ul><li>✅ Quality assured</li><li>🚚 Fast worldwide shipping</li><li>↩️ 30-day returns</li><li>💬 Responsive customer support</li></ul></div>`
};

async function generateDescriptions() {
  console.log("\n📝 STEP 2: Generating descriptions...");
  
  const { rows } = await pool.query(
    "SELECT id, title, category FROM products WHERE description IS NULL AND (is_filtered = false OR is_filtered IS NULL)"
  );
  console.log("  Products needing descriptions: " + rows.length);

  let updated = 0;
  const batch = [];
  
  for (const p of rows) {
    const mainCat = (p.category || "").split(" > ")[0];
    const subCat = (p.category || "").split(" > ").slice(1).join(" > ") || mainCat;
    const templateFn = DESC_TEMPLATES[mainCat] || DESC_TEMPLATES["default"];
    const desc = templateFn(p.title, subCat);
    
    batch.push(pool.query("UPDATE products SET description = $1 WHERE id = $2", [desc, p.id]));
    updated++;
    
    // Batch 500 at a time
    if (batch.length >= 500) {
      await Promise.all(batch);
      batch.length = 0;
      process.stdout.write("  " + updated + "... ");
    }
  }
  if (batch.length > 0) await Promise.all(batch);
  console.log("\n  ✅ Descriptions generated: " + updated);
}

// ─── 3. Set retail prices ──────────────────────────────────────────
async function setRetailPrices() {
  console.log("\n💰 STEP 3: Setting retail prices (GBP)...");
  
  // Dynamic markup based on cost
  // USD to GBP rough rate: 0.79
  const USD_TO_GBP = 0.79;
  
  const result = await pool.query(`
    UPDATE products SET
      retail_price_usd = CASE
        WHEN cost_usd < 2 THEN ROUND(cost_usd * 4.5, 2)
        WHEN cost_usd < 5 THEN ROUND(cost_usd * 3.5, 2)
        WHEN cost_usd < 15 THEN ROUND(cost_usd * 3.0, 2)
        WHEN cost_usd < 50 THEN ROUND(cost_usd * 2.5, 2)
        WHEN cost_usd < 100 THEN ROUND(cost_usd * 2.2, 2)
        ELSE ROUND(cost_usd * 2.0, 2)
      END,
      retail_price_gbp = CASE
        WHEN cost_usd < 2 THEN ROUND(cost_usd * 4.5 * ${USD_TO_GBP}, 2)
        WHEN cost_usd < 5 THEN ROUND(cost_usd * 3.5 * ${USD_TO_GBP}, 2)
        WHEN cost_usd < 15 THEN ROUND(cost_usd * 3.0 * ${USD_TO_GBP}, 2)
        WHEN cost_usd < 50 THEN ROUND(cost_usd * 2.5 * ${USD_TO_GBP}, 2)
        WHEN cost_usd < 100 THEN ROUND(cost_usd * 2.2 * ${USD_TO_GBP}, 2)
        ELSE ROUND(cost_usd * 2.0 * ${USD_TO_GBP}, 2)
      END,
      profit_margin_pct = CASE
        WHEN cost_usd < 2 THEN 78
        WHEN cost_usd < 5 THEN 71
        WHEN cost_usd < 15 THEN 67
        WHEN cost_usd < 50 THEN 60
        WHEN cost_usd < 100 THEN 55
        ELSE 50
      END
    WHERE (is_filtered = false OR is_filtered IS NULL)
      AND (retail_price_gbp IS NULL OR retail_price_gbp = 0)
  `);
  console.log("  ✅ Prices set for " + result.rowCount + " products");

  // Show price distribution after markup
  const dist = await pool.query(`
    SELECT
      COUNT(CASE WHEN retail_price_gbp < 5 THEN 1 END) as under_5,
      COUNT(CASE WHEN retail_price_gbp >= 5 AND retail_price_gbp < 15 THEN 1 END) as range_5_15,
      COUNT(CASE WHEN retail_price_gbp >= 15 AND retail_price_gbp < 30 THEN 1 END) as range_15_30,
      COUNT(CASE WHEN retail_price_gbp >= 30 AND retail_price_gbp < 50 THEN 1 END) as range_30_50,
      COUNT(CASE WHEN retail_price_gbp >= 50 THEN 1 END) as over_50,
      ROUND(AVG(retail_price_gbp)::numeric, 2) as avg_retail,
      ROUND(AVG(profit_margin_pct)::numeric, 1) as avg_margin
    FROM products WHERE is_filtered = false OR is_filtered IS NULL
  `);
  const d = dist.rows[0];
  console.log("\n  📊 Retail Price Distribution (GBP):");
  console.log("    < £5:     " + d.under_5);
  console.log("    £5-15:    " + d.range_5_15);
  console.log("    £15-30:   " + d.range_15_30);
  console.log("    £30-50:   " + d.range_30_50);
  console.log("    > £50:    " + d.over_50);
  console.log("    Avg:      £" + d.avg_retail);
  console.log("    Avg margin: " + d.avg_margin + "%");
}

// ─── FINAL SUMMARY ────────────────────────────────────────────────
async function summary() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM products) as total,
      (SELECT COUNT(*) FROM products WHERE is_filtered = false OR is_filtered IS NULL) as good,
      (SELECT COUNT(*) FROM products WHERE is_filtered = true) as filtered,
      (SELECT COUNT(*) FROM products WHERE description IS NOT NULL) as has_desc,
      (SELECT COUNT(*) FROM products WHERE retail_price_gbp > 0) as has_retail,
      (SELECT COUNT(*) FROM products WHERE pushed_to_shopify = true) as pushed
  `);
  const s = rows[0];
  console.log("\n" + "═".repeat(60));
  console.log("📊 FINAL STATUS");
  console.log("═".repeat(60));
  console.log("  Total products:    " + s.total);
  console.log("  ✅ Good (pushable): " + s.good);
  console.log("  ❌ Filtered out:    " + s.filtered);
  console.log("  📝 Has description: " + s.has_desc);
  console.log("  💰 Has retail price:" + s.has_retail);
  console.log("  🛒 Pushed Shopify:  " + s.pushed);

  // Filtered reasons
  const reasons = await pool.query("SELECT filter_reason, COUNT(*) as cnt FROM products WHERE is_filtered = true GROUP BY filter_reason ORDER BY cnt DESC");
  if (reasons.rows.length > 0) {
    console.log("\n  Filter reasons:");
    reasons.rows.forEach(r => console.log("    " + r.filter_reason + ": " + r.cnt));
  }
}

// ─── MAIN ──────────────────────────────────────────────────────────
async function main() {
  console.log("═".repeat(60));
  console.log("🔧 FIX DB ISSUES — Instant Fixes (No API needed)");
  console.log("═".repeat(60));

  await addColumns();
  await cleanPrices();
  await generateDescriptions();
  await setRetailPrices();
  await summary();

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
