/**
 * AliExpress -> Local PostgreSQL (swypik) Import
 * 
 * Reads ALL product IDs from Downloads JSON files,
 * deduplicates them, fetches via AE API (product.get + freight.query),
 * and inserts into LOCAL PostgreSQL (swypik).
 * 
 * DEDUP: 83,181 unique IDs from 108,988 raw entries across 41 files
 * RATE LIMITS: 1 req/s, pause 5s/50req, pause 30s/200req
 * 
 * Usage: node d:\swypik\ae-local-import.mjs [--max <N>] [--dry]
 */
import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const APP_KEY = requiredEnv("ALIEXPRESS_APP_KEY");
const APP_SECRET = requiredEnv("ALIEXPRESS_APP_SECRET");
const TOKEN = requiredEnv("ALIEXPRESS_ACCESS_TOKEN");
const DB_URL = process.env.AE_IMPORT_DATABASE_URL || process.env.LOCAL_DATABASE_URL || "postgresql://postgres@localhost:5432/swypik";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required in .env.local or the current shell environment`);
  }
  return value;
}

// Parse args
const args = process.argv.slice(2);
const maxProducts = args.includes("--max") ? parseInt(args[args.indexOf("--max") + 1]) : 99999;
const isDry = args.includes("--dry");


function sign(params) {
  const sorted = Object.keys(params).filter(k => k !== 'sign').sort();
  return crypto.createHmac('sha256', APP_SECRET).update(sorted.map(k => k + params[k]).join('')).digest('hex').toUpperCase();
}

// Global ban state shared across all calls.
let banLiftTime = 0;

async function callAPI(method, extra = {}) {
  // If the API is currently rate-limited, wait it out.
  const now = Date.now();
  if (banLiftTime > now) {
    const waitSec = Math.ceil((banLiftTime - now) / 1000);
    const liftDate = new Date(banLiftTime).toLocaleTimeString('ro-RO');
    console.log(`\n  API blocked. Waiting ${waitSec}s (unblocks at ${liftDate})...`);
    await sleep(banLiftTime - now + 5000); // +5s safety margin
    console.log(`  Ban expired. Resuming import...\n`);
  }

  const params = { app_key: APP_KEY, method, sign_method: 'sha256', timestamp: Date.now().toString(), format: 'json', v: '2.0', session: TOKEN, ...extra };
  params.sign = sign(params);
  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  
  let resp;
  try {
    resp = await fetch('https://api-sg.aliexpress.com/sync?' + qs);
  } catch (fetchErr) {
    // Network error: wait 10s and retry once.
    console.log(`  Network error: ${fetchErr.message}. Retrying in 10s...`);
    await sleep(10000);
    resp = await fetch('https://api-sg.aliexpress.com/sync?' + qs);
  }
  
  const json = await resp.json();
  
  // Check for rate limit ban
  if (json.error_response && json.error_response.code === 'AppApiCallLimit') {
    const msg = json.error_response.msg || '';
    const match = msg.match(/(\d+)\s*seconds/);
    const banSeconds = match ? parseInt(match[1]) : 3600; // default 1h if can't parse
    banLiftTime = Date.now() + (banSeconds * 1000);
    const liftDate = new Date(banLiftTime).toLocaleTimeString('ro-RO');
    console.log(`\n  RATE LIMIT. Ban ${banSeconds}s (~${(banSeconds/3600).toFixed(1)}h). Unblocks at ${liftDate}`);
    console.log(`  Sleeping automatically and retrying...\n`);
    await sleep(banSeconds * 1000 + 5000);
    console.log(`  Ban expired. Resuming import...\n`);
    // Retry the call
    return callAPI(method, extra);
  }
  
  return json;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getShippingInfo(productId, skuId) {
  try {
    const freight = await callAPI('aliexpress.ds.freight.query', {
      queryDeliveryReq: JSON.stringify({
        productId: String(productId),
        selectedSkuId: String(skuId),
        country: 'RO',
        shipToCountry: 'RO',
        locale: 'en_US',
        quantity: 1,
        currency: 'USD',
        language: 'en',
      }),
    });
    const options = freight.aliexpress_ds_freight_query_response?.result?.delivery_options?.delivery_option_d_t_o || [];
    if (options.length > 0) {
      const best = options[0];
      const cost = best.freight?.cent ? best.freight.cent / 100 : 0;
      return {
        method: best.company || best.code || 'Standard',
        cost,
        free: best.free_shipping || cost === 0,
        minDays: best.min_delivery_days || null,
        maxDays: best.max_delivery_days || null,
        tracking: best.tracking || false,
        from: best.ship_from_country || 'CN',
      };
    }
  } catch (e) {}
  return null;
}

async function getProductDetails(productId) {
  const data = await callAPI('aliexpress.ds.product.get', {
    product_id: productId.toString(),
    target_currency: 'USD',
    target_language: 'EN',
    ship_to_country: 'RO',
  });
  
  const result = data?.aliexpress_ds_product_get_response?.result;
  if (!result) return null;
  
  const base = result.ae_item_base_info_dto || {};
  const multimedia = result.ae_multimedia_info_dto || {};
  const skus = result.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || [];
  const store = result.ae_store_info || {};
  const logistics = result.logistics_info_dto || {};
  const manufacturer = result.manufacturer_info || {};
  const itemProps = result.ae_item_properties?.ae_item_property || [];
  
  // Prices from SKUs
  const skuPrices = skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '0')).filter(p => p > 0);
  const skuOrigPrices = skus.map(s => parseFloat(s.sku_price || '0')).filter(p => p > 0);
  const minPrice = skuPrices.length > 0 ? Math.min(...skuPrices) : 0;
  const maxPrice = skuPrices.length > 0 ? Math.max(...skuPrices) : minPrice;
  const origPrice = skuOrigPrices.length > 0 ? Math.min(...skuOrigPrices) : minPrice;
  
  // Images
  const imageUrls = (multimedia.image_urls || '').split(';').filter(Boolean);
  const mainImage = imageUrls[0] || '';
  
  // Video
  const videos = multimedia.ae_video_dtos?.ae_video_d_t_o || [];
  const videoUrl = videos.length > 0 ? videos[0].media_url : null;
  const videoPoster = videos.length > 0 ? videos[0].poster_url : null;
  const hasAudio = videos.some(v => v.media_type === 'audio');
  
  // RON price (USD to RON is ~4.6). Markup 2.5x + round to nearest 5
  const priceRon = minPrice > 0 ? Math.ceil((minPrice * 4.6 * 2.5) / 5) * 5 : null;
  const oldPriceRon = origPrice > minPrice ? Math.ceil((origPrice * 4.6 * 3.0) / 5) * 5 : (priceRon ? Math.round(priceRon * 1.5) : null);

  // Store rating
  const storeRating = (() => {
    const vals = [store.shipping_speed_rating, store.communication_rating, store.item_as_described_rating]
      .map(v => parseFloat(v || '0')).filter(v => v > 0);
    return vals.length > 0 ? parseFloat((vals.reduce((a,b)=>a+b,0) / vals.length).toFixed(1)) : null;
  })();

  // Properties
  const getProp = (name) => {
    const found = itemProps.find(p => p.attr_name?.toLowerCase() === name.toLowerCase());
    return found?.attr_value || null;
  };
  const brand = getProp('Brand Name');
  const material = getProp('Material') || getProp('Main Fabric Composition');
  const style = getProp('Style');
  const neckline = getProp('Neckline');
  const fabricType = getProp('Fabric Type');
  const patternType = getProp('Pattern Type');
  const sleeveStyle = getProp('Sleeve Style') || getProp('Sleeve Length(cm)');
  const waistline = getProp('Waistline');
  const season = getProp('Season');
  const silhouette = getProp('Silhouette');
  const gender = getProp('Gender');
  const decoration = getProp('Decoration');
  const decorationArr = decoration ? decoration.split(',').map(d => d.trim()).filter(Boolean) : null;

  // Colors & Sizes from SKUs
  const colorsSet = new Set();
  const sizesSet = new Set();
  for (const sku of skus) {
    const props = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o || [];
    for (const p of props) {
      const name = (p.sku_property_name || '').toLowerCase();
      const val = p.property_value_definition_name || p.sku_property_value || '';
      if (name === 'color' || name.includes('color')) colorsSet.add(val);
      if (name.includes('size')) sizesSet.add(val);
    }
  }
  const colors = colorsSet.size > 0 ? [...colorsSet] : null;
  const sizes = sizesSet.size > 0 ? [...sizesSet] : null;

  const totalStock = skus.reduce((sum, s) => sum + (parseInt(s.sku_available_stock || '0') || 0), 0);
  const description = base.detail ? base.detail.slice(0, 10000) : null;
  const shipFrom = manufacturer.country_name || 'China';

  return {
    ae_product_id: parseInt(productId),
    api_category_id: base.category_id || null,
    title: base.subject || '',
    description,
    min_price_usd: minPrice,
    max_price_usd: maxPrice,
    original_price_usd: origPrice,
    price_ron: priceRon,
    old_price_ron: oldPriceRon && oldPriceRon > priceRon ? oldPriceRon : null,
    markup: 2.5,
    main_image: mainImage,
    images: imageUrls,
    video_url: videoUrl,
    video_poster: videoPoster,
    has_video: !!videoUrl,
    has_audio: hasAudio,
    rating: parseFloat(base.avg_evaluation_rating || '0') || null,
    rating_count: parseInt(base.evaluation_count || '0') || 0,
    orders_count: parseInt(base.sales_count || '0') || 0,
    product_status: base.product_status_type || 'onSelling',
    brand: brand !== 'NONE' ? brand : null,
    properties: itemProps.length > 0 ? JSON.stringify(itemProps) : null,
    store_id: store.store_id || null,
    store_name: store.store_name || null,
    store_rating: storeRating,
    ship_from: shipFrom,
    ship_days_min: logistics.delivery_time || null,
    ship_days_max: null,
    ship_method: null,
    ship_cost_usd: 0,
    ship_free: true,
    ship_tracking: false,
    first_sku_id: skus[0]?.sku_id || null,
    variants_count: skus.length || 1,
    available_stock: totalStock > 0 ? totalStock : null,
    source_url: `https://www.aliexpress.com/item/${productId}.html`,
    neckline, style, fabric_type: fabricType, material,
    pattern_type: patternType, sleeve_style: sleeveStyle,
    waistline, season, silhouette, gender,
    decoration: decorationArr,
    colors, sizes,
    color: colors && colors.length > 0 ? colors[0] : null,
    variants: skus.map(v => {
      const vProps = v.ae_sku_property_dtos?.ae_sku_property_d_t_o || [];
      let vColor = null, vSize = null;
      for (const p of vProps) {
        const name = (p.sku_property_name || '').toLowerCase();
        const val = p.property_value_definition_name || p.sku_property_value || '';
        if (name === 'color' || name.includes('color')) vColor = val;
        if (name === 'size' || name.includes('size')) vSize = val;
      }
      return {
        sku_id: v.sku_id || '',
        price_usd: parseFloat(v.offer_sale_price || v.sku_price || '0') || minPrice,
        original_price_usd: parseFloat(v.sku_price || '0') || origPrice,
        price_ron: Math.ceil((parseFloat(v.offer_sale_price || v.sku_price || minPrice) * 4.6 * 2.5) / 5) * 5,
        variant_name: vProps.map(p => p.property_value_definition_name || p.sku_property_value).filter(Boolean).join(' / '),
        variant_image: vProps.find(p => p.sku_image)?.sku_image || null,
        stock: parseInt(v.sku_available_stock || '0') || 0,
        color: vColor,
        size: vSize,
        properties: vProps.length > 0 ? JSON.stringify(vProps) : null,
      };
    }).slice(0, 50),
  };
}

