/**
 * 🚀 AliExpress Batch Product Import
 * 
 * Reads product IDs from Downloads JSON files,
 * fetches details via AE API (aliexpress.ds.product.get),
 * and inserts into production Neon DB.
 * 
 * RATE LIMITS:
 * - Max 1 request/second (AE API limit)
 * - Pause 5s every 50 requests
 * - Pause 30s every 200 requests
 * - Max ~1000 products per run to stay safe
 * 
 * Usage: node scripts/ae-batch-import.mjs [--file <filename>] [--max <N>] [--dry]
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

// Parse args
const args = process.argv.slice(2);
const fileFilter = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;
const maxProducts = args.includes("--max") ? parseInt(args[args.indexOf("--max") + 1]) : 500;
const isDry = args.includes("--dry");

// File name → AE category mapping
const FILE_TO_CATEGORY = {
  "underwear": "Lingerie Sets",
  "matchingsets": "Matching Sets",
  "tankscamis": "Tanks, Camis & Bodysuits",
  "pantiesbrief": "Panties & Briefs",
  "jacketvest": "Jackets & Vests",
  "brassbracelet": "Bras & Bralettes",
  "casualcargoshort": "Pants & Trousers",
  "mantshirttanktops": "Tanks, Camis & Bodysuits",
  "pantstousers": "Pants & Trousers",
  "coverups": "Cover-Ups",
  "lenjerie": "Lingerie Sets",
  "menshirt": "Blouses & Shirts",
  "blouseskirt": "Blouses & Shirts",
  "menjeans": "Pants & Trousers",
  "suitblazer": "Blazers & Suit Sets",
  "bikinitankinis": "Bikinis & Tankinis",
  "hodies": "Hoodies & Sweatshirts",
  "jumpsuit_rompers": "Jumpsuits & Rompers",
  "weedingparty": "Wedding Party Attire",
  "pajamas_robes": "Pajamas & Robes",
  "tshirtpolos": "Tanks, Camis & Bodysuits",
  "formalevening": "Formal & Evening Gowns",
  "sweatpansjogger": "Pants & Trousers",
  "sweaters": "Sweaters & Pullovers",
  "weddingbridal": "Wedding & Bridal Gowns",
};

function guessCategory(filename) {
  const lower = filename.toLowerCase();
  for (const [key, cat] of Object.entries(FILE_TO_CATEGORY)) {
    if (lower.includes(key)) return cat;
  }
  return "Matching Sets"; // fallback
}

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
  } catch (e) {
    // Shipping API fail is not critical
  }
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
  const packageInfo = result.package_info_dto || {};
  
  // Price — from SKUs
  const skuPrices = skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '0')).filter(p => p > 0);
  const skuOrigPrices = skus.map(s => parseFloat(s.sku_price || '0')).filter(p => p > 0);
  const minPrice = skuPrices.length > 0 ? Math.min(...skuPrices) : 0;
  const maxPrice = skuPrices.length > 0 ? Math.max(...skuPrices) : minPrice;
  const origPrice = skuOrigPrices.length > 0 ? Math.min(...skuOrigPrices) : minPrice;
  
  // Images — from top-level ae_multimedia_info_dto
  const imageUrls = (multimedia.image_urls || '').split(';').filter(Boolean);
  const mainImage = imageUrls.length > 0 ? imageUrls[0] : '';
  
  // Video
  const videos = multimedia.ae_video_dtos?.ae_video_d_t_o || [];
  const videoUrl = videos.length > 0 ? videos[0].media_url : null;
  const videoPoster = videos.length > 0 ? videos[0].poster_url : null;
  const hasAudio = videos.some(v => v.media_type === 'audio');
  
  // RON price (markup 2.5x + round to nearest 5)
  const priceRon = minPrice > 0 ? Math.ceil(minPrice * 2.5 / 5) * 5 : null;
  const oldPriceRon = origPrice > minPrice ? Math.ceil(origPrice * 3.0 / 5) * 5 : null;

  // Store rating — average of the 3 sub-ratings
  const storeRating = (() => {
    const vals = [store.shipping_speed_rating, store.communication_rating, store.item_as_described_rating]
      .map(v => parseFloat(v || '0')).filter(v => v > 0);
    return vals.length > 0 ? parseFloat((vals.reduce((a,b)=>a+b,0) / vals.length).toFixed(1)) : null;
  })();

  // Properties extraction — from ae_item_properties
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

  // Colors & Sizes — extracted from all SKU properties
  const colorsSet = new Set();
  const sizesSet = new Set();
  for (const sku of skus) {
    const props = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o || [];
    for (const p of props) {
      const name = (p.sku_property_name || '').toLowerCase();
      const val = p.property_value_definition_name || p.sku_property_value || '';
      if (name === 'color' || name.includes('color')) colorsSet.add(val);
      if (name === 'size' || name.includes('size') || name === 'ships from') {
        if (name.includes('size')) sizesSet.add(val);
      }
    }
  }
  const colors = colorsSet.size > 0 ? [...colorsSet] : null;
  const sizes = sizesSet.size > 0 ? [...sizesSet] : null;

  // Total available stock
  const totalStock = skus.reduce((sum, s) => sum + (parseInt(s.sku_available_stock || '0') || 0), 0);

  // Description (HTML) — truncate to 10KB to avoid bloat
  const description = base.detail ? base.detail.slice(0, 10000) : null;

  // Ship from (manufacturer country)
  const shipFrom = manufacturer.country_name || 'China';

  return {
    ae_product_id: parseInt(productId),
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
    // Fashion attributes
    neckline, style, fabric_type: fabricType, material,
    pattern_type: patternType, sleeve_style: sleeveStyle,
    waistline, season, silhouette, gender,
    decoration: decorationArr,
    colors, sizes,
    color: colors && colors.length > 0 ? colors[0] : null,
    // Variants
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
        price_ron: Math.ceil(parseFloat(v.offer_sale_price || v.sku_price || minPrice) * 2.5 / 5) * 5,
        variant_name: vProps.map(p => p.property_value_definition_name || p.sku_property_value).filter(Boolean).join(' / '),
        variant_image: vProps.find(p => p.sku_image)?.sku_image || null,
        stock: parseInt(v.sku_available_stock || '0') || 0,
        color: vColor,
        size: vSize,
        properties: vProps.length > 0 ? JSON.stringify(vProps) : null,
      };
    }).slice(0, 50), // Max 50 variants
  };
}

async function run() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  🚀 AliExpress Batch Import");
  console.log(`  Max: ${maxProducts} products | Dry: ${isDry}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // 1. Load all IDs from Downloads
  const dir = "C:/Users/Pos5/Downloads";
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith("aicevrei_") && f.endsWith(".json"))
    .filter(f => !fileFilter || f.includes(fileFilter))
    .sort();

  const fileIDs = []; // { id, category, filename }
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const ids = data.product_ids || [];
    const cat = guessCategory(f);
    ids.forEach(id => fileIDs.push({ id, category: cat, filename: f }));
    console.log(`  📄 ${f.padEnd(55)} ${ids.length} IDs → ${cat}`);
  }
  console.log(`\n  Total IDs from files: ${fileIDs.length}`);

  // 2. Connect to Neon and check existing
  const pool = new pg.Pool({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } });
  const c = await pool.connect();

  try {
    // Get existing product IDs
    const { rows: existing } = await c.query(`SELECT ae_product_id FROM ae_products`);
    const existingIds = new Set(existing.map(r => r.ae_product_id.toString()));
    console.log(`  Existing products in DB: ${existingIds.size}`);

    // Filter out already imported
    const newIds = fileIDs.filter(f => !existingIds.has(f.id));
    console.log(`  New (not in DB): ${newIds.length}`);
    console.log(`  Already imported: ${fileIDs.length - newIds.length}`);

    // 3. Get category mapping from DB
    const { rows: cats } = await c.query(`
      SELECT ae_category_id, name FROM ae_categories WHERE is_active = true AND level = 2
    `);
    const catMap = {};
    cats.forEach(cat => { catMap[cat.name] = cat.ae_category_id; });
    console.log(`  Active categories: ${cats.length}`);

    // Limit imports
    const toImport = newIds.slice(0, maxProducts);
    console.log(`\n  📦 Importing ${toImport.length} products (limited to ${maxProducts})\n`);

    if (isDry) {
      console.log("  🏃 DRY RUN — no actual API calls or DB writes");
      for (const item of toImport.slice(0, 10)) {
        console.log(`    ${item.id} → ${item.category}`);
      }
      if (toImport.length > 10) console.log(`    ... and ${toImport.length - 10} more`);
      return;
    }

    // 4. Import loop
    let imported = 0, failed = 0, skipped = 0;
    let requestCount = 0;

    for (let i = 0; i < toImport.length; i++) {
      const item = toImport[i];
      const categoryId = catMap[item.category];
      
      if (!categoryId) {
        console.log(`  ⚠️ No category found for "${item.category}", skipping ${item.id}`);
        skipped++;
        continue;
      }

      try {
        // Rate limiting
        requestCount++;
        if (requestCount % 200 === 0) {
          console.log(`  ⏸️ Cooling down 30s after ${requestCount} requests...`);
          await sleep(30000);
        } else if (requestCount % 50 === 0) {
          console.log(`  ⏸️ Brief pause 5s after ${requestCount} requests...`);
          await sleep(5000);
        }

        // Fetch product details (API call 1)
        const product = await getProductDetails(item.id);
        
        if (!product || !product.title) {
          console.log(`  ❌ ${item.id} — no data returned`);
          failed++;
          await sleep(1500);
          continue;
        }

        // Fetch shipping info (API call 2)
        await sleep(1200);
        requestCount++;
        if (product.first_sku_id) {
          const ship = await getShippingInfo(item.id, product.first_sku_id);
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

        // Insert product — ALL columns
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
          product.ae_product_id, categoryId, product.title, product.description,
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

        // Insert variants — ALL columns
        for (const v of product.variants) {
          if (!v.sku_id) continue;
          await c.query(`
            INSERT INTO ae_variants (product_id, sku_id, price_usd, original_price_usd, price_ron, variant_name, variant_image, stock, color, size, properties)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (product_id, sku_id) DO NOTHING
          `, [product.ae_product_id, v.sku_id, v.price_usd, v.original_price_usd, v.price_ron, v.variant_name, v.variant_image, v.stock, v.color, v.size, v.properties]);
        }

        imported++;
        if (imported % 10 === 0 || imported <= 5) {
          const priceInfo = product.price_ron ? `${product.price_ron} RON` : `$${product.min_price_usd}`;
          console.log(`  ✅ ${String(imported).padEnd(4)} ${item.id} → ${item.category.slice(0,25).padEnd(27)} ${priceInfo.padEnd(10)} "${product.title.slice(0,50)}"`);
        }

        // Throttle: 1.5s between products (2 API calls each)
        await sleep(1500);
        
      } catch (err) {
        console.log(`  ❌ ${item.id} — ${err.message.slice(0, 80)}`);
        failed++;
        await sleep(2000);
      }
    }

    // 5. Update category product_count
    console.log("\n📋 Updating category counts...");
    await c.query(`
      UPDATE ae_categories c SET product_count = COALESCE(sub.cnt, 0)
      FROM (SELECT category_id, COUNT(*) as cnt FROM ae_products GROUP BY category_id) sub
      WHERE c.ae_category_id = sub.category_id
    `);

    // Summary
    const { rows: [totals] } = await c.query(`SELECT COUNT(*) as total FROM ae_products`);
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`  📊 IMPORT SUMMARY`);
    console.log(`  Imported:    ${imported}`);
    console.log(`  Failed:      ${failed}`);
    console.log(`  Skipped:     ${skipped}`);
    console.log(`  Total in DB: ${totals.total}`);
    console.log(`  API calls:   ${requestCount}`);
    console.log(`═══════════════════════════════════════════════════════\n`);

  } finally {
    c.release();
    await pool.end();
  }
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
