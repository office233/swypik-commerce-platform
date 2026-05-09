/**
 * 🚀 IMPORT MASIV — din JSON export (AICeVrei Chrome Extension)
 * Usage: node ae-import-scraped.js [path-to-json] [category-id]
 */
const crypto = require('crypto');
const fs = require('fs');
const { Pool } = require('pg');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

// Load from JSON file or use args
const jsonPath = process.argv[2] || 'C:/Users/Pos5/Downloads/aicevrei_2497_products.json';
const catOverride = process.argv[3] ? parseInt(process.argv[3]) : null;

let PRODUCT_IDS, PARENT_CATEGORY;

if (fs.existsSync(jsonPath)) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  PRODUCT_IDS = data.product_ids;
  PARENT_CATEGORY = catOverride || data.category_id || 100003109;
  console.log(`📂 JSON: ${jsonPath} (${PRODUCT_IDS.length} produse)`);
} else {
  console.error('❌ JSON not found:', jsonPath);
  process.exit(1);
}

// Categorie
console.log(`📂 Categorie: ${PARENT_CATEGORY}`);

function sign(params) {
  const sorted = Object.keys(params).filter(k => k !== 'sign').sort();
  return crypto.createHmac('sha256', APP_SECRET).update(sorted.map(k => k + params[k]).join('')).digest('hex').toUpperCase();
}
async function callAPI(method, extra = {}) {
  const params = { app_key: APP_KEY, method, sign_method: 'sha256', timestamp: Date.now().toString(), format: 'json', v: '2.0', session: TOKEN, ...extra };
  params.sign = sign(params);
  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('&');
  return (await fetch('https://api-sg.aliexpress.com/sync?' + qs)).json();
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function calculatePriceRON(costUsd, shipUsd) {
  const totalRon = (costUsd + shipUsd) * 4.55 * 1.21;
  const mk = costUsd < 3 ? 2.0 : (costUsd < 50 ? 1.5 : 1.3);
  const raw = totalRon * mk;
  const pts = [14,19,24,29,39,49,59,69,79,89,99,119,129,149,169,189,199,219,249,269,299,349,399,449,499,599,699,799,899,999];
  const price = pts.find(p => p >= raw) || Math.ceil(raw / 100) * 100 - 1;
  const oldMul = 1.6 + (Math.abs(Math.round(costUsd * 100)) % 30) / 100;
  const oldPrice = pts.find(p => p >= price * oldMul) || Math.ceil(price * oldMul / 10) * 10 - 1;
  return { price, oldPrice, markup: mk };
}

async function importProduct(db, productId) {
  // Skip if exists
  const { rows: ex } = await db.query('SELECT id FROM ae_products WHERE ae_product_id = $1', [productId]);
  if (ex.length) return { status: 'skip' };

  // Detail
  const detail = await callAPI('aliexpress.ds.product.get', {
    product_id: productId, target_currency: 'USD', target_language: 'EN',
    ship_to_country: 'RO', country: 'RO',
  });
  const dr = detail.aliexpress_ds_product_get_response?.result;
  if (!dr?.ae_item_base_info_dto) return { status: 'fail', reason: 'no detail' };

  const base = dr.ae_item_base_info_dto;
  const skus = dr.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || [];
  if (!skus.length) return { status: 'fail', reason: 'no SKUs' };
  const store = dr.ae_store_info || {};
  const video = dr.ae_multimedia_info_dto?.ae_video_dtos?.ae_video_d_t_o?.[0];
  const imageUrls = (dr.ae_multimedia_info_dto?.image_urls || '').split(';').filter(Boolean);
  const props = dr.ae_item_properties?.ae_item_property || [];

  // ── Extract filter properties ──
  const getProp = (name) => props.find(p => p.attr_name?.toLowerCase() === name.toLowerCase())?.attr_value || null;
  
  const filterData = {
    neckline: getProp('Neckline') || getProp('Collar'),
    style: getProp('Style'),
    fabricType: getProp('Fabric Type'),
    material: getProp('Material') || getProp('Main Fabric Composition'),
    patternType: getProp('Pattern Type') || getProp('Pattern'),
    sleeveStyle: getProp('Sleeve Style') || getProp('Sleeve Length'),
    waistline: getProp('Waistline'),
    season: getProp('Season'),
    silhouette: getProp('Silhouette'),
    decoration: props.filter(p => p.attr_name === 'Decoration').map(p => p.attr_value).filter(Boolean),
  };

  // ── Extract colors & sizes from SKUs ──
  const allColors = new Set();
  const allSizes = new Set();
  for (const sku of skus) {
    const skuProps = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o || [];
    for (const sp of skuProps) {
      const name = (sp.sku_property_name || '').toLowerCase();
      if (name.includes('color') || name.includes('colour')) {
        allColors.add(sp.sku_property_value);
      }
      if (name.includes('size') || name.includes('ships from')) {
        // Only add actual sizes, not "Ships From" values
        if (!name.includes('ships')) allSizes.add(sp.sku_property_value);
      }
    }
  }
  const colors = [...allColors];
  const sizes = [...allSizes];
  const primaryColor = colors[0] || getProp('Color') || null;

  // ── Determine gender from category ──
  const genderMap = { 100003109: 'women', 100003070: 'men' };
  const gender = genderMap[PARENT_CATEGORY] || 'unisex';

  // Ensure category exists
  const realCatId = base.category_id;
  const { rows: catRows } = await db.query('SELECT ae_category_id FROM ae_categories WHERE ae_category_id = $1', [realCatId]);
  if (!catRows.length) {
    const { rows: parentRows } = await db.query('SELECT ae_category_id FROM ae_categories WHERE ae_category_id = $1', [PARENT_CATEGORY]);
    await db.query('INSERT INTO ae_categories (ae_category_id, parent_id, name, name_ro, level) VALUES ($1, $2, $3, $4, 2) ON CONFLICT DO NOTHING',
      [realCatId, parentRows.length ? PARENT_CATEGORY : null, `Category ${realCatId}`, 'Alte Produse']);
  }

  // Shipping (corect: shipToCountry)
  await sleep(100);
  let shipData = { method: 'Standard', cost: 0, free: true, minDays: 7, maxDays: 15, tracking: false, from: 'CN', deliveryDate: '', freeThreshold: '', stock: 0 };
  try {
    const freight = await callAPI('aliexpress.ds.freight.query', {
      queryDeliveryReq: JSON.stringify({
        productId, selectedSkuId: String(skus[0].sku_id),
        shipToCountry: 'RO', locale: 'en_US', quantity: 1, currency: 'USD', language: 'en',
      }),
    });
    const opts = freight.aliexpress_ds_freight_query_response?.result?.delivery_options?.delivery_option_d_t_o || [];
    if (opts.length) {
      const best = opts[0];
      const cost = parseFloat(best.shipping_fee_cent || '0');
      shipData = { method: best.company || 'Standard', cost, free: best.free_shipping || cost === 0,
        minDays: best.min_delivery_days || 7, maxDays: best.max_delivery_days || 15,
        tracking: best.tracking || false, from: best.ship_from_country || 'CN',
        deliveryDate: best.delivery_date_desc || '',
        freeThreshold: best.free_shipping_threshold || '',
        stock: parseInt(best.available_stock || '0') };
    }
  } catch(e) {}

  const minPrice = Math.min(...skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '999')));
  const maxPrice = Math.max(...skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '0')));
  const { price, oldPrice, markup } = calculatePriceRON(minPrice, shipData.cost);
  const brand = props.find(p => p.attr_name === 'Brand Name')?.attr_value || null;

  await db.query(`
    INSERT INTO ae_products (ae_product_id, category_id, title, description,
      min_price_usd, max_price_usd, price_ron, old_price_ron, markup,
      main_image, images, video_url, video_poster, has_video,
      rating, rating_count, orders_count, product_status, brand, properties,
      ship_method, ship_cost_usd, ship_free, ship_days_min, ship_days_max, ship_tracking, ship_from,
      store_id, store_name, store_rating, variants_count, source_url,
      delivery_date_desc, neckline, style, fabric_type, color, colors, sizes,
      material, pattern_type, sleeve_style, waistline, season, silhouette, decoration,
      gender, free_shipping_threshold, available_stock)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
      $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49)
    ON CONFLICT (ae_product_id) DO NOTHING
  `, [
    base.product_id, realCatId, base.subject, base.detail || '',
    minPrice, maxPrice, price, oldPrice, markup,
    imageUrls[0] || '', imageUrls, video?.media_url || null, video?.poster_url || null, !!video?.media_url,
    parseFloat(base.avg_evaluation_rating || '0'), parseInt(base.evaluation_count || '0'),
    parseInt(base.sales_count || '0'), base.product_status_type || 'onSelling',
    brand, JSON.stringify(props.map(p => ({ name: p.attr_name, value: p.attr_value }))),
    shipData.method, shipData.cost, shipData.free, shipData.minDays, shipData.maxDays, shipData.tracking, shipData.from,
    store.store_id, store.store_name, parseFloat(store.item_as_described_rating || '0'),
    skus.length, `https://www.aliexpress.com/item/${base.product_id}.html`,
    // New filter columns
    shipData.deliveryDate, filterData.neckline, filterData.style, filterData.fabricType,
    primaryColor, colors.length ? colors : null, sizes.length ? sizes : null,
    filterData.material, filterData.patternType, filterData.sleeveStyle,
    filterData.waistline, filterData.season, filterData.silhouette,
    filterData.decoration.length ? filterData.decoration : null,
    gender, shipData.freeThreshold, shipData.stock,
  ]);

  // Variants (max 30 in stock) — cu color + size
  const topSkus = skus.filter(s => (s.sku_available_stock || 0) > 0).slice(0, 30);
  for (const sku of (topSkus.length ? topSkus : skus.slice(0, 20))) {
    const skuProps = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o || [];
    const varName = skuProps.map(p => p.sku_property_value).join(', ') || 'Default';
    const skuPrice = parseFloat(sku.offer_sale_price || sku.sku_price || '0');
    const { price: skuRon } = calculatePriceRON(skuPrice, shipData.cost);
    
    // Extract color and size from SKU properties
    let varColor = null, varSize = null;
    for (const sp of skuProps) {
      const name = (sp.sku_property_name || '').toLowerCase();
      if (name.includes('color') || name.includes('colour')) varColor = sp.sku_property_value;
      if (name.includes('size') && !name.includes('ships')) varSize = sp.sku_property_value;
    }
    
    await db.query(`INSERT INTO ae_variants (product_id, sku_id, price_usd, original_price_usd, price_ron, variant_name, variant_image, stock, properties, color, size)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (product_id, sku_id) DO NOTHING`,
      [base.product_id, String(sku.sku_id), skuPrice, parseFloat(sku.sku_price||'0'), skuRon, varName,
       skuProps.find(p=>p.sku_image)?.sku_image || null,
       sku.sku_available_stock || 0,
       JSON.stringify(skuProps.map(p=>({name:p.sku_property_name,value:p.sku_property_value}))||[]),
       varColor, varSize]);
  }

  return { status: 'ok', title: base.subject?.slice(0, 40), price, video: !!video?.media_url, variants: topSkus.length || Math.min(skus.length, 20) };
}