// Scan Downloads folder for all aicevrei_*.json IDs
function scanDownloads() {
  const dir = "C:/Users/Pos5/Downloads";
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith("aicevrei_") && f.endsWith(".json"))
    .sort();
  const ids = new Set();
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    (data.product_ids || []).forEach(id => ids.add(id));
  }
  return { files, ids };
}

async function run() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  🚀 AliExpress → LOCAL PostgreSQL (swypik) Import");
  console.log("  🔄 HOT-RELOAD: Re-scans Downloads every 500 products");
  console.log(`  Max per cycle: ${maxProducts} | Dry: ${isDry}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // 2. Connect to LOCAL PostgreSQL
  const pool = new pg.Pool({ connectionString: DB_URL });
  const c = await pool.connect();

  // Category cache
  const knownCategories = new Set();
  const { rows: existingCats } = await c.query(`SELECT ae_category_id FROM ae_categories`);
  existingCats.forEach(r => knownCategories.add(r.ae_category_id));

  let totalImported = 0, totalFailed = 0, totalRequestCount = 0;
  let scanCount = 0;

  try {
    // ═══ CONTINUOUS LOOP — re-scans Downloads periodically ═══
    while (true) {
      scanCount++;
      
      // 1. Scan Downloads
      const { files, ids: allFileIds } = scanDownloads();
      
      if (scanCount === 1) {
        console.log(`  📂 Initial scan: ${files.length} files, ${allFileIds.size} unique IDs`);
        for (const f of files) console.log(`    📄 ${f}`);
      } else {
        console.log(`\n  🔄 Re-scan #${scanCount}: ${files.length} files, ${allFileIds.size} unique IDs`);
      }

      // 2. Check what's already in DB
      const { rows: existing } = await c.query(`SELECT ae_product_id FROM ae_products`);
      const existingIds = new Set(existing.map(r => r.ae_product_id.toString()));
      
      // 3. Filter new only
      const newIds = [...allFileIds].filter(id => !existingIds.has(id));
      
      console.log(`  In DB: ${existingIds.size} | New: ${newIds.length}`);

      if (newIds.length === 0) {
        console.log("\n  ✨ Nothing new to import. Waiting 60s then re-scanning...");
        await sleep(60000);
        continue;
      }

      const toImport = newIds.slice(0, maxProducts);
      console.log(`  Importing: ${toImport.length} (category from API)\n`);

      if (isDry) {
        console.log("  🏃 DRY RUN — no API calls");
        for (const id of toImport.slice(0, 15)) console.log(`    ${id}`);
        return;
      }

      // 4. Import batch — OPTIMIZED: 2 products in parallel, safe timing
      let batchImported = 0, batchFailed = 0;

      // Helper: import a single product (returns true on success)
      async function importOne(productId) {
        totalRequestCount++;
        const product = await getProductDetails(productId);
        
        if (!product || !product.title) {
          console.log(`  ❌ ${productId} — no data returned`);
          totalFailed++;
          return false;
        }

        // Category from API — auto-create if new
        const categoryId = product.api_category_id || 0;
        if (categoryId && !knownCategories.has(categoryId)) {
          await c.query(
            `INSERT INTO ae_categories (ae_category_id, name, level, is_active)
             VALUES ($1, $2, 2, true)
             ON CONFLICT (ae_category_id) DO NOTHING`,
            [categoryId, `Category ${categoryId}`]
          );
          knownCategories.add(categoryId);
          console.log(`  📂 New category: ${categoryId}`);
        }

        // API call 2: Shipping info (stagger 600ms)
        await sleep(600);
        totalRequestCount++;
        if (product.first_sku_id) {
          const ship = await getShippingInfo(productId, product.first_sku_id);
          if (ship) {
            product.ship_method = ship.method;
            product.ship_cost_usd = ship.cost;
            product.ship_free = ship.free;
            product.ship_days_min = ship.minDays || product.ship_days_min;
            product.ship_days_max = ship.maxDays;
            product.ship_tracking = ship.tracking;
            product.ship_from = ship.from || product.ship_from;
          }
        }

        // INSERT product
        await c.query(`
          INSERT INTO ae_products (
            ae_product_id, category_id, title, description,
            min_price_usd, max_price_usd, original_price_usd,
            price_ron, old_price_ron, markup,
            main_image, images, video_url, video_poster, has_video, has_audio,
            rating, rating_count, orders_count, product_status,
            brand, properties,
            store_id, store_name, store_rating,
            ship_method, ship_cost_usd, ship_free, ship_days_min, ship_days_max, ship_tracking, ship_from,
            variants_count, available_stock, source_url,
            neckline, style, fabric_type, material,
            pattern_type, sleeve_style, waistline, season, silhouette,
            gender, decoration, color, colors, sizes
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
            $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
            $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49
          ) ON CONFLICT (ae_product_id) DO NOTHING
        `, [
          product.ae_product_id, categoryId || 0, product.title, product.description,
          product.min_price_usd, product.max_price_usd, product.original_price_usd,
          product.price_ron, product.old_price_ron, product.markup,
          product.main_image, product.images, product.video_url, product.video_poster, product.has_video, product.has_audio,
          product.rating, product.rating_count, product.orders_count, product.product_status,
          product.brand, product.properties,
          product.store_id, product.store_name, product.store_rating,
          product.ship_method, product.ship_cost_usd, product.ship_free, product.ship_days_min, product.ship_days_max, product.ship_tracking, product.ship_from,
          product.variants_count, product.available_stock, product.source_url,
          product.neckline, product.style, product.fabric_type, product.material,
          product.pattern_type, product.sleeve_style, product.waistline, product.season, product.silhouette,
          product.gender, product.decoration, product.color, product.colors, product.sizes,
        ]);

        // INSERT variants
        for (const v of product.variants) {
          if (!v.sku_id) continue;
          await c.query(`
            INSERT INTO ae_variants (product_id, sku_id, price_usd, original_price_usd, price_ron, variant_name, variant_image, stock, color, size, properties)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (product_id, sku_id) DO NOTHING
          `, [product.ae_product_id, v.sku_id, v.price_usd, v.original_price_usd, v.price_ron, v.variant_name, v.variant_image, v.stock, v.color, v.size, v.properties]);
        }

        totalImported++;
        batchImported++;
        if (totalImported % 25 === 0 || totalImported <= 5) {
          const priceInfo = product.price_ron ? `${product.price_ron} RON` : `$${product.min_price_usd}`;
          const speed = ((totalImported / ((Date.now() - importStartTime) / 3600000)) || 0).toFixed(0);
          console.log(`  ✅ ${String(totalImported).padEnd(5)} ${productId} → cat:${String(categoryId).padEnd(12)} ${priceInfo.padEnd(10)} [${speed}/h] "${product.title.slice(0,45)}"`);
        }
        return true;
      }

      const importStartTime = Date.now();

      for (let i = 0; i < toImport.length; i += 2) {
        // Rate limiting: safe pauses to avoid AliExpress ban
        if (totalRequestCount > 0 && totalRequestCount % 400 === 0) {
          console.log(`  ⏸️ Safety cooldown 20s after ${totalRequestCount} API calls...`);
          await sleep(20000);
        } else if (totalRequestCount > 0 && totalRequestCount % 100 === 0) {
          console.log(`  ⏸️ Brief pause 3s after ${totalRequestCount} API calls...`);
          await sleep(3000);
        }

        try {
          // Process 2 products in parallel with 400ms stagger
          const tasks = [];
          tasks.push(importOne(toImport[i]));
          if (i + 1 < toImport.length) {
            await sleep(400); // stagger so requests don't hit at exact same time
            tasks.push(importOne(toImport[i + 1]));
          }
          const results = await Promise.allSettled(tasks);
          for (const r of results) {
            if (r.status === 'rejected') {
              batchFailed++;
              totalFailed++;
              console.log(`  ❌ Error: ${String(r.reason?.message || r.reason).slice(0, 80)}`);
            }
          }
        } catch (err) {
          console.log(`  ❌ Batch error: ${err.message.slice(0, 80)}`);
          batchFailed += 2;
          totalFailed += 2;
          await sleep(3000);
        }

        // Small breathing room between pairs
        await sleep(300);

        // ═══ HOT-RELOAD: every 500 products, break and re-scan ═══
        if (batchImported > 0 && batchImported % 500 === 0) {
          console.log(`\n  🔄 Hot-reload trigger: ${batchImported} imported this batch, re-scanning Downloads...`);
          break;
        }
      }

      // Update category counts after each batch
      await c.query(`
        UPDATE ae_categories SET product_count = 0;
        UPDATE ae_categories c SET product_count = sub.cnt
        FROM (SELECT category_id, COUNT(*) as cnt FROM ae_products GROUP BY category_id) sub
        WHERE c.ae_category_id = sub.category_id
      `);

      const { rows: [totals] } = await c.query(`SELECT COUNT(*) as total FROM ae_products`);
      const { rows: [vtotals] } = await c.query(`SELECT COUNT(*) as total FROM ae_variants`);
      console.log(`  📊 Batch done: +${batchImported} imported, ${batchFailed} failed | Total: ${totals.total} products, ${vtotals.total} variants`);
    }
    // ═══ END CONTINUOUS LOOP ═══

  } finally {
    c.release();
    await pool.end();
  }
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
