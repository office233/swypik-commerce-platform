/**
 * Fix old products: update category_id from AliExpress API
 * Targets products with category_id >= 900000000 (filename-based)
 */
import crypto from "crypto";
import pg from "pg";

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';
const DB_URL = 'postgresql://postgres@localhost:5432/swypik';

function sign(params) {
  const sorted = Object.keys(params).filter(k => k !== 'sign').sort();
  return crypto.createHmac('sha256', APP_SECRET).update(sorted.map(k => k + params[k]).join('')).digest('hex').toUpperCase();
}

async function callAPI(method, extra = {}) {
  const params = { app_key: APP_KEY, method, sign_method: 'sha256', timestamp: Date.now().toString(), format: 'json', v: '2.0', session: TOKEN, ...extra };
  params.sign = sign(params);
  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const resp = await fetch('https://api-sg.aliexpress.com/sync?' + qs);
  return resp.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const pool = new pg.Pool({ connectionString: DB_URL });
  const c = await pool.connect();

  // Get old products with filename-based categories
  const { rows: oldProducts } = await c.query(
    `SELECT ae_product_id FROM ae_products WHERE category_id >= 900000000 ORDER BY id`
  );
  console.log(`🔧 Fixing ${oldProducts.length} products with old filename-based categories\n`);

  // Category cache
  const knownCategories = new Set();
  const { rows: existingCats } = await c.query(`SELECT ae_category_id FROM ae_categories`);
  existingCats.forEach(r => knownCategories.add(r.ae_category_id));

  let fixed = 0, failed = 0, requestCount = 0;

  for (const row of oldProducts) {
    const productId = row.ae_product_id;
    
    // Rate limiting
    requestCount++;
    if (requestCount % 50 === 0) {
      console.log(`  ⏸️ Pause 5s after ${requestCount} requests...`);
      await sleep(5000);
    }

    try {
      const data = await callAPI('aliexpress.ds.product.get', {
        product_id: productId.toString(),
        target_currency: 'USD',
        target_language: 'EN',
        ship_to_country: 'RO',
      });

      const result = data?.aliexpress_ds_product_get_response?.result;
      const catId = result?.ae_item_base_info_dto?.category_id;

      if (!catId) {
        console.log(`  ❌ ${productId} — no category from API`);
        failed++;
        await sleep(1500);
        continue;
      }

      // Auto-create category if new
      if (!knownCategories.has(catId)) {
        await c.query(
          `INSERT INTO ae_categories (ae_category_id, name, level, is_active) VALUES ($1, $2, 2, true) ON CONFLICT (ae_category_id) DO NOTHING`,
          [catId, `AE-${catId}`]
        );
        knownCategories.add(catId);
      }

      // Update category
      await c.query(`UPDATE ae_products SET category_id = $1 WHERE ae_product_id = $2`, [catId, productId]);
      fixed++;

      if (fixed % 10 === 0 || fixed <= 5) {
        console.log(`  ✅ ${fixed}/${oldProducts.length}  ${productId} → cat:${catId}`);
      }

      await sleep(1200);
    } catch (e) {
      console.log(`  ❌ ${productId} — ${e.message.slice(0, 60)}`);
      failed++;
      await sleep(2000);
    }
  }

  // Update category counts
  await c.query(`
    UPDATE ae_categories c SET product_count = COALESCE(sub.cnt, 0)
    FROM (SELECT category_id, COUNT(*) as cnt FROM ae_products GROUP BY category_id) sub
    WHERE c.ae_category_id = sub.category_id
  `);

  // Verify no more old categories
  const { rows: [check] } = await c.query(`SELECT COUNT(*) as c FROM ae_products WHERE category_id >= 900000000`);

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Fixed:              ${fixed}`);
  console.log(`  Failed:             ${failed}`);
  console.log(`  Still old (900k+):  ${check.c}`);
  console.log(`  API calls:          ${requestCount}`);
  console.log(`═══════════════════════════════════════`);

  c.release();
  await pool.end();
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
