/**
 * 🔥 ALIEXPRESS DIRECT API — FINAL WORKING VERSION
 * DS APIs use nested JSON params, not flat params
 */
const crypto = require('crypto');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';

function sign(params) {
  const sorted = Object.keys(params).filter(k => k !== 'sign').sort();
  const str = sorted.map(k => k + params[k]).join('');
  return crypto.createHmac('sha256', APP_SECRET).update(str).digest('hex').toUpperCase();
}

async function callAPI(method, bizParams = {}) {
  const params = {
    app_key: APP_KEY,
    method,
    sign_method: 'sha256',
    timestamp: Date.now().toString(),
    format: 'json',
    v: '2.0',
    session: TOKEN,
  };
  
  // Add business params directly (DS APIs take flat params)
  Object.assign(params, bizParams);
  params.sign = sign(params);
  
  const qs = Object.entries(params)
    .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`)
    .join('&');
  const res = await fetch('https://api-sg.aliexpress.com/sync?' + qs);
  return res.json();
}

async function main() {
  console.log('='.repeat(75));
  console.log('  🛍️  ALIEXPRESS DIRECT API — FULL TEST');
  console.log('='.repeat(75));

  // 1. Text search — needs countryCode
  console.log('\n🔍 Test 1: Căutare "phone case"');
  const s1 = await callAPI('aliexpress.ds.text.search', {
    keyword: 'phone case',
    target_currency: 'USD',
    target_language: 'EN',
    ship_to_country: 'RO',
    countryCode: 'RO',
    page_no: '1',
    page_size: '5',
    sort: 'LAST_VOLUME_DESC',
  });
  
  const sr = s1.aliexpress_ds_text_search_response;
  if (sr?.result?.products) {
    const prods = sr.result.products.product_d_t_o || sr.result.products;
    const total = sr.result.total_count || sr.result.total_record_count;
    console.log(`  ✅ Found ${total} products!`);
    (Array.isArray(prods) ? prods : []).forEach((p, i) => {
      console.log(`  ${i+1}. $${p.target_sale_price} | ${(p.product_title||'').slice(0, 50)}`);
    });
  } else {
    console.log('  ', JSON.stringify(s1).slice(0, 300));
  }

  // 2. Product detail — use a known active product
  console.log('\n\n📋 Test 2: Detalii produs');
  // First search to get a valid product ID
  const s2 = await callAPI('aliexpress.ds.product.get', {
    product_id: '1005007350492498',
    target_currency: 'USD',
    target_language: 'EN',
    ship_to_country: 'RO',
    countryCode: 'RO',
  });
  
  const dr = s2.aliexpress_ds_product_get_response;
  if (dr?.result?.ae_item_base_info_dto) {
    const base = dr.result.ae_item_base_info_dto;
    console.log(`  ✅ ${base.subject?.slice(0, 55)}`);
    console.log(`     Category: ${base.category_id} | Price: ${base.price_range}`);
    const skus = dr.result.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o;
    console.log(`     Variants: ${skus?.length || 0}`);
    const imgs = dr.result.ae_multimedia_info_dto?.image_urls;
    console.log(`     Images: ${imgs?.split(';')?.length || 0}`);
  } else {
    console.log(`  rsp_code: ${dr?.rsp_code} | ${dr?.rsp_msg || JSON.stringify(s2).slice(0, 200)}`);
  }

  // 3. Categories
  console.log('\n\n📂 Test 3: Categorii');
  const s3 = await callAPI('aliexpress.ds.category.get', {
    category_id: '0',
  });
  const cr = s3.aliexpress_ds_category_get_response;
  if (cr?.result?.categories?.category_d_t_o) {
    const cats = cr.result.categories.category_d_t_o;
    console.log(`  ✅ ${cats.length} categorii principale!`);
    cats.slice(0, 10).forEach(c => {
      console.log(`  📁 ${c.category_id}: ${c.category_name}`);
    });
    if (cats.length > 10) console.log(`  ... și încă ${cats.length - 10} categorii`);
  } else {
    console.log('  ', JSON.stringify(s3).slice(0, 300));
  }

  // 4. Order creation info (just check endpoint exists)
  console.log('\n\n🛒 Test 4: DS Order API available?');
  const s4 = await callAPI('aliexpress.ds.order.create', {
    param_place_order_request: JSON.stringify({
      product_items: [{ product_id: 0, quantity: 0, sku_id: '0' }],
      logistics_address: { country: 'RO' },
    }),
  });
  // We expect an error (invalid data) but NOT "InvalidApiPath" — that means the API works
  if (s4.error_response?.code === 'InvalidApiPath') {
    console.log('  ❌ Order API nu e disponibil');
  } else {
    console.log('  ✅ Order API e activ! (error expected cu date test)');
    console.log('  ', s4.error_response?.msg || s4.aliexpress_ds_order_create_response?.rsp_msg || JSON.stringify(s4).slice(0, 200));
  }

  console.log('\n' + '='.repeat(75));
}

main().catch(e => console.error('FATAL:', e.message));