async function main() {
  console.log('='.repeat(80));
  console.log(`  🚀 FAST IMPORT: ${PRODUCT_IDS.length} produse (din JSON)`);
  console.log('='.repeat(80));

  const db = new Pool({ connectionString: NEON_URL, max: 20 });
  await db.connect();

  let ok = 0, skip = 0, fail = 0, withVideo = 0;
  const start = Date.now();
  const CONCURRENCY = 15; // 15 produse in acelasi timp

  for (let i = 0; i < PRODUCT_IDS.length; i += CONCURRENCY) {
    const chunk = PRODUCT_IDS.slice(i, i + CONCURRENCY);
    
    // Rulam importul in paralel pentru acest chunk
    const results = await Promise.all(chunk.map(id => importProduct(db, id)));
    
    results.forEach((r, idx) => {
      const id = chunk[idx];
      const progress = `[${i + idx + 1}/${PRODUCT_IDS.length}]`;
      if (r.status === 'ok') {
        ok++;
        if (r.video) withVideo++;
        console.log(`✅ ${progress} ${id} | ${r.title}... | ${r.price} RON | ${r.variants} var${r.video ? ' 🎬' : ''}`);
      } else if (r.status === 'skip') {
        skip++;
        // Nu printam ca sa nu facem spam in consola cand face skip la mii
      } else {
        fail++;
        console.log(`❌ ${progress} ${id} | ${r.reason}`);
      }
    });

    // O pauză mică la fiecare 15 produse să nu luăm ban de la AliExpress
    await sleep(200); 
  }

  const { rows: p } = await db.query('SELECT COUNT(*) as c FROM ae_products');
  const { rows: v } = await db.query('SELECT COUNT(*) as c FROM ae_variants');
  const mins = ((Date.now() - start) / 60000).toFixed(1);

  console.log('\n' + '='.repeat(80));
  console.log(`  📊 REZULTAT: ${ok} importate, ${skip} skip, ${fail} fail, ${withVideo} cu video`);
  console.log(`  📦 TOTAL DB: ${p[0].c} produse, ${v[0].c} variante`);
  console.log(`  ⏱️ Timp: ${mins} minute`);
  console.log('='.repeat(80));

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
