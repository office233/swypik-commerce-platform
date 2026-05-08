/**
 * 🔬 Scrape AliExpress category page → extract product IDs
 * Then import 1 test product via DS API
 */
const crypto = require('crypto');
const { Client } = require('pg');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

// Category: Automobiles, Parts & Accessories → Car Electronics
const FORCE_CATEGORY_ID = 100007038; // "Car Electronics" subcategory

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
  const totalRon = (costUsd + shipUsd) * 4.55 * 1.19;
  const mk = costUsd < 3 ? 2.0 : (costUsd < 50 ? 1.5 : 1.3);
  const raw = totalRon * mk;
  const pts = [14,19,24,29,39,49,59,69,79,89,99,119,129,149,169,189,199,219,249,269,299,349,399,449,499,599,699,799,899,999];
  const price = pts.find(p => p >= raw) || Math.ceil(raw / 100) * 100 - 1;
  const oldMul = 1.6 + (Math.abs(Math.round(costUsd * 100)) % 30) / 100;
  const oldPrice = pts.find(p => p >= price * oldMul) || Math.ceil(price * oldMul / 10) * 10 - 1;
  return { price, oldPrice, markup: mk };
}

async function main() {
  // STEP 1: Scrape category page HTML for product IDs
  console.log('📍 STEP 1: Scraping AliExpress category page...');
  
  const url = 'https://www.aliexpress.com/category/0/Car-Gadgets-%26-Appliances.html?isFromCategory=y';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });
  const html = await res.text();
  console.log(`  HTML size: ${(html.length / 1024).toFixed(0)} KB`);

  // Extract product IDs from HTML
  const idMatches = html.matchAll(/\/item\/(\d{10,20})\.html/g);
  const ids = [...new Set([...idMatches].map(m => m[1]))];
  console.log(`  ✅ Found ${ids.length} product IDs from HTML`);
  
  // Also try JSON data embedded in page
  const jsonMatches = html.matchAll(/"productId"\s*:\s*"?(\d{10,20})"?/g);
  const jsonIds = [...new Set([...jsonMatches].map(m => m[1]))];
  console.log(`  ✅ Found ${jsonIds.length} product IDs from JSON data`);

  // Combine
  const allIds = [...new Set([...ids, ...jsonIds])];
  console.log(`  📦 Total unique IDs: ${allIds.length}`);
  
  if (allIds.length) {
    console.log(`  First 10: ${allIds.slice(0, 10).join(', ')}`);
  }

  if (!allIds.length) {
    console.log('\n  ⚠️ No IDs from HTML scrape. Trying embedded script data...');
    // Try to find IDs in script tags
    const scriptMatches = html.matchAll(/(\d{16,20})/g);
    const scriptIds = [...new Set([...scriptMatches].map(m => m[1]).filter(id => id.startsWith('1005')))];
    console.log(`  Found ${scriptIds.length} IDs from scripts`);
    if (scriptIds.length) {
      allIds.push(...scriptIds);
      console.log(`  First 10: ${scriptIds.slice(0, 10).join(', ')}`);
    }
  }

  if (!allIds.length) {
    console.log('\n❌ No product IDs found! Page might need JavaScript rendering.');
    console.log('Using known IDs from earlier browser scrape...');
    // Use the IDs we got from browser earlier (first 10 legitimate ones)
    allIds.push(
      '1005010459262135', '1005012142494452', '1005012111627821',
      '1005007469272162', '1005007379212313', '1005006016322549',
      '1005007871817898', '1005011856318603', '1005005988162152',
      '1005007364631141'
    );
  }

  // STEP 2: Test with 1 product
  console.log(`\n📍 STEP 2: Import test — product ${allIds[0]}`);
  
  await sleep(2000);
  const detail = await callAPI('aliexpress.ds.product.get', {
    product_id: allIds[0],
    target_currency: 'USD', target_language: 'EN',
    ship_to_country: 'RO', country: 'RO',
  });
  const dr = detail.aliexpress_ds_product_get_response?.result;
  if (!dr?.ae_item_base_info_dto) {
    console.log('❌ Product detail failed!');
    console.log(JSON.stringify(detail).slice(0, 300));
    return;
  }

  const base = dr.ae_item_base_info_dto;
  const skus = dr.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || [];
  const store = dr.ae_store_info || {};
  const video = dr.ae_multimedia_info_dto?.ae_video_dtos?.ae_video_d_t_o?.[0];
  const imageUrls = (dr.ae_multimedia_info_dto?.image_urls || '').split(';').filter(Boolean);
  const props = dr.ae_item_properties?.ae_item_property || [];

  console.log(`  ✅ Titlu: ${base.subject}`);
  console.log(`  ✅ Category ID real: ${base.category_id}`);
  console.log(`  ✅ Rating: ${base.avg_evaluation_rating} (${base.evaluation_count} reviews)`);
  console.log(`  ✅ Orders: ${base.sales_count}`);
  console.log(`  ✅ SKUs: ${skus.length}`);
  console.log(`  ✅ Video: ${video ? 'DA' : 'NU'}`);
  console.log(`  ✅ Images: ${imageUrls.length}`);

  // Shipping
  console.log('\n📍 STEP 3: Shipping...');
  await sleep(2000);
  let shipData = { method: 'Standard', cost: 0, free: true, minDays: 7, maxDays: 15, tracking: false, from: 'CN' };
  if (skus.length) {
    try {
      const freight = await callAPI('aliexpress.ds.freight.query', {
        queryDeliveryReq: JSON.stringify({
          productId: allIds[0], selectedSkuId: String(skus[0].sku_id),
          country: 'RO', locale: 'en_US', quantity: 1, currency: 'USD', language: 'en',
        }),
      });
      const opts = freight.aliexpress_ds_freight_query_response?.result?.delivery_options?.delivery_option_d_t_o || [];
      if (opts.length) {
        const best = opts[0];
        const cost = best.freight?.cent ? best.freight.cent / 100 : 0;
        shipData = { method: best.company || 'Standard', cost, free: cost === 0,
          minDays: best.min_delivery_days || 7, maxDays: best.max_delivery_days || 15,
          tracking: best.tracking || false, from: best.ship_from_country || 'CN' };
      }
    } catch(e) {}
  }
  console.log(`  ✅ ${shipData.method} — ${shipData.free ? 'GRATIS' : '$'+shipData.cost} (${shipData.minDays}-${shipData.maxDays} zile)`);

  // Pricing
  const minPrice = Math.min(...skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '999')));
  const maxPrice = Math.max(...skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '0')));
  const { price, oldPrice, markup } = calculatePriceRON(minPrice, shipData.cost);
  console.log(`  ✅ Cost: $${minPrice} → ${price} RON (era ${oldPrice} RON) markup ${markup}x`);

  // STEP 4: Insert
  console.log('\n📍 STEP 4: Insert in NeonDB...');
  const db = new Client({ connectionString: NEON_URL });
  await db.connect();

  // Use REAL category_id from product detail (not forced)
  const realCatId = base.category_id;
  
  // Check if category exists, auto-create if not
  let { rows: catRows } = await db.query('SELECT ae_category_id, name_ro FROM ae_categories WHERE ae_category_id = $1', [realCatId]);
  if (!catRows.length) {
    console.log(`  ⚠️ Category ${realCatId} not found, creating...`);
    await db.query('INSERT INTO ae_categories (ae_category_id, name, name_ro, level) VALUES ($1, $2, $2, 2) ON CONFLICT DO NOTHING',
      [realCatId, `Auto Category ${realCatId}`]);
    catRows = (await db.query('SELECT ae_category_id, name_ro FROM ae_categories WHERE ae_category_id = $1', [realCatId])).rows;
  }
  console.log(`  ✅ Categorie: ${catRows[0]?.name_ro} (${realCatId})`);

  const brand = props.find(p => p.attr_name === 'Brand Name')?.attr_value || null;
  await db.query(`
    INSERT INTO ae_products (
      ae_product_id, category_id, title, description,
      min_price_usd, max_price_usd, price_ron, old_price_ron, markup,
      main_image, images, video_url, video_poster, has_video,
      rating, rating_count, orders_count, product_status,
      brand, properties,
      ship_method, ship_cost_usd, ship_free, ship_days_min, ship_days_max, ship_tracking, ship_from,
      store_id, store_name, store_rating,
      variants_count, source_url
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
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
  ]);

  // Insert variants (max 30 with stock)
  const topSkus = skus.filter(s => (s.sku_available_stock || 0) > 0).slice(0, 30);
  for (const sku of (topSkus.length ? topSkus : skus.slice(0, 20))) {
    const varName = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o?.map(p => p.sku_property_value).join(', ') || 'Default';
    const skuPrice = parseFloat(sku.offer_sale_price || sku.sku_price || '0');
    const { price: skuRon } = calculatePriceRON(skuPrice, shipData.cost);
    await db.query(`INSERT INTO ae_variants (product_id, sku_id, price_usd, original_price_usd, price_ron, variant_name, variant_image, stock, properties)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (product_id, sku_id) DO NOTHING`,
      [base.product_id, String(sku.sku_id), skuPrice, parseFloat(sku.sku_price||'0'), skuRon,
       varName, sku.ae_sku_property_dtos?.ae_sku_property_d_t_o?.find(p=>p.sku_image)?.sku_image || null,
       sku.sku_available_stock || 0,
       JSON.stringify(sku.ae_sku_property_dtos?.ae_sku_property_d_t_o?.map(p=>({name:p.sku_property_name,value:p.sku_property_value}))||[])]);
  }

  const { rows: pCnt } = await db.query('SELECT COUNT(*) as c FROM ae_products');
  const { rows: vCnt } = await db.query('SELECT COUNT(*) as c FROM ae_variants');

  console.log('\n' + '='.repeat(60));
  console.log(`  ✅ PRODUS IMPORTAT CORECT!`);
  console.log(`  📛 ${base.subject?.slice(0, 50)}`);
  console.log(`  📂 Categorie: ${catRows[0]?.name_ro}`);
  console.log(`  💰 ${price} RON (era ${oldPrice} RON)`);
  console.log(`  📦 DB: ${pCnt[0].c} produse, ${vCnt[0].c} variante`);
  console.log('='.repeat(60));

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
