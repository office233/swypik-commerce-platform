/**
 * 🚀 IMPORT CORECT PE CATEGORIE
 * 
 * Strategia: keyword relevante + category_id + verificare categorie reală
 * Produsul se inserează DOAR dacă categoria reală din Detail 
 * aparține aceleiași familii de categorie pe care o importăm.
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

// ═══════════════════════════════════════════════════════
// CONFIG: Categorii cu keyword-urile lor
// Fiecare keyword caută 20 produse → total unice per subcategorie
// ═══════════════════════════════════════════════════════
const CATEGORY_IMPORTS = [
  {
    categoryId: 202228401,  // Mobile Phone Cases & Covers
    parentCategoryId: 100007375,  // Phones & Telecommunications Accessories
    keywords: ["phone case", "iphone case", "samsung case", "phone cover silicone", "magsafe case"],
    // Categorii AliExpress valide pentru acest produs (din detail)
    validCategoryIds: [
      202228401, // Mobile Phone Cases & Covers
      380230,    // (alias - unele huse au acest ID)
      100007375, // parent
    ],
    // Validare prin titlu — titlul TREBUIE să conțină cel puțin un cuvânt
    titleMustContain: ["case", "cover", "funda", "coque", "hülle", "capa", "custodia"],
  },
];

async function importProduct(db, productId, config) {
  try {
    const { rows: existing } = await db.query('SELECT id FROM ae_products WHERE ae_product_id = $1', [productId]);
    if (existing.length) return { status: 'skip', reason: 'exists' };

    const detail = await callAPI('aliexpress.ds.product.get', {
      product_id: String(productId),
      target_currency: 'USD', target_language: 'EN',
      ship_to_country: 'RO', country: 'RO',
    });
    const dr = detail.aliexpress_ds_product_get_response?.result;
    if (!dr?.ae_item_base_info_dto) return { status: 'fail', reason: 'no detail' };

    const base = dr.ae_item_base_info_dto;
    const skus = dr.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || [];
    if (!skus.length) return { status: 'fail', reason: 'no SKUs' };

    // ═══ VALIDARE CATEGORIE ═══
    // Verifică prin titlu dacă produsul e relevant
    const title = (base.subject || '').toLowerCase();
    const isRelevant = config.titleMustContain.some(word => title.includes(word));
    if (!isRelevant) {
      return { status: 'reject', reason: `title "${base.subject?.slice(0,30)}" not matching` };
    }

    const store = dr.ae_store_info || {};
    const video = dr.ae_multimedia_info_dto?.ae_video_dtos?.ae_video_d_t_o?.[0];
    const imageUrls = (dr.ae_multimedia_info_dto?.image_urls || '').split(';').filter(Boolean);
    const props = dr.ae_item_properties?.ae_item_property || [];

    // Shipping
    await sleep(2000);
    let shipData = { method: 'Standard', cost: 0, free: true, minDays: 7, maxDays: 15, tracking: false, from: 'CN' };
    try {
      const freight = await callAPI('aliexpress.ds.freight.query', {
        queryDeliveryReq: JSON.stringify({
          productId: String(productId), selectedSkuId: String(skus[0].sku_id),
          country: 'RO', locale: 'en_US', quantity: 1, currency: 'USD', language: 'en',
        }),
      });
      const opts = freight.aliexpress_ds_freight_query_response?.result?.delivery_options?.delivery_option_d_t_o || [];
      if (opts.length) {
        const best = opts[0];
        const cost = best.freight?.cent ? best.freight.cent / 100 : 0;
        shipData = { method: best.company || best.code || 'Standard', cost, free: best.free_shipping || cost === 0,
          minDays: best.min_delivery_days || 7, maxDays: best.max_delivery_days || 15,
          tracking: best.tracking || false, from: best.ship_from_country || 'CN' };
      }
    } catch (e) {}

    const minPrice = Math.min(...skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '999')));
    const maxPrice = Math.max(...skus.map(s => parseFloat(s.offer_sale_price || s.sku_price || '0')));
    const origPrice = Math.max(...skus.map(s => parseFloat(s.sku_price || '0')));
    const { price, oldPrice, markup } = calculatePriceRON(minPrice, shipData.cost);
    const brand = props.find(p => p.attr_name === 'Brand Name')?.attr_value || null;

    // INSERT — forțează categoria CORECTĂ (din config, nu din AliExpress detail)
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
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
      ON CONFLICT (ae_product_id) DO NOTHING
    `, [
      base.product_id, config.categoryId, base.subject,
      base.detail || '', base.mobile_detail ? JSON.parse(base.mobile_detail) : null,
      minPrice, maxPrice, origPrice, price, oldPrice, markup,
      imageUrls[0] || '', imageUrls, video?.media_url || null, video?.poster_url || null, !!video?.media_url,
      parseFloat(base.avg_evaluation_rating || '0'), parseInt(base.evaluation_count || '0'),
      parseInt(base.sales_count || '0'), base.product_status_type || 'onSelling',
      brand, JSON.stringify(props.map(p => ({ name: p.attr_name, value: p.attr_value }))),
      shipData.method, shipData.cost, shipData.free, shipData.minDays, shipData.maxDays, shipData.tracking, shipData.from,
      store.store_id, store.store_name, parseFloat(store.item_as_described_rating || '0'),
      skus.length, `https://www.aliexpress.com/item/${base.product_id}.html`,
    ]);

    // Variants — only insert first 20 to keep it manageable
    const topSkus = skus.filter(s => (s.sku_available_stock || 0) > 0).slice(0, 30);
    const insertSkus = topSkus.length ? topSkus : skus.slice(0, 20);
    for (const sku of insertSkus) {
      const varName = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o?.map(p => p.sku_property_value).join(', ') || 'Default';
      const varImage = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o?.find(p => p.sku_image)?.sku_image || null;
      const skuPrice = parseFloat(sku.offer_sale_price || sku.sku_price || '0');
      const { price: skuRon } = calculatePriceRON(skuPrice, shipData.cost);
      await db.query(`
        INSERT INTO ae_variants (product_id, sku_id, price_usd, original_price_usd, price_ron, variant_name, variant_image, stock, properties)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (product_id, sku_id) DO NOTHING
      `, [base.product_id, String(sku.sku_id), skuPrice, parseFloat(sku.sku_price || '0'), skuRon,
          varName, varImage, sku.sku_available_stock || 0,
          JSON.stringify(sku.ae_sku_property_dtos?.ae_sku_property_d_t_o?.map(p => ({ name: p.sku_property_name, value: p.sku_property_value })) || [])]);
    }

    return { status: 'ok', title: base.subject?.slice(0, 40), price, video: !!video?.media_url, variants: insertSkus.length };
  } catch (e) {
    return { status: 'fail', reason: e.message?.slice(0, 50) };
  }
}

async function main() {
  const db = new Client({ connectionString: NEON_URL });
  await db.connect();

  for (const config of CATEGORY_IMPORTS) {
    // Get category name
    const { rows: catInfo } = await db.query('SELECT name_ro FROM ae_categories WHERE ae_category_id = $1', [config.categoryId]);
    const catName = catInfo[0]?.name_ro || 'Unknown';

    console.log('='.repeat(80));
    console.log(`  🚀 IMPORT: ${catName} (${config.categoryId})`);
    console.log(`  📝 Keywords: ${config.keywords.join(', ')}`);
    console.log(`  ✅ Validare: titlu trebuie să conțină [${config.titleMustContain.join(', ')}]`);
    console.log('='.repeat(80));

    let imported = 0, rejected = 0, skipped = 0, failed = 0, withVideo = 0;
    const seenIds = new Set();

    for (const keyword of config.keywords) {
      console.log(`\n🔍 Keyword: "${keyword}"...`);
      
      for (let page = 1; page <= 3; page++) {
        await sleep(2000);
        const search = await callAPI('aliexpress.ds.text.search', {
          keyword, category_id: String(config.categoryId),
          currency: 'USD', language: 'EN', local: 'en_US', countryCode: 'RO',
          page_no: String(page), page_size: '20',
        });
        const products = search.aliexpress_ds_text_search_response?.data?.products?.selection_search_product;
        if (!products?.length) { console.log(`  Pagina ${page}: 0 produse — stop`); break; }

        // Check if same products as before (pagination broken)
        const newProducts = products.filter(p => !seenIds.has(String(p.itemId)));
        if (!newProducts.length) { console.log(`  Pagina ${page}: doar duplicate — stop keyword`); break; }
        
        console.log(`  Pagina ${page}: ${newProducts.length} noi (${products.length - newProducts.length} deja văzute)`);

        for (const p of newProducts) {
          seenIds.add(String(p.itemId));
          process.stdout.write(`    ${String(p.itemId).padEnd(20)} `);
          
          await sleep(2000);
          const result = await importProduct(db, p.itemId, config);
          
          if (result.status === 'ok') {
            imported++;
            if (result.video) withVideo++;
            console.log(`✅ ${result.title}... | ${result.price} RON | ${result.variants} var${result.video ? ' 🎬' : ''}`);
          } else if (result.status === 'reject') {
            rejected++;
            console.log(`🚫 RESPINS: ${result.reason}`);
          } else if (result.status === 'skip') {
            skipped++;
            console.log(`⏭️ deja`);
          } else {
            failed++;
            console.log(`❌ ${result.reason}`);
          }
        }
      }
    }

    // Update count
    await db.query('UPDATE ae_categories SET product_count = (SELECT COUNT(*) FROM ae_products WHERE category_id = $1) WHERE ae_category_id = $1', [config.categoryId]);

    console.log('\n' + '='.repeat(80));
    console.log(`  📊 ${catName}: ${imported} importate, ${rejected} respinse, ${skipped} skip, ${failed} fail, ${withVideo} cu video`);
    console.log('='.repeat(80));
  }

  // Final stats
  const { rows: p } = await db.query('SELECT COUNT(*) as c FROM ae_products');
  const { rows: v } = await db.query('SELECT COUNT(*) as c FROM ae_variants');
  console.log(`\n📦 TOTAL: ${p[0].c} produse, ${v[0].c} variante`);

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
