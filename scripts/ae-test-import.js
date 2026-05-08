/**
 * 🧪 TEST: Import 1 produs complet — Search → Detail → Shipping → Insert
 * Verificăm că totul se completează corect în ae_products + ae_variants
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
  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('&');
  return (await fetch('https://api-sg.aliexpress.com/sync?' + qs)).json();
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Markup pricing
function calculatePriceRON(costUsd, shipUsd) {
  const totalRon = (costUsd + shipUsd) * 4.55 * 1.19;
  const mk = costUsd < 3 ? 2.0 : (costUsd < 50 ? 1.5 : 1.3);
  const raw = totalRon * mk;
  const pts = [14,19,24,29,39,49,59,69,79,89,99,119,129,149,169,189,199,219,249,269,299,349,399,449,499];
  const price = pts.find(p => p >= raw) || Math.ceil(raw / 100) * 100 - 1;
  const oldMul = 1.6 + (Math.abs(Math.round(costUsd * 100)) % 30) / 100;
  const oldPrice = pts.find(p => p >= price * oldMul) || Math.ceil(price * oldMul / 10) * 10 - 1;
  return { price, oldPrice, markup: mk };
}

async function main() {
  console.log('='.repeat(80));
  console.log('  🧪 TEST: Import 1 produs complet');
  console.log('='.repeat(80));

  // STEP 1: Search
  console.log('\n📍 STEP 1: Search...');
  await sleep(2000);
  const search = await callAPI('aliexpress.ds.text.search', {
    keyword: 'wireless earbuds bluetooth',
    currency: 'USD', language: 'EN', local: 'en_US', countryCode: 'RO',
    page_no: '1', page_size: '5',
  });
  const products = search.aliexpress_ds_text_search_response?.data?.products?.selection_search_product;
  if (!products?.length) { console.log('❌ No search results!'); return; }
  
  // Pick first product
  const searchItem = products[0];
  console.log(`  ✅ Found: "${searchItem.title?.slice(0, 60)}..." ($${searchItem.targetSalePrice})`);
  console.log(`  ID: ${searchItem.itemId}`);

  // STEP 2: Product Detail
  console.log('\n📍 STEP 2: Product Detail...');
  await sleep(2000);
  const detail = await callAPI('aliexpress.ds.product.get', {
    product_id: String(searchItem.itemId),
    target_currency: 'USD', target_language: 'EN',
    ship_to_country: 'RO', country: 'RO',
  });
  const dr = detail.aliexpress_ds_product_get_response?.result;
  if (!dr?.ae_item_base_info_dto) {
    console.log('❌ No detail! Code:', detail.aliexpress_ds_product_get_response?.rsp_code);
    return;
  }

  const base = dr.ae_item_base_info_dto;
  const skus = dr.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || [];
  const store = dr.ae_store_info || {};
  const video = dr.ae_multimedia_info_dto?.ae_video_dtos?.ae_video_d_t_o?.[0];
  const imageUrls = (dr.ae_multimedia_info_dto?.image_urls || '').split(';').filter(Boolean);
  const props = dr.ae_item_properties?.ae_item_property || [];

  console.log(`  ✅ Title: ${base.subject?.slice(0, 60)}`);
  console.log(`  ✅ Category ID: ${base.category_id}`);
  console.log(`  ✅ Status: ${base.product_status_type}`);
  console.log(`  ✅ Rating: ${base.avg_evaluation_rating} (${base.evaluation_count} reviews)`);
  console.log(`  ✅ Orders: ${base.sales_count}`);
  console.log(`  ✅ SKUs: ${skus.length} variante`);
  console.log(`  ✅ Images: ${imageUrls.length}`);
  console.log(`  ✅ Video: ${video ? 'DA ✅' : 'NU ❌'}`);
  console.log(`  ✅ Store: ${store.store_name} (${store.item_as_described_rating})`);
  console.log(`  ✅ Brand: ${props.find(p => p.attr_name === 'Brand Name')?.attr_value || 'N/A'}`);

  // STEP 3: Shipping
  console.log('\n📍 STEP 3: Shipping to Romania...');
  const firstSku = skus[0];
  if (!firstSku) { console.log('❌ No SKU for shipping!'); return; }
  
  await sleep(2000);
  const freight = await callAPI('aliexpress.ds.freight.query', {
    queryDeliveryReq: JSON.stringify({
      productId: String(searchItem.itemId),
      selectedSkuId: String(firstSku.sku_id),
      country: 'RO', locale: 'en_US',
      quantity: 1, currency: 'USD', language: 'en',
    }),
  });
  const shipOptions = freight.aliexpress_ds_freight_query_response?.result?.delivery_options?.delivery_option_d_t_o || [];
  
  let shipData = { method: 'Standard', cost: 0, free: true, minDays: 7, maxDays: 15, tracking: false, from: 'CN' };
  if (shipOptions.length) {
    const best = shipOptions[0];
    const cost = best.freight?.cent ? best.freight.cent / 100 : 0;
    shipData = {
      method: best.company || best.code || 'Standard',
      cost: cost,
      free: best.free_shipping || cost === 0,
      minDays: best.min_delivery_days || 7,
      maxDays: best.max_delivery_days || 15,
      tracking: best.tracking || false,
      from: best.ship_from_country || 'CN',
    };
  }
  console.log(`  ✅ Method: ${shipData.method}`);
  console.log(`  ✅ Cost: ${shipData.free ? 'FREE 🆓' : '$' + shipData.cost}`);
  console.log(`  ✅ Days: ${shipData.minDays}-${shipData.maxDays}`);
  console.log(`  ✅ Tracking: ${shipData.tracking ? 'DA' : 'NU'}`);

  // STEP 4: Calculate price
  const minPrice = Math.min(...skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '999')));
  const maxPrice = Math.max(...skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '0')));
  const origPrice = Math.max(...skus.map(s => parseFloat(s.sku_price || '0')));
  const { price, oldPrice, markup } = calculatePriceRON(minPrice, shipData.cost);

  console.log('\n📍 STEP 4: Pricing...');
  console.log(`  ✅ Cost AliExpress: $${minPrice} - $${maxPrice}`);
  console.log(`  ✅ Shipping: $${shipData.cost}`);
  console.log(`  ✅ Markup: ${markup}x`);
  console.log(`  ✅ PREȚ FINAL: ${price} RON (era ${oldPrice} RON)`);

  // STEP 5: Insert into DB
  console.log('\n📍 STEP 5: Insert in NeonDB...');
  const db = new Client({ connectionString: NEON_URL });
  await db.connect();

  // Check if category exists — auto-create if missing
  let { rows: catRows } = await db.query('SELECT ae_category_id, name, name_ro FROM ae_categories WHERE ae_category_id = $1', [base.category_id]);
  if (!catRows.length) {
    console.log(`  ⚠️ Category ${base.category_id} not in tree — creating dynamically...`);
    // Try to get category name from AliExpress
    await sleep(2000);
    const catData = await callAPI('aliexpress.ds.category.get', { category_id: String(base.category_id) });
    const catInfo = catData.aliexpress_ds_category_get_response?.resp_result?.result?.categories?.category?.[0];
    const catName = catInfo?.category_name || `Category ${base.category_id}`;
    const parentId = catInfo?.parent_category_id || null;
    
    // Check if parent exists
    if (parentId) {
      const { rows: parentRows } = await db.query('SELECT ae_category_id FROM ae_categories WHERE ae_category_id = $1', [parentId]);
      if (!parentRows.length) {
        // Create parent too
        await db.query(
          'INSERT INTO ae_categories (ae_category_id, parent_id, name, name_ro, level) VALUES ($1, NULL, $2, $2, 2) ON CONFLICT DO NOTHING',
          [parentId, `Parent ${parentId}`]
        );
      }
    }
    
    await db.query(
      'INSERT INTO ae_categories (ae_category_id, parent_id, name, name_ro, level) VALUES ($1, $2, $3, $3, $4) ON CONFLICT DO NOTHING',
      [base.category_id, parentId, catName, parentId ? 3 : 2]
    );
    
    catRows = (await db.query('SELECT ae_category_id, name, name_ro FROM ae_categories WHERE ae_category_id = $1', [base.category_id])).rows;
    console.log(`  ✅ Created category: ${catName} (ID ${base.category_id})`);
  } else {
    console.log(`  ✅ Category: ${catRows[0].name_ro} (${catRows[0].name}) — ID ${catRows[0].ae_category_id}`);
  }

  // Insert product
  const videoUrl = video?.media_url || null;
  const videoPoster = video?.poster_url || null;
  const brand = props.find(p => p.attr_name === 'Brand Name')?.attr_value || null;
  const propsJson = props.map(p => ({ name: p.attr_name, value: p.attr_value }));

  await db.query(`
    INSERT INTO ae_products (
      ae_product_id, category_id, title, description, mobile_detail,
      min_price_usd, max_price_usd, original_price_usd,
      price_ron, old_price_ron, markup,
      main_image, images, video_url, video_poster, has_video,
      rating, rating_count, orders_count, product_status,
      brand, properties,
      ship_method, ship_cost_usd, ship_free, ship_days_min, ship_days_max, ship_tracking, ship_from,
      store_id, store_name, store_rating,
      variants_count, source_url
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14, $15, $16,
      $17, $18, $19, $20,
      $21, $22,
      $23, $24, $25, $26, $27, $28, $29,
      $30, $31, $32,
      $33, $34
    ) ON CONFLICT (ae_product_id) DO NOTHING
    RETURNING id
  `, [
    base.product_id, base.category_id, base.subject,
    base.detail || '', base.mobile_detail ? JSON.parse(base.mobile_detail) : null,
    minPrice, maxPrice, origPrice,
    price, oldPrice, markup,
    imageUrls[0] || '', imageUrls, videoUrl, videoPoster, !!videoUrl,
    parseFloat(base.avg_evaluation_rating || '0'),
    parseInt(base.evaluation_count || '0'),
    parseInt(base.sales_count || '0'),
    base.product_status_type || 'onSelling',
    brand, JSON.stringify(propsJson),
    shipData.method, shipData.cost, shipData.free, shipData.minDays, shipData.maxDays, shipData.tracking, shipData.from,
    store.store_id, store.store_name, parseFloat(store.item_as_described_rating || '0'),
    skus.length, `https://www.aliexpress.com/item/${base.product_id}.html`,
  ]);
  console.log(`  ✅ Produs inserat în ae_products!`);

  // Insert variants
  let varInserted = 0;
  for (const sku of skus) {
    const varName = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o
      ?.map(p => p.sku_property_value).join(', ') || 'Default';
    const varImage = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o
      ?.find(p => p.sku_image)?.sku_image || null;
    const skuPrice = parseFloat(sku.offer_sale_price || sku.sku_price || '0');
    const skuOrig = parseFloat(sku.sku_price || '0');
    const { price: skuRon } = calculatePriceRON(skuPrice, shipData.cost);

    await db.query(`
      INSERT INTO ae_variants (product_id, sku_id, price_usd, original_price_usd, price_ron, variant_name, variant_image, stock, properties)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (product_id, sku_id) DO NOTHING
    `, [
      base.product_id, String(sku.sku_id), skuPrice, skuOrig, skuRon,
      varName, varImage, sku.sku_available_stock || 0,
      JSON.stringify(sku.ae_sku_property_dtos?.ae_sku_property_d_t_o?.map(p => ({ name: p.sku_property_name, value: p.sku_property_value })) || []),
    ]);
    varInserted++;
  }
  console.log(`  ✅ ${varInserted} variante inserate în ae_variants!`);

  // STEP 6: Verify
  console.log('\n📍 STEP 6: Verificare finală...');
  const { rows: prod } = await db.query(`
    SELECT p.*, c.name as cat_name, c.name_ro as cat_name_ro, 
           (SELECT name FROM ae_categories WHERE ae_category_id = c.parent_id) as parent_cat
    FROM ae_products p
    JOIN ae_categories c ON c.ae_category_id = p.category_id
    WHERE p.ae_product_id = $1
  `, [base.product_id]);

  const { rows: vars } = await db.query('SELECT * FROM ae_variants WHERE product_id = $1', [base.product_id]);
  const { rows: counts } = await db.query('SELECT COUNT(*) as products FROM ae_products');
  const { rows: varCounts } = await db.query('SELECT COUNT(*) as variants FROM ae_variants');

  const p = prod[0];
  console.log('\n' + '='.repeat(80));
  console.log('  📊 PRODUS IMPORTAT COMPLET');
  console.log('='.repeat(80));
  console.log(`  📛 Titlu: ${p.title?.slice(0, 60)}`);
  console.log(`  📂 Categorie: ${p.parent_cat} → ${p.cat_name_ro}`);
  console.log(`  💰 Preț: ${p.price_ron} RON (era ${p.old_price_ron} RON)`);
  console.log(`  💵 Cost: $${p.min_price_usd} - $${p.max_price_usd}`);
  console.log(`  📈 Markup: ${p.markup}x`);
  console.log(`  ⭐ Rating: ${p.rating} (${p.rating_count} reviews, ${p.orders_count} comenzi)`);
  console.log(`  🖼️ Imagini: ${p.images?.length || 0}`);
  console.log(`  🎬 Video: ${p.has_video ? p.video_url?.slice(0, 50) + '...' : 'NU'}`);
  console.log(`  🚚 Shipping: ${p.ship_method} — ${p.ship_free ? 'GRATIS' : '$'+p.ship_cost_usd} (${p.ship_days_min}-${p.ship_days_max} zile)`);
  console.log(`  🏪 Magazin: ${p.store_name} (${p.store_rating})`);
  console.log(`  📦 Variante: ${vars.length}`);
  vars.slice(0, 5).forEach(v => console.log(`    → ${v.variant_name}: $${v.price_usd} → ${v.price_ron} RON (stoc: ${v.stock})`));
  if (vars.length > 5) console.log(`    → ... +${vars.length - 5} more`);
  console.log(`\n  📊 Total DB: ${counts[0].products} produse, ${varCounts[0].variants} variante`);
  console.log('='.repeat(80));

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
