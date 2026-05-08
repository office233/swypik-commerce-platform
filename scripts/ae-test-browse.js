/**
 * 🔬 TEST: Affiliate API — browse pe categorie cu paginare REALĂ
 * + Test dacă avem acces la affiliate.product.query cu tracking_id
 */
const crypto = require('crypto');
const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';

function sign(params) {
  const sorted = Object.keys(params).filter(k => k !== 'sign').sort();
  return crypto.createHmac('sha256', APP_SECRET).update(sorted.map(k => k + params[k]).join('')).digest('hex').toUpperCase();
}
async function callAPI(method, extra = {}) {
  const params = { app_key: APP_KEY, method, sign_method: 'sha256', timestamp: Date.now().toString(), format: 'json', v: '2.0', session: TOKEN, ...extra };
  params.sign = sign(params);
  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('&');
  const res = await fetch('https://api-sg.aliexpress.com/sync?' + qs);
  return res.json();
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('='.repeat(80));
  console.log('  🔬 TEST COMPLET: Toate API-urile disponibile');
  console.log('='.repeat(80));

  // 1. Affiliate product query — cu tracking_id
  console.log('\n\n--- 1. aliexpress.affiliate.product.query (cu tracking_id) ---');
  const r1 = await callAPI('aliexpress.affiliate.product.query', {
    category_ids: '5090301',  // Phone cases known ID
    target_currency: 'USD', target_language: 'EN',
    ship_to_country: 'RO',
    page_no: '1', page_size: '10',
    tracking_id: 'aicevrei',
  });
  console.log(JSON.stringify(r1).slice(0, 500));
  
  await sleep(2000);

  // 2. Affiliate hotproduct 
  console.log('\n\n--- 2. aliexpress.affiliate.hotproduct.query ---');
  const r2 = await callAPI('aliexpress.affiliate.hotproduct.query', {
    category_ids: '5090301',
    target_currency: 'USD', target_language: 'EN',
    ship_to_country: 'RO',
    page_no: '1', page_size: '10',
    tracking_id: 'aicevrei',
  });
  console.log(JSON.stringify(r2).slice(0, 500));

  await sleep(2000);

  // 3. affiliate.category.get — get all categories
  console.log('\n\n--- 3. aliexpress.affiliate.category.get ---');
  const r3 = await callAPI('aliexpress.affiliate.category.get', {});
  const cats = r3.aliexpress_affiliate_category_get_response?.resp_result?.result?.categories?.category;
  if (cats?.length) {
    console.log(`  ✅ ${cats.length} categorii!`);
    cats.filter(c => !c.parent_category_id).slice(0, 5).forEach(c => 
      console.log(`    ${c.category_id}: ${c.category_name}`)
    );
  } else {
    console.log(JSON.stringify(r3).slice(0, 300));
  }

  await sleep(2000);

  // 4. DS text search — testăm cu parametru suplimentar "local" setat corect
  console.log('\n\n--- 4. ds.text.search (page 1 vs page 2 test exact) ---');
  for (let p = 1; p <= 3; p++) {
    await sleep(2000);
    const r = await callAPI('aliexpress.ds.text.search', {
      keyword: 'phone case',
      currency: 'USD', language: 'EN', local: 'en_US',
      page_no: String(p), page_size: '3',
    });
    const prods = r.aliexpress_ds_text_search_response?.data?.products?.selection_search_product || [];
    console.log(`  Page ${p}: [${prods.map(x => x.itemId).join(', ')}]`);
  }

  // 5. DSA API?
  console.log('\n\n--- 5. aliexpress.ds.product.search (alternate name?) ---');
  await sleep(2000);
  const r5 = await callAPI('aliexpress.ds.product.search', {
    keyword: 'phone case',
    target_currency: 'USD', target_language: 'EN',
    ship_to_country: 'RO',
    page_no: '1', page_size: '10',
  });
  console.log(JSON.stringify(r5).slice(0, 300));

  // 6. Recommend feed with proper feed name
  console.log('\n\n--- 6. ds.recommend.feed.get with "DS recommend" ---');
  await sleep(2000);
  const feedNames = ['DS recommend', 'ALL', 'Phone cases', 'Electronics'];
  for (const fn of feedNames) {
    const r = await callAPI('aliexpress.ds.recommend.feed.get', {
      feed_name: fn, country: 'RO', target_currency: 'USD', target_language: 'EN',
      category_id: '509', page_no: '1', page_size: '3',
    });
    const prods = r.aliexpress_ds_recommend_feed_get_response?.result?.products?.traffic_product_d_t_o;
    console.log(`  "${fn}": ${prods?.length || 0} produse ${prods?.length ? '✅' : '❌'}`);
    await sleep(1000);
  }
}

main().catch(e => console.error('FATAL:', e.message));
