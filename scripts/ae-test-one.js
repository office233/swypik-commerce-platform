/**
 * TEST — Import 1 singur produs cu TOATE filtrele noi
 * Arată structura completă după import
 */
const crypto = require('crypto');
const { Client } = require('pg');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const TEST_ID = '1005007350304062'; // Rainbow Striped Dress
const PARENT_CATEGORY = 100003109;

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
  const totalRon = (costUsd + shipUsd) * 4.55 * 1.21; // TVA 21%
  const mk = costUsd < 3 ? 2.0 : (costUsd < 50 ? 1.5 : 1.3);
  const raw = totalRon * mk;
  const pts = [14,19,24,29,39,49,59,69,79,89,99,119,129,149,169,189,199,219,249,269,299,349,399,449,499,599,699,799,899,999];
  const price = pts.find(p => p >= raw) || Math.ceil(raw / 100) * 100 - 1;
  const oldMul = 1.6 + (Math.abs(Math.round(costUsd * 100)) % 30) / 100;
  const oldPrice = pts.find(p => p >= price * oldMul) || Math.ceil(price * oldMul / 10) * 10 - 1;
  return { price, oldPrice, markup: mk };
}

(async () => {
  console.log('═'.repeat(70));
  console.log('  TEST IMPORT — 1 produs cu filtre');
  console.log('═'.repeat(70));

  // 1. Get product detail
  console.log('\n📡 API: product.get...');
  const detail = await callAPI('aliexpress.ds.product.get', {
    product_id: TEST_ID, target_currency: 'USD', target_language: 'EN',
    ship_to_country: 'RO', country: 'RO',
  });
  const dr = detail.aliexpress_ds_product_get_response?.result;
  const base = dr.ae_item_base_info_dto;
  const skus = dr.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || [];
  const props = dr.ae_item_properties?.ae_item_property || [];
  const video = dr.ae_multimedia_info_dto?.ae_video_dtos?.ae_video_d_t_o?.[0];

  console.log(`  Titlu: ${base.subject}`);
  console.log(`  Cat AE: ${base.category_id}`);
  console.log(`  SKUs: ${skus.length}`);
  console.log(`  Video: ${video ? 'DA' : 'NU'}`);

  // 2. Show ALL properties
  console.log('\n📋 PROPERTIES din API:');
  props.forEach(p => console.log(`  ${p.attr_name}: ${p.attr_value}`));

  // 3. Extract filters
  const getProp = (name) => props.find(p => p.attr_name?.toLowerCase() === name.toLowerCase())?.attr_value || null;
  console.log('\n🔍 FILTRE EXTRASE:');
  console.log(`  Neckline: ${getProp('Neckline') || getProp('Collar') || '—'}`);
  console.log(`  Style: ${getProp('Style') || '—'}`);
  console.log(`  Fabric Type: ${getProp('Fabric Type') || '—'}`);
  console.log(`  Material: ${getProp('Material') || getProp('Main Fabric Composition') || '—'}`);
  console.log(`  Pattern Type: ${getProp('Pattern Type') || getProp('Pattern') || '—'}`);
  console.log(`  Sleeve Style: ${getProp('Sleeve Style') || getProp('Sleeve Length') || '—'}`);
  console.log(`  Waistline: ${getProp('Waistline') || '—'}`);
  console.log(`  Season: ${getProp('Season') || '—'}`);
  console.log(`  Silhouette: ${getProp('Silhouette') || '—'}`);
  const deco = props.filter(p => p.attr_name === 'Decoration').map(p => p.attr_value);
  console.log(`  Decoration: ${deco.length ? deco.join(', ') : '—'}`);

  // 4. Extract colors/sizes from SKUs
  const allColors = new Set();
  const allSizes = new Set();
  for (const sku of skus) {
    const sp = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o || [];
    for (const p of sp) {
      const name = (p.sku_property_name || '').toLowerCase();
      if (name.includes('color')) allColors.add(p.sku_property_value);
      if (name.includes('size') && !name.includes('ships')) allSizes.add(p.sku_property_value);
    }
  }
  console.log(`\n🎨 CULORI: ${[...allColors].join(', ') || '—'}`);
  console.log(`📏 MĂRIMI: ${[...allSizes].join(', ') || '—'}`);

  // 5. Freight
  console.log('\n📦 SHIPPING:');
  await sleep(2000);
  const freight = await callAPI('aliexpress.ds.freight.query', {
    queryDeliveryReq: JSON.stringify({
      productId: TEST_ID, selectedSkuId: String(skus[0].sku_id),
      shipToCountry: 'RO', locale: 'en_US', quantity: 1, currency: 'USD', language: 'en',
    }),
  });
  const opts = freight.aliexpress_ds_freight_query_response?.result?.delivery_options?.delivery_option_d_t_o || [];
  if (opts.length) {
    const best = opts[0];
    console.log(`  Metoda: ${best.company}`);
    console.log(`  Cost: $${best.shipping_fee_cent}`);
    console.log(`  Free: ${best.free_shipping}`);
    console.log(`  Prag free: ${best.free_shipping_threshold || '—'}`);
    console.log(`  Zile: ${best.min_delivery_days} - ${best.max_delivery_days}`);
    console.log(`  Data estimată: ${best.delivery_date_desc}`);
    console.log(`  Tracking: ${best.tracking}`);
    console.log(`  Stoc: ${best.available_stock}`);
    console.log(`  Din: ${best.ship_from_country}`);
  }

  // 6. Pricing
  const minPrice = Math.min(...skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '999')));
  const shipCost = parseFloat(opts[0]?.shipping_fee_cent || '0');
  const { price, oldPrice, markup } = calculatePriceRON(minPrice, shipCost);
  console.log(`\n💰 PREȚ: $${minPrice} + $${shipCost} ship → ${price} RON (era ${oldPrice} RON) | markup x${markup}`);

  // 7. INSERT in DB
  console.log('\n💾 INSERT în NeonDB...');
  const db = new Client({ connectionString: NEON_URL });
  await db.connect();

  // Run the actual import
  const imageUrls = (dr.ae_multimedia_info_dto?.image_urls || '').split(';').filter(Boolean);
  const store = dr.ae_store_info || {};
  const brand = getProp('Brand Name');
  const maxPrice = Math.max(...skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '0')));
  const colors = [...allColors];
  const sizes = [...allSizes];
  const primaryColor = colors[0] || getProp('Color');
  const best = opts[0] || {};

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
    decoration: deco,
  };

  // Ensure category
  const realCatId = base.category_id;
  const { rows: catRows } = await db.query('SELECT ae_category_id FROM ae_categories WHERE ae_category_id = $1', [realCatId]);
  if (!catRows.length) {
    await db.query('INSERT INTO ae_categories (ae_category_id, parent_id, name, name_ro, level) VALUES ($1, $2, $3, $3, 2) ON CONFLICT DO NOTHING',
      [realCatId, PARENT_CATEGORY, `Sub ${realCatId}`]);
  }

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
    ON CONFLICT (ae_product_id) DO UPDATE SET updated_at = now()
  `, [
    base.product_id, realCatId, base.subject, base.detail || '',
    minPrice, maxPrice, price, oldPrice, markup,
    imageUrls[0] || '', imageUrls, video?.media_url || null, video?.poster_url || null, !!video?.media_url,
    parseFloat(base.avg_evaluation_rating || '0'), parseInt(base.evaluation_count || '0'),
    parseInt(base.sales_count || '0'), base.product_status_type || 'onSelling',
    brand, JSON.stringify(props.map(p => ({ name: p.attr_name, value: p.attr_value }))),
    best.company || 'Standard', shipCost, best.free_shipping || shipCost === 0,
    best.min_delivery_days || 7, best.max_delivery_days || 15, best.tracking || false, best.ship_from_country || 'CN',
    store.store_id, store.store_name, parseFloat(store.item_as_described_rating || '0'),
    skus.length, `https://www.aliexpress.com/item/${base.product_id}.html`,
    best.delivery_date_desc || '', filterData.neckline, filterData.style, filterData.fabricType,
    primaryColor, colors.length ? colors : null, sizes.length ? sizes : null,
    filterData.material, filterData.patternType, filterData.sleeveStyle,
    filterData.waistline, filterData.season, filterData.silhouette,
    deco.length ? deco : null,
    'women', best.free_shipping_threshold || '', parseInt(best.available_stock || '0'),
  ]);
  console.log('  ✅ Produs inserat!');

  // Verify — read back
  const { rows } = await db.query('SELECT * FROM ae_products WHERE ae_product_id = $1', [TEST_ID]);
  if (rows.length) {
    const p = rows[0];
    console.log('\n' + '═'.repeat(70));
    console.log('  📊 PRODUS ÎN DB:');
    console.log('═'.repeat(70));
    console.log(`  ae_product_id:    ${p.ae_product_id}`);
    console.log(`  title:            ${p.title?.slice(0, 50)}`);
    console.log(`  category_id:      ${p.category_id}`);
    console.log(`  price_ron:        ${p.price_ron} RON`);
    console.log(`  old_price_ron:    ${p.old_price_ron} RON`);
    console.log(`  min_price_usd:    $${p.min_price_usd}`);
    console.log(`  ship_cost_usd:    $${p.ship_cost_usd}`);
    console.log(`  ship_free:        ${p.ship_free}`);
    console.log(`  ship_days:        ${p.ship_days_min}-${p.ship_days_max} zile`);
    console.log(`  delivery_date:    ${p.delivery_date_desc || '—'}`);
    console.log(`  ship_tracking:    ${p.ship_tracking}`);
    console.log(`  available_stock:  ${p.available_stock}`);
    console.log(`  free_ship_thres:  ${p.free_shipping_threshold || '—'}`);
    console.log(`  ─── FILTRE ───`);
    console.log(`  color:            ${p.color || '—'}`);
    console.log(`  colors:           ${p.colors?.join(', ') || '—'}`);
    console.log(`  sizes:            ${p.sizes?.join(', ') || '—'}`);
    console.log(`  neckline:         ${p.neckline || '—'}`);
    console.log(`  style:            ${p.style || '—'}`);
    console.log(`  fabric_type:      ${p.fabric_type || '—'}`);
    console.log(`  material:         ${p.material || '—'}`);
    console.log(`  pattern_type:     ${p.pattern_type || '—'}`);
    console.log(`  sleeve_style:     ${p.sleeve_style || '—'}`);
    console.log(`  waistline:        ${p.waistline || '—'}`);
    console.log(`  season:           ${p.season || '—'}`);
    console.log(`  silhouette:       ${p.silhouette || '—'}`);
    console.log(`  decoration:       ${p.decoration?.join(', ') || '—'}`);
    console.log(`  gender:           ${p.gender}`);
    console.log(`  brand:            ${p.brand || '—'}`);
    console.log(`  has_video:        ${p.has_video}`);
    console.log(`  rating:           ${p.rating} (${p.rating_count} reviews)`);
    console.log(`  orders:           ${p.orders_count}`);
    console.log(`  variants:         ${p.variants_count}`);
    console.log(`  main_image:       ${p.main_image?.slice(0, 60)}...`);
  }

  // Clean up test
  await db.query('DELETE FROM ae_variants WHERE product_id = $1', [TEST_ID]);
  await db.query('DELETE FROM ae_products WHERE ae_product_id = $1', [TEST_ID]);
  console.log('\n🗑️ Test produs șters din DB (era doar test)');
  
  await db.end();
})();
