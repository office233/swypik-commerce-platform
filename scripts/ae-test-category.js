/**
 * TEST: Cum tragem produse din categorie?
 * 
 * Întrebări de rezolvat:
 * 1. Search-ul suportă filtrare pe category_id?
 * 2. Produsul detaliat are category_id corect?
 * 3. Câte pagini putem trage per categorie?
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
  return (await fetch('https://api-sg.aliexpress.com/sync?' + qs)).json();
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('='.repeat(80));
  console.log('  🔬 TEST: Cum tragem produse din categorie?');
  console.log('='.repeat(80));

  // TEST 1: Search cu category_id
  console.log('\n--- TEST 1: Search cu category_id ---');
  // Toys & Hobbies = category 26
  const s1 = await callAPI('aliexpress.ds.text.search', {
    keyword: '',  // fără keyword, doar categorie
    category_id: '26',
    currency: 'USD', language: 'EN', local: 'en_US', countryCode: 'RO',
    page_no: '1', page_size: '5',
  });
  const sr1 = s1.aliexpress_ds_text_search_response;
  if (sr1?.data?.products?.selection_search_product?.length) {
    console.log('  ✅ Funcționează cu category_id fără keyword!');
    console.log(`  Produse: ${sr1.data.products.selection_search_product.length}`);
    sr1.data.products.selection_search_product.forEach(p => {
      console.log(`    $${p.targetSalePrice} | ${(p.title||'').slice(0, 50)} | orders: ${p.orders}`);
    });
  } else {
    console.log('  ❌ Nu merge fără keyword. Răspuns:', JSON.stringify(s1).slice(0, 300));
  }

  await sleep(2000);

  // TEST 2: Search cu keyword generic + category
  console.log('\n--- TEST 2: Search keyword + category_id ---');
  const s2 = await callAPI('aliexpress.ds.text.search', {
    keyword: 'toy',
    category_id: '26',
    currency: 'USD', language: 'EN', local: 'en_US', countryCode: 'RO',
    page_no: '1', page_size: '5',
  });
  const sr2 = s2.aliexpress_ds_text_search_response;
  if (sr2?.data?.products?.selection_search_product?.length) {
    console.log('  ✅ Funcționează cu keyword + category!');
    console.log(`  Total: ${sr2.data.totalCount}`);
    sr2.data.products.selection_search_product.forEach(p => {
      console.log(`    $${p.targetSalePrice} | ${(p.title||'').slice(0, 50)}`);
    });
  } else {
    console.log('  Răspuns:', JSON.stringify(s2).slice(0, 300));
  }

  await sleep(2000);

  // TEST 3: Luăm detaliu produs — ce category_id are?
  console.log('\n--- TEST 3: Product Detail — are category_id? ---');
  const firstProduct = sr2?.data?.products?.selection_search_product?.[0] ||
                       sr1?.data?.products?.selection_search_product?.[0];
  if (firstProduct) {
    const d = await callAPI('aliexpress.ds.product.get', {
      product_id: String(firstProduct.itemId),
      target_currency: 'USD', target_language: 'EN',
      ship_to_country: 'RO', country: 'RO',
    });
    const dr = d.aliexpress_ds_product_get_response?.result;
    if (dr?.ae_item_base_info_dto) {
      const base = dr.ae_item_base_info_dto;
      console.log(`  ✅ Product: ${base.subject?.slice(0, 50)}`);
      console.log(`  category_id: ${base.category_id}`);
      console.log(`  product_id: ${base.product_id}`);
      console.log(`  status: ${base.product_status_type}`);
      console.log(`  rating: ${base.avg_evaluation_rating}, reviews: ${base.evaluation_count}, orders: ${base.sales_count}`);
      
      // Show variants summary
      const skus = dr.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o;
      if (skus) {
        console.log(`\n  📦 ${skus.length} VARIANTE:`);
        skus.forEach(s => {
          const propName = s.ae_sku_property_dtos?.ae_sku_property_d_t_o
            ?.map(p => p.sku_property_value).join(', ') || '?';
          console.log(`    SKU ${s.sku_id}: $${s.offer_sale_price} | "${propName}" | stoc: ${s.sku_available_stock}`);
        });
      }

      // Video?
      const vid = dr.ae_multimedia_info_dto?.ae_video_dtos?.ae_video_d_t_o;
      if (vid?.length) {
        console.log(`\n  🎬 VIDEO: ${vid[0].media_url || 'poster: ' + vid[0].poster_url}`);
      } else {
        console.log('\n  ❌ Fără video');
      }

      // Images count
      const imgs = dr.ae_multimedia_info_dto?.image_urls?.split(';');
      console.log(`  🖼️ ${imgs?.length || 0} imagini`);

    } else {
      console.log('  ❌ Detail failed:', d.aliexpress_ds_product_get_response?.rsp_msg);
    }
  }

  await sleep(2000);

  // TEST 4: Subcategorie directă
  console.log('\n--- TEST 4: Subcategorie directă (Stress Relief Toy = 200246142) ---');
  const s4 = await callAPI('aliexpress.ds.text.search', {
    keyword: '',
    category_id: '200246142',
    currency: 'USD', language: 'EN', local: 'en_US', countryCode: 'RO',
    page_no: '1', page_size: '5',
  });
  const sr4 = s4.aliexpress_ds_text_search_response;
  const p4 = sr4?.data?.products?.selection_search_product;
  if (p4?.length) {
    console.log(`  ✅ Subcategorie funcționează! ${p4.length} produse`);
    p4.forEach(p => console.log(`    $${p.targetSalePrice} | ${(p.title||'').slice(0, 50)}`));
  } else {
    console.log('  Răspuns:', JSON.stringify(s4).slice(0, 300));
  }

  await sleep(2000);

  // TEST 5: Paginare — pagina 2 și 3
  console.log('\n--- TEST 5: Paginare (pagina 2) ---');
  const s5 = await callAPI('aliexpress.ds.text.search', {
    keyword: 'toy',
    category_id: '26',
    currency: 'USD', language: 'EN', local: 'en_US', countryCode: 'RO',
    page_no: '2', page_size: '20',
  });
  const sr5 = s5.aliexpress_ds_text_search_response;
  const p5 = sr5?.data?.products?.selection_search_product;
  console.log(`  Pagina 2: ${p5?.length || 0} produse`);
  if (p5?.length) console.log(`    Primul: $${p5[0].targetSalePrice} | ${(p5[0].title||'').slice(0, 50)}`);

  console.log('\n' + '='.repeat(80));
  console.log('  📊 CONCLUZII');
  console.log('='.repeat(80));
}

main().catch(e => console.error('FATAL:', e.message));
