const { Pool } = require("pg");
const pool = new Pool({ host:"localhost", port:5432, database:"aicevrei_products_cj", user:"postgres", password:"postgres" });

async function audit() {
  try {
    // 1. List tables
    const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    console.log("=== TABLES ===");
    tables.rows.forEach(r => console.log("  " + r.tablename));

    // 2. Product count
    const cnt = await pool.query("SELECT COUNT(*) as total FROM products");
    console.log("\n=== PRODUCTS: " + cnt.rows[0].total + " ===");

    // 3. Column info
    const cols = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='products' ORDER BY ordinal_position");
    console.log("\n=== PRODUCT COLUMNS ===");
    cols.rows.forEach(c => console.log("  " + c.column_name.padEnd(25) + c.data_type.padEnd(25) + (c.is_nullable==="YES"?"NULL":"NOT NULL")));

    // 4. Sample products (first 3)
    const samples = await pool.query("SELECT * FROM products ORDER BY id LIMIT 3");
    console.log("\n=== SAMPLE PRODUCTS (3) ===");
    for (const p of samples.rows) {
      console.log(JSON.stringify(p, null, 2));
      console.log("---");
    }

    // 5. Data completeness
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN title IS NOT NULL AND title != '' THEN 1 END) as has_title,
        COUNT(CASE WHEN main_image IS NOT NULL AND main_image != '' THEN 1 END) as has_image,
        COUNT(CASE WHEN cost_usd > 0 THEN 1 END) as has_price,
        COUNT(CASE WHEN cj_sku IS NOT NULL AND cj_sku != '' THEN 1 END) as has_sku,
        COUNT(CASE WHEN images IS NOT NULL THEN 1 END) as has_images_arr,
        COUNT(CASE WHEN category IS NOT NULL THEN 1 END) as has_category,
        COUNT(CASE WHEN weight_band IS NOT NULL THEN 1 END) as has_weight,
        COUNT(CASE WHEN total_stock > 0 THEN 1 END) as has_stock,
        ROUND(AVG(cost_usd)::numeric, 2) as avg_cost,
        ROUND(MIN(cost_usd)::numeric, 2) as min_cost,
        ROUND(MAX(cost_usd)::numeric, 2) as max_cost,
        ROUND(AVG(image_count)::numeric, 1) as avg_images
      FROM products
    `);
    console.log("\n=== DATA COMPLETENESS ===");
    const s = stats.rows[0];
    Object.entries(s).forEach(([k,v]) => {
      const pct = k.startsWith("has_") ? " (" + Math.round(v/s.total*100) + "%)" : "";
      console.log("  " + k.padEnd(20) + String(v) + pct);
    });

    // 6. Categories breakdown
    const cats = await pool.query("SELECT category, COUNT(*) as cnt FROM products GROUP BY category ORDER BY cnt DESC LIMIT 25");
    console.log("\n=== TOP 25 CATEGORIES ===");
    cats.rows.forEach(c => console.log("  " + String(c.cnt).padStart(6) + " | " + (c.category || "NULL")));

    // 7. Price distribution
    const priceDist = await pool.query(`
      SELECT
        COUNT(CASE WHEN cost_usd < 1 THEN 1 END) as under_1,
        COUNT(CASE WHEN cost_usd >= 1 AND cost_usd < 5 THEN 1 END) as range_1_5,
        COUNT(CASE WHEN cost_usd >= 5 AND cost_usd < 15 THEN 1 END) as range_5_15,
        COUNT(CASE WHEN cost_usd >= 15 AND cost_usd < 50 THEN 1 END) as range_15_50,
        COUNT(CASE WHEN cost_usd >= 50 AND cost_usd < 100 THEN 1 END) as range_50_100,
        COUNT(CASE WHEN cost_usd >= 100 THEN 1 END) as over_100
      FROM products
    `);
    console.log("\n=== PRICE DISTRIBUTION (USD) ===");
    const pd = priceDist.rows[0];
    console.log("  < $1:        " + pd.under_1);
    console.log("  $1-5:        " + pd.range_1_5);
    console.log("  $5-15:       " + pd.range_5_15);
    console.log("  $15-50:      " + pd.range_15_50);
    console.log("  $50-100:     " + pd.range_50_100);
    console.log("  > $100:      " + pd.over_100);

    // 8. Check pushed_to_shopify
    try {
      const pushed = await pool.query("SELECT COUNT(*) as cnt FROM products WHERE pushed_to_shopify = true");
      console.log("\n=== PUSHED TO SHOPIFY: " + pushed.rows[0].cnt + " ===");
    } catch(e) {
      console.log("\n=== Column pushed_to_shopify: DOES NOT EXIST ===");
    }

    // 9. Categories table
    try {
      const catCount = await pool.query("SELECT COUNT(*) as cnt FROM categories");
      const catSample = await pool.query("SELECT * FROM categories LIMIT 5");
      console.log("\n=== CATEGORIES TABLE: " + catCount.rows[0].cnt + " rows ===");
      catSample.rows.forEach(c => console.log("  " + JSON.stringify(c)));
    } catch(e) {
      console.log("\n=== CATEGORIES TABLE ERROR: " + e.message + " ===");
    }

    // 10. Shipping rates
    try {
      const shipCount = await pool.query("SELECT COUNT(*) as cnt FROM shipping_rates");
      console.log("\n=== SHIPPING RATES: " + shipCount.rows[0].cnt + " rows ===");
    } catch(e) {
      console.log("\n=== SHIPPING RATES TABLE: DOES NOT EXIST ===");
    }

    // 11. Problems check
    console.log("\n=== POTENTIAL PROBLEMS ===");
    const noImg = await pool.query("SELECT COUNT(*) as cnt FROM products WHERE main_image IS NULL OR main_image = ''");
    const noPrice = await pool.query("SELECT COUNT(*) as cnt FROM products WHERE cost_usd <= 0 OR cost_usd IS NULL");
    const noTitle = await pool.query("SELECT COUNT(*) as cnt FROM products WHERE title IS NULL OR title = ''");
    const dupes = await pool.query("SELECT cj_pid, COUNT(*) as cnt FROM products GROUP BY cj_pid HAVING COUNT(*) > 1 LIMIT 5");
    console.log("  No image:    " + noImg.rows[0].cnt);
    console.log("  No price:    " + noPrice.rows[0].cnt);
    console.log("  No title:    " + noTitle.rows[0].cnt);
    console.log("  Duplicates:  " + dupes.rows.length + " found");
    if (dupes.rows.length > 0) dupes.rows.forEach(d => console.log("    PID " + d.cj_pid + " x" + d.cnt));

  } catch(e) {
    console.error("DB Error:", e.message);
  }
  await pool.end();
}
audit();
