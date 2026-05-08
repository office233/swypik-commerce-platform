/**
 * 🔥 ALIEXPRESS PIPELINE V2 — Tabel NOU + Import produse ieftine
 * 
 * 1. Șterge tabelul vechi CJ
 * 2. Creează tabel nou aliexpress_products cu TOATE câmpurile
 * 3. Search → Detail → Shipping → Insert
 */
const crypto = require('crypto');
const { Client } = require('pg');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

// --- API Client ---
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

// --- Search ---
async function searchProducts(keyword, page = 1) {
  const data = await callAPI('aliexpress.ds.text.search', {
    keyword, currency: 'USD', language: 'EN', local: 'en_US',
    countryCode: 'RO', page_no: String(page), page_size: '20',
  });
  const products = data.aliexpress_ds_text_search_response?.data?.products?.selection_search_product;
  return products || [];
}

// --- Product Detail ---
async function getDetail(productId) {
  const data = await callAPI('aliexpress.ds.product.get', {
    product_id: String(productId),
    target_currency: 'USD', target_language: 'EN',
    ship_to_country: 'RO', country: 'RO',
  });
  return data.aliexpress_ds_product_get_response?.result || null;
}

// --- Shipping ---
async function getShipping(productId, skuId) {
  const data = await callAPI('aliexpress.ds.freight.query', {
    queryDeliveryReq: JSON.stringify({
      productId: String(productId),
      selectedSkuId: String(skuId),
      country: 'RO', locale: 'en_US',
      quantity: 1, currency: 'USD', language: 'en',
    }),
  });
  const options = data.aliexpress_ds_freight_query_response?.result?.delivery_options?.delivery_option_d_t_o;
  if (!options?.length) return null;
  // Pick cheapest
  const cheapest = options.reduce((min, o) => {
    const cost = o.freight?.cent ? o.freight.cent / 100 : (o.free_shipping ? 0 : 999);
    return cost < (min.cost || 999) ? { ...o, cost } : min;
  }, { cost: 999 });
  return { 
    method: cheapest.company || cheapest.code,
    cost_usd: cheapest.cost || 0,
    free_shipping: cheapest.free_shipping || false,
    min_days: cheapest.min_delivery_days,
    max_days: cheapest.max_delivery_days,
    tracking: cheapest.tracking || false,
  };
}

