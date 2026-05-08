/**
 * Test AliExpress Open Platform API — Direct Connection
 * Uses App Key + App Secret for signed requests
 */
const crypto = require('crypto');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const API_URL = 'https://api-sg.aliexpress.com/sync';

function signRequest(params) {
  // Sort parameters alphabetically
  const sorted = Object.keys(params).sort();
  
  // Concatenate: secret + key1value1key2value2... + secret
  let signStr = APP_SECRET;
  for (const key of sorted) {
    signStr += key + params[key];
  }
  signStr += APP_SECRET;
  
  // HMAC-SHA256 uppercase hex
  const hmac = crypto.createHmac('sha256', APP_SECRET);
  hmac.update(signStr, 'utf8');
  return hmac.digest('hex').toUpperCase();
}

async function callAPI(method, params = {}) {
  const sysParams = {
    app_key: APP_KEY,
    method: method,
    sign_method: 'sha256',
    timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ''),
    format: 'json',
    v: '2.0',
    ...params,
  };
  
  sysParams.sign = signRequest(sysParams);
  
  const url = API_URL + '?' + Object.entries(sysParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  
  console.log(`\n📡 Calling: ${method}`);
  
  const res = await fetch(url);
  const data = await res.json();
  return data;
}

async function main() {
  console.log('='.repeat(75));
  console.log('  🔌 TEST ALIEXPRESS DIRECT API');
  console.log('  App Key:', APP_KEY);
  console.log('='.repeat(75));

  // Test 1: Search for products (DS API)
  console.log('\n--- TEST 1: Product Search ---');
  const searchResult = await callAPI('aliexpress.ds.product.get', {
    product_id: '1005006507728498',  // A random product ID
  });
  
  if (searchResult.error_response) {
    console.log('❌ Error:', searchResult.error_response.msg || JSON.stringify(searchResult.error_response));
    console.log('   Code:', searchResult.error_response.code);
    console.log('   Sub msg:', searchResult.error_response.sub_msg);
  } else {
    console.log('✅ SUCCESS!');
    const result = searchResult.aliexpress_ds_product_get_response?.result;
    if (result) {
      console.log('  Product:', result.ae_item_base_info_dto?.subject?.slice(0, 60));
      console.log('  Price:', result.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o?.[0]?.ae_sku_property_dtos);
    }
    console.log('  Raw (first 500):', JSON.stringify(searchResult).slice(0, 500));
  }

  // Test 2: Category list
  console.log('\n--- TEST 2: Recommend Feed (trending) ---');
  const feedResult = await callAPI('aliexpress.ds.recommend.feed.get', {
    country: 'RO',
    target_currency: 'USD',
    target_language: 'EN',
    feed_name: 'DS center',
    page_no: '1',
    page_size: '5',
  });
  
  if (feedResult.error_response) {
    console.log('❌ Error:', feedResult.error_response.msg);
    console.log('   Code:', feedResult.error_response.code);
    console.log('   Sub:', feedResult.error_response.sub_msg);
  } else {
    console.log('✅ SUCCESS!');
    const products = feedResult.aliexpress_ds_recommend_feed_get_response?.result?.products?.traffic_product_d_t_o;
    if (products) {
      products.forEach(p => {
        console.log(`  🛍️ ${p.product_title?.slice(0, 50)} | $${p.target_sale_price} | ⭐${p.evaluate_rate}`);
      });
    } else {
      console.log('  Raw:', JSON.stringify(feedResult).slice(0, 500));
    }
  }

  // Test 3: Freight info  
  console.log('\n--- TEST 3: Shipping to Romania ---');
  const freightResult = await callAPI('aliexpress.ds.freight.query', {
    product_id: '1005006507728498',
    ship_to_country: 'RO',
    quantity: '1',
  });
  
  if (freightResult.error_response) {
    console.log('❌ Error:', freightResult.error_response.msg);
  } else {
    console.log('✅ Shipping options:');
    console.log('  Raw:', JSON.stringify(freightResult).slice(0, 500));
  }

  console.log('\n' + '='.repeat(75));
  console.log('  ✅ API TEST COMPLETE');
  console.log('='.repeat(75));
}

main().catch(e => console.error('FATAL:', e.message));
