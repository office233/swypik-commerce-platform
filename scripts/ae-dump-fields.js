/**
 * 🔬 DUMP COMPLET — Ce date returnează AliExpress pentru un produs?
 * Salvăm TOTUL ca să proiectăm tabelul corect.
 */
const crypto = require('crypto');
const fs = require('fs');

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
  console.log('⏳ Aștept 20s să treacă rate limit...');
  await new Promise(r => setTimeout(r, 20000));

  console.log('\n' + '='.repeat(80));
  console.log('  📋 STEP 1: SEARCH — ce câmpuri are fiecare produs?');
  console.log('='.repeat(80));

  const search = await callAPI('aliexpress.ds.text.search', {
    keyword: 'wireless earbuds',
    currency: 'USD',
    language: 'EN',
    local: 'en_US',
    countryCode: 'RO',
    page_no: '1',
    page_size: '3',
  });

  const searchProducts = search.aliexpress_ds_text_search_response?.data?.products?.selection_search_product;
  if (searchProducts?.length) {
    console.log(`\n  ✅ Got ${searchProducts.length} products from search`);
    
    // Dump first product COMPLETELY
    const first = searchProducts[0];
    console.log('\n  --- CÂMPURI SEARCH (produs 1) ---');
    for (const [key, val] of Object.entries(first)) {
      console.log(`  ${key}: ${JSON.stringify(val).slice(0, 100)}`);
    }
    
    // Now get DETAILS for this product
    const productId = first.itemId;
    console.log(`\n\n  Folosesc itemId: ${productId}`);

    await new Promise(r => setTimeout(r, 2000));

    console.log('\n' + '='.repeat(80));
    console.log('  📋 STEP 2: PRODUCT DETAIL — toate câmpurile');
    console.log('='.repeat(80));

    const detail = await callAPI('aliexpress.ds.product.get', {
      product_id: productId,
      target_currency: 'USD',
      target_language: 'EN',
      ship_to_country: 'RO',
      country: 'RO',
    });

    const detailResp = detail.aliexpress_ds_product_get_response;
    if (detailResp?.result) {
      const r = detailResp.result;
      
      // Base info
      console.log('\n  --- ae_item_base_info_dto ---');
      if (r.ae_item_base_info_dto) {
        for (const [k, v] of Object.entries(r.ae_item_base_info_dto)) {
          console.log(`  ${k}: ${JSON.stringify(v).slice(0, 120)}`);
        }
      }
      
      // SKU info (variante)
      console.log('\n  --- ae_item_sku_info_dtos (prima variantă) ---');
      const skus = r.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o;
      if (skus?.length) {
        console.log(`  Total variante: ${skus.length}`);
        for (const [k, v] of Object.entries(skus[0])) {
          console.log(`  ${k}: ${JSON.stringify(v).slice(0, 150)}`);
        }
      }

      // Multimedia
      console.log('\n  --- ae_multimedia_info_dto ---');
      if (r.ae_multimedia_info_dto) {
        for (const [k, v] of Object.entries(r.ae_multimedia_info_dto)) {
          console.log(`  ${k}: ${JSON.stringify(v).slice(0, 200)}`);
        }
      }

      // Shipping info from detail
      console.log('\n  --- ae_item_properties ---');
      const props = r.ae_item_properties?.ae_item_property;
      if (props?.length) {
        props.slice(0, 5).forEach(p => console.log(`  ${p.attr_name}: ${p.attr_value}`));
        if (props.length > 5) console.log(`  ... +${props.length - 5} more`);
      }

      // Store info
      console.log('\n  --- ae_store_info ---');
      if (r.ae_store_info) {
        for (const [k, v] of Object.entries(r.ae_store_info)) {
          console.log(`  ${k}: ${JSON.stringify(v).slice(0, 100)}`);
        }
      }
    } else {
      console.log('  ❌ Product detail failed:', detailResp?.rsp_code, detailResp?.rsp_msg);
      console.log('  Full:', JSON.stringify(detail).slice(0, 500));
    }

    await new Promise(r => setTimeout(r, 2000));

    // SHIPPING
    console.log('\n' + '='.repeat(80));
    console.log('  📋 STEP 3: SHIPPING — cost transport la România');
    console.log('='.repeat(80));

    const freight = await callAPI('aliexpress.ds.freight.query', {
      queryDeliveryReq: JSON.stringify({
        productId: productId,
        country: 'RO',
        provCode: '',
        cityCode: '',
        quantity: 1,
        currency: 'USD',
        language: 'en',
        local: 'en_US',
      }),
    });

    const freightResp = freight.aliexpress_ds_freight_query_response;
    if (freightResp?.result) {
      console.log('\n  --- Freight result ---');
      const options = freightResp.result.freight_options?.freight_option_d_t_o ||
                      freightResp.result.deliveryOptions || [];
      
      if (Array.isArray(options) && options.length) {
        options.forEach(o => {
          console.log('\n  --- Opțiune shipping ---');
          for (const [k, v] of Object.entries(o)) {
            console.log(`  ${k}: ${JSON.stringify(v).slice(0, 100)}`);
          }
        });
      } else {
        console.log('  Full result:', JSON.stringify(freightResp.result).slice(0, 800));
      }
    } else {
      console.log('  Full freight response:', JSON.stringify(freight).slice(0, 800));
    }

    // Save everything to file for reference
    const dump = {
      search_product: first,
      detail: detailResp?.result || null,
      freight: freightResp?.result || freight,
      all_search_keys: searchProducts.length > 0 ? Object.keys(first) : [],
    };
    fs.writeFileSync('d:\\Aicevrei\\ae-data-dump.json', JSON.stringify(dump, null, 2));
    console.log('\n\n  💾 Date salvate în ae-data-dump.json');

  } else {
    console.log('  ❌ No search results');
    console.log('  Full response:', JSON.stringify(search).slice(0, 500));
  }
}

main().catch(e => console.error('FATAL:', e.message));