// --- DB Schema ---
const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS aliexpress_products (
  id SERIAL PRIMARY KEY,
  
  -- Identificare
  ae_product_id BIGINT UNIQUE NOT NULL,
  ae_sku_id VARCHAR(30),
  
  -- Titlu & Descriere
  title TEXT NOT NULL,
  title_ro TEXT,
  description TEXT,
  
  -- Prețuri (USD)
  sale_price_usd DECIMAL(10,2) NOT NULL,
  original_price_usd DECIMAL(10,2),
  discount_percent VARCHAR(10),
  
  -- Preț calculat România (RON)
  price_ron INT,
  old_price_ron INT,
  
  -- Imagini & Media
  main_image TEXT,
  images TEXT,
  video_url TEXT,
  
  -- Categorie & Proprietăți
  category_id INT,
  category_name VARCHAR(200),
  brand VARCHAR(100),
  properties JSONB,
  
  -- Rating & Vânzări
  rating DECIMAL(3,1),
  rating_count INT,
  orders_count INT,
  
  -- Shipping la România
  ship_method VARCHAR(100),
  ship_cost_usd DECIMAL(10,2) DEFAULT 0,
  ship_free BOOLEAN DEFAULT false,
  ship_days_min INT,
  ship_days_max INT,
  ship_tracking BOOLEAN DEFAULT false,
  ship_from VARCHAR(10) DEFAULT 'CN',
  
  -- Magazin AliExpress
  store_id BIGINT,
  store_name VARCHAR(200),
  store_rating DECIMAL(3,1),
  
  -- Variante
  variants_count INT DEFAULT 1,
  variants_json JSONB,
  
  -- Status
  product_status VARCHAR(20) DEFAULT 'active',
  source_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ae_price ON aliexpress_products(sale_price_usd);
CREATE INDEX IF NOT EXISTS idx_ae_orders ON aliexpress_products(orders_count DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ae_rating ON aliexpress_products(rating DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ae_category ON aliexpress_products(category_id);
CREATE INDEX IF NOT EXISTS idx_ae_ship_free ON aliexpress_products(ship_free);
`;

// Price calculation (same as storefront)
function calculatePriceRON(costUsd, shipUsd) {
  const USD = 4.55, VAT = 0.19;
  const totalRon = (costUsd + shipUsd) * USD * (1 + VAT);
  const mk = costUsd < 3 ? 2.0 : (costUsd < 50 ? 1.5 : 1.3);
  const raw = totalRon * mk;
  const pts = [14,19,24,29,39,49,59,69,79,89,99,119,129,149,169,189,199,219,249,269,299,349,399,449,499];
  const price = pts.find(p => p >= raw) || Math.ceil(raw / 100) * 100 - 1;
  const oldPrice = pts.find(p => p >= raw * 1.5) || Math.ceil(raw * 1.5 / 100) * 100 - 1;
  return { price, oldPrice };
}

// --- SEARCH QUERIES ---
const QUERIES = [
  // Electronice
  'wireless earbuds', 'phone case', 'usb cable', 'led strip lights', 'bluetooth speaker',
  'screen protector', 'power bank', 'phone holder car', 'smart watch', 'earphone',
  'usb hub', 'mouse pad gaming', 'webcam', 'cable organizer', 'laptop stand',
  // Casă
  'kitchen gadget', 'storage box', 'led lamp', 'wall sticker decor', 'desk organizer',
  'bathroom accessories', 'shower curtain', 'candle holder', 'mug cup ceramic',
  'kitchen scale digital', 'bottle opener', 'spice jar', 'door mat',
  // Fashion
  'sunglasses', 'watch men', 'bracelet women', 'necklace pendant', 'scarf winter',
  'socks funny', 'belt leather', 'hat cap', 'ring jewelry', 'hair accessories',
  // Beauty
  'makeup brush set', 'nail art', 'face mask skincare', 'hair clip', 'beauty sponge',
  'eyelashes false', 'lip gloss', 'skincare tool',
  // Kids & Toys
  'fidget toy', 'puzzle 3d', 'building blocks', 'sticker pack', 'plush toy',
  'rc car', 'card game', 'slime kit',
  // Auto & Sport
  'car phone holder', 'yoga mat', 'resistance band', 'water bottle sport',
  'bike light', 'fishing lure', 'car sticker',
  // Pet
  'pet toy dog', 'cat toy', 'pet brush', 'dog collar',
  // Tools
  'screwdriver set', 'flashlight', 'multitool', 'tape measure',
];

async function main() {
  console.log('='.repeat(80));
  console.log('  🚀 ALIEXPRESS PIPELINE V2 — Tabel Nou + Import');
  console.log('='.repeat(80));

  const db = new Client({ connectionString: NEON_URL });
  await db.connect();
  console.log('  ✅ Connected to NeonDB');

  // Step 1: Drop old CJ data, create new table
  console.log('\n  🗑️  Șterg tabelul vechi "products" (CJ)...');
  await db.query('DROP TABLE IF EXISTS products CASCADE');
  await db.query('DROP TABLE IF EXISTS shipping_rates CASCADE');
  console.log('  ✅ Tabele vechi șterse');

  console.log('  📋 Creez tabelul nou "aliexpress_products"...');
  await db.query(CREATE_TABLE);
  console.log('  ✅ Tabel creat cu succes!\n');

  // Step 2: Import products
  let totalImported = 0;
  let totalSkipped = 0;
  const startTime = Date.now();

  for (let qi = 0; qi < QUERIES.length; qi++) {
    const query = QUERIES[qi];
    process.stdout.write(`  [${qi+1}/${QUERIES.length}] 🔍 "${query}" ... `);

    try {
      const products = await searchProducts(query);
      if (!products.length) { console.log('0 results'); await sleep(1500); continue; }

      let imported = 0;
      for (const p of products) {
        try {
          const costUsd = parseFloat(p.targetSalePrice || p.salePrice || '0');
          const origUsd = parseFloat(p.targetOriginalPrice || p.originalPrice || '0');
          const { price, oldPrice } = calculatePriceRON(costUsd, 0); // Free shipping assumed initially
          
          await db.query(`
            INSERT INTO aliexpress_products (
              ae_product_id, title, sale_price_usd, original_price_usd,
              discount_percent, price_ron, old_price_ron,
              main_image, rating, orders_count, source_url,
              category_name, product_status
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')
            ON CONFLICT (ae_product_id) DO NOTHING
          `, [
            p.itemId,
            p.title || '',
            costUsd, origUsd,
            p.discount || '0%',
            price, oldPrice,
            p.itemMainPic ? 'https:' + p.itemMainPic : '',
            parseFloat(p.score || '0'),
            parseInt(p.orders || '0'),
            p.itemUrl ? 'https:' + p.itemUrl : `https://www.aliexpress.com/item/${p.itemId}.html`,
            query, // Use search query as temp category
          ]);
          imported++;
        } catch (e) {
          if (!e.message.includes('duplicate')) totalSkipped++;
        }
      }

      totalImported += imported;
      console.log(`${products.length} found → ${imported} new | total: ${totalImported}`);

      // Rate limit: 1 req per 2 sec
      await sleep(2000);

    } catch (e) {
      console.log(`❌ ${e.message.slice(0, 60)}`);
      await sleep(3000);
    }
  }

  // Stats
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const { rows } = await db.query(`
    SELECT COUNT(*) as total,
      ROUND(AVG(sale_price_usd), 2) as avg_cost,
      ROUND(MIN(sale_price_usd), 2) as min_cost,
      ROUND(MAX(sale_price_usd), 2) as max_cost,
      ROUND(AVG(price_ron)) as avg_price_ron,
      ROUND(AVG(rating), 1) as avg_rating
    FROM aliexpress_products
  `);

  console.log('\n' + '='.repeat(80));
  console.log('  📊 REZULTATE IMPORT');
  console.log('='.repeat(80));
  console.log(`  ⏱️  Timp: ${elapsed}s`);
  console.log(`  📥 Importate: ${totalImported}`);
  console.log(`  ⏭️  Skipped: ${totalSkipped}`);
  console.log(`  📦 Total catalog: ${rows[0]?.total || 0}`);
  console.log(`  💰 Cost mediu: $${rows[0]?.avg_cost} (min $${rows[0]?.min_cost}, max $${rows[0]?.max_cost})`);
  console.log(`  🏷️  Preț RON mediu: ${rows[0]?.avg_price_ron} RON`);
  console.log(`  ⭐ Rating mediu: ${rows[0]?.avg_rating}`);
  console.log('='.repeat(80));

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
