/**
 * Debug: ce returnează EXACT search-ul acum că e ONLINE?
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

async function callAPI(method, extra = {}) {
  const params = {
    app_key: APP_KEY, method, sign_method: 'sha256',
    timestamp: Date.now().toString(), format: 'json', v: '2.0',
    session: TOKEN, ...extra,
  };
  params.sign = sign(params);
  const qs = Object.entries(params)
    .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`)
    .join('&');
  const res = await fetch('https://api-sg.aliexpress.com/sync?' + qs);
  return res.json();
}

async function main() {
  // Wait 20s to clear rate limit
  console.log('⏳ Aștept 20s să treacă rate limit-ul...');
  await new Promise(r => setTimeout(r, 20000));

  // Test 1: Simple search — dump FULL response
  console.log('\n🔍 Search "phone case" — FULL RESPONSE:');
  const s1 = await callAPI('aliexpress.ds.text.search', {
    keyword: 'phone case',
    currency: 'USD',
    language: 'EN',
    local: 'en_US',
    countryCode: 'RO',
    page_no: '1',
    page_size: '5',
  });
  console.log(JSON.stringify(s1, null, 2).slice(0, 1500));
  
  await new Promise(r => setTimeout(r, 2000));

  // Test 2: Without filters  
  console.log('\n\n🔍 Search "phone" — NO FILTERS:');
  const s2 = await callAPI('aliexpress.ds.text.search', {
    keyword: 'phone',
    currency: 'USD',
    language: 'EN',
    local: 'en_US',
    countryCode: 'RO',
    page_no: '1',
    page_size: '3',
  });
  console.log(JSON.stringify(s2, null, 2).slice(0, 1500));

  await new Promise(r => setTimeout(r, 2000));

  // Test 3: Feed with different names
  console.log('\n\n🔥 Feed test — different feed names:');
  for (const feed of ['DS center', 'bestseller', 'weekly_deals', 'new_arrival']) {
    const f = await callAPI('aliexpress.ds.recommend.feed.get', {
      country: 'RO', target_currency: 'USD', target_language: 'EN',
      feed_name: feed, page_no: '1', page_size: '3',
    });
    const resp = f.aliexpress_ds_recommend_feed_get_response;
    const count = resp?.result?.total_record_count || 0;
    const products = resp?.result?.products?.traffic_product_d_t_o;
    console.log(`  "${feed}": ${count} total, ${products?.length || 0} returned`);
    if (products?.length) {
      products.forEach(p => console.log(`    $${p.target_sale_price} | ${(p.product_title||'').slice(0, 50)}`));
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // Test 4: Product detail with a well-known product
  console.log('\n\n📋 Product detail — known IDs:');
  const ids = ['1005004000000000', '1005006000000000', '1005005000000000', '4000000000000', '32000000000000'];
  for (const id of ids) {
    const d = await callAPI('aliexpress.ds.product.get', {
      product_id: id, target_currency: 'USD', target_language: 'EN',
      ship_to_country: 'RO', country: 'RO',
    });
    const resp = d.aliexpress_ds_product_get_response;
    if (resp?.result?.ae_item_base_info_dto) {
      console.log(`  ✅ ${id}: ${resp.result.ae_item_base_info_dto.subject?.slice(0, 50)}`);
    } else {
      console.log(`  ❌ ${id}: ${resp?.rsp_msg || 'no data'}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}

main().catch(e => console.error('FATAL:', e.message));
