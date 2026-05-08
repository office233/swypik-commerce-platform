/**
 * OTAPI MASS INGESTION — Target: 500K+ products
 * 
 * Pulls ALL AliExpress categories via OTAPI and ingests into PostgreSQL
 * 
 * Usage: node scripts/otapi-mass-ingest.js
 * 
 * Flow:
 * 1. Get ALL categories from OTAPI
 * 2. For each category, paginate through ALL products
 * 3. Insert into PostgreSQL (aicevrei_products_dser)
 * 4. Resume support (skips already-processed categories)
 */

require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

const OTAPI_KEY = process.env.OTAPI_KEY || "9decf2ab-160c-4c0e-bd68-27e5aaed12a1";
const OTAPI_BASE = "https://otapi.net/service-json";
const ITEMS_PER_PAGE = 50;
const MAX_PAGES_PER_CAT = 200;  // 200 pages x 50 = 10,000 per category
const DELAY_MS = 300;  // 300ms between API calls (safe rate)

const pool = new Pool({
  host: "localhost", port: 5432,
  database: "aicevrei_products_dser",
  user: "postgres", password: "postgres",
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── OTAPI API ──────────────────────────────────────────────────
async function otapi(method, params = {}) {
  const url = new URL(`${OTAPI_BASE}/${method}`);
  url.searchParams.set("instanceKey", OTAPI_KEY);
  url.searchParams.set("language", "en");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`OTAPI ${r.status}: ${await r.text()}`);
  const data = await r.json();
  
  if (data.ErrorCode && data.ErrorCode !== "Ok") {
    throw new Error(`OTAPI Error: ${data.ErrorCode} — ${data.ErrorMessage || ""}`);
  }
  return data;
}

// ─── Get ALL categories ─────────────────────────────────────────
async function getAllCategories() {
  console.log("📂 Fetching ALL AliExpress categories...");
  const data = await otapi("GetRootCategoryInfoList");
  
  const categories = [];
  
  function extractCats(items, parentName = "") {
    if (!items) return;
    const list = Array.isArray(items) ? items : (items.Content || []);
    for (const item of list) {
      const name = parentName
        ? `${parentName} > ${item.Name?.Value || item.Id}`
        : (item.Name?.Value || item.Id);
      
      categories.push({
        id: item.Id,
        name: name,
        hasChildren: item.HasSubCategories || false,
      });
      
      if (item.SubCategories) {
        extractCats(item.SubCategories, name);
      }
    }
  }
  
  extractCats(data.Result || data);
  console.log(`   Found ${categories.length} root categories`);
  
  // Get subcategories for each root
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    if (cat.hasChildren) {
      try {
        await sleep(DELAY_MS);
        const sub = await otapi("GetCategorySubcategoryInfoList", { parentCategoryId: cat.id });
        const subList = sub.Result?.Content || sub.Result || [];
        if (Array.isArray(subList)) {
          for (const s of subList) {
            categories.push({
              id: s.Id,
              name: `${cat.name} > ${s.Name?.Value || s.Id}`,
              hasChildren: s.HasSubCategories || false,
            });
          }
        }
      } catch (e) {
        // Skip failed subcategory fetch
      }
    }
  }
  
  console.log(`   Total categories (with subs): ${categories.length}`);
  return categories;
}

// ─── Parse single product ───────────────────────────────────────
function parseProduct(item, categoryName) {
  if (!item) return null;
  
  const id = item.ExternalItemId || item.Id;
  if (!id) return null;
  
  const title = item.Title?.Value || item.Subject || "";
  if (!title || title.length < 3) return null;
  
  // Price
  let costUsd = 0;
  if (item.Price?.ConvertedPriceList?.Internal?.Price) {
    costUsd = parseFloat(item.Price.ConvertedPriceList.Internal.Price) || 0;
  } else if (item.Price?.OriginalPrice) {
    costUsd = parseFloat(item.Price.OriginalPrice) || 0;
  } else if (item.Price?.MarginPrice) {
    costUsd = parseFloat(item.Price.MarginPrice) || 0;
  }
  
  // Promo price
  let promoPrice = null;
  if (item.Price?.ConvertedPriceList?.Internal?.PriceWithoutSign) {
    promoPrice = parseFloat(item.Price.ConvertedPriceList.Internal.PriceWithoutSign) || null;
  }
  
  // Images
  const mainImage = item.MainPictureUrl || item.Pictures?.ItemPicture?.[0]?.Url || null;
  const images = [];
  if (item.Pictures?.ItemPicture) {
    for (const pic of item.Pictures.ItemPicture) {
      if (pic.Url) images.push(pic.Url);
    }
  }
  
  // Rating & sales
  const rating = parseFloat(item.FeaturedValues?.find(f => 
    f.Name === "rating" || f.Name === "sellerRating"
  )?.Value) || null;
  
  const totalSales = parseInt(item.FeaturedValues?.find(f =>
    f.Name === "volume" || f.Name === "orders"
  )?.Value) || 0;
  
  const reviewsCount = parseInt(item.FeaturedValues?.find(f =>
    f.Name === "reviews" || f.Name === "feedback"
  )?.Value) || 0;
  
  // Vendor
  const vendor = item.VendorName || item.ProviderType || null;
  
  // Quality score
  let score = 30; // base
  if (rating >= 4.5) score += 30;
  else if (rating >= 4.0) score += 20;
  else if (rating >= 3.5) score += 10;
  if (totalSales >= 1000) score += 20;
  else if (totalSales >= 100) score += 10;
  if (images.length >= 3) score += 10;
  else if (images.length >= 1) score += 5;
  if (costUsd > 0 && costUsd < 200) score += 10;
  
  return {
    aliexpress_id: String(id),
    aliexpress_url: `https://www.aliexpress.com/item/${id}.html`,
    title: title.substring(0, 500),
    category_name: categoryName,
    cost_usd: costUsd || 0.01,
    price_usd: costUsd || 0.01,
    promotion_price_usd: promoPrice,
    main_image: mainImage,
    images: images.length > 0 ? JSON.stringify(images) : null,
    image_count: images.length || (mainImage ? 1 : 0),
    rating: rating,
    total_sales: totalSales,
    reviews_count: reviewsCount,
    vendor_name: vendor,
    quality_score: score,
  };
}

// ─── Insert batch into DB ───────────────────────────────────────
async function insertBatch(products) {
  if (products.length === 0) return { ins: 0, upd: 0 };
  
  const client = await pool.connect();
  let ins = 0, upd = 0;
  
  try {
    for (const p of products) {
      try {
        const existing = await client.query(
          "SELECT id FROM products WHERE aliexpress_id = $1", [p.aliexpress_id]
        );
        
        if (existing.rows.length > 0) {
          await client.query(`
            UPDATE products SET
              price_usd = COALESCE($1, price_usd),
              promotion_price_usd = COALESCE($2, promotion_price_usd),
              main_image = COALESCE($3, main_image),
              images = COALESCE($4, images),
              image_count = GREATEST($5, image_count),
              rating = COALESCE($6, rating),
              total_sales = GREATEST($7, total_sales),
              reviews_count = GREATEST($8, reviews_count),
              quality_score = GREATEST($9, quality_score),
              vendor_name = COALESCE($10, vendor_name),
              updated_at = NOW()
            WHERE aliexpress_id = $11
          `, [p.cost_usd, p.promotion_price_usd, p.main_image, p.images,
              p.image_count, p.rating, p.total_sales, p.reviews_count,
              p.quality_score, p.vendor_name, p.aliexpress_id]);
          upd++;
        } else {
          await client.query(`
            INSERT INTO products (
              aliexpress_id, aliexpress_url, title, category_name,
              cost_usd, price_usd, promotion_price_usd,
              main_image, images, image_count,
              rating, total_sales, reviews_count,
              vendor_name, quality_score,
              detail_fetched, variants_fetched, pushed_to_shopify,
              is_expired, is_fake_quantity, is_incomplete,
              created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                      false,false,false,false,false,false,NOW(),NOW())
          `, [p.aliexpress_id, p.aliexpress_url, p.title, p.category_name,
              p.cost_usd, p.price_usd, p.promotion_price_usd,
              p.main_image, p.images, p.image_count,
              p.rating, p.total_sales, p.reviews_count,
              p.vendor_name, p.quality_score]);
          ins++;
        }
      } catch (e) {
        // Skip individual product errors
      }
    }
  } finally {
    client.release();
  }
  
  return { ins, upd };
}

// ─── Scrape one category ────────────────────────────────────────
async function scrapeCategory(catId, catName) {
  let totalIns = 0, totalUpd = 0;
  
  for (let page = 0; page < MAX_PAGES_PER_CAT; page++) {
    try {
      await sleep(DELAY_MS);
      
      const data = await otapi("BatchSearchItemsFrame", {
        categoryId: catId,
        framePosition: page * ITEMS_PER_PAGE,
        frameSize: ITEMS_PER_PAGE,
      });
      
      const items = data.Result?.Items?.Content || 
                    data.Result?.Items || 
                    data.Result?.Content || [];
      
      if (!Array.isArray(items) || items.length === 0) {
        break; // No more products
      }
      
      const products = items
        .map(item => parseProduct(item, catName))
        .filter(Boolean);
      
      if (products.length === 0) break;
      
      const { ins, upd } = await insertBatch(products);
      totalIns += ins;
      totalUpd += upd;
      
      if (page % 10 === 0 || items.length < ITEMS_PER_PAGE) {
        process.stdout.write(`    p${page}: +${ins}/~${upd} (${items.length} items) `);
      }
      
      if (items.length < ITEMS_PER_PAGE) break; // Last page
      
    } catch (e) {
      if (e.message.includes("Limit") || e.message.includes("quota")) {
        console.log(`\n    ⚠️ API limit hit — pausing 60s...`);
        await sleep(60000);
        page--; // Retry
      } else {
        console.log(`\n    ❌ Error p${page}: ${e.message.slice(0, 80)}`);
        break;
      }
    }
  }
  
  return { ins: totalIns, upd: totalUpd };
}

// ─── Get already-processed categories ───────────────────────────
async function getProcessedCategories() {
  const { rows } = await pool.query(`
    SELECT DISTINCT category_name, COUNT(*) as cnt 
    FROM products GROUP BY category_name
  `);
  return new Map(rows.map(r => [r.category_name, parseInt(r.cnt)]));
}

// ─── MAIN ───────────────────────────────────────────────────────
async function main() {
  console.log("═".repeat(70));
  console.log("🚀 OTAPI MASS INGESTION — Target: 500K+ products");
  console.log("═".repeat(70));
  
  const { rows: [{ count: initialCount }] } = await pool.query("SELECT COUNT(*) FROM products");
  console.log(`\n📦 Current products in DB: ${parseInt(initialCount).toLocaleString()}`);
  console.log(`🔑 OTAPI Key: ${OTAPI_KEY.slice(0, 12)}...`);
  console.log(`⚡ Rate: ${Math.round(1000/DELAY_MS)} calls/sec`);
  console.log(`📄 Max per category: ${MAX_PAGES_PER_CAT * ITEMS_PER_PAGE}`);
  
  // Get categories
  const categories = await getAllCategories();
  const processed = await getProcessedCategories();
  
  let totalIns = 0, totalUpd = 0;
  let catsDone = 0;
  
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const existing = processed.get(cat.name) || 0;
    
    // Skip categories with 5000+ products already (fully scraped)
    if (existing >= 5000) {
      continue;
    }
    
    catsDone++;
    console.log(`\n${"─".repeat(70)}`);
    console.log(`  [${catsDone}] ${cat.name} (ID: ${cat.id}) — existing: ${existing}`);
    
    try {
      const { ins, upd } = await scrapeCategory(cat.id, cat.name);
      totalIns += ins;
      totalUpd += upd;
      console.log(`\n  ✅ +${ins} new, ~${upd} updated`);
    } catch (e) {
      console.log(`  ❌ ${e.message.slice(0, 100)}`);
      
      if (e.message.includes("Limit") || e.message.includes("quota") || e.message.includes("expired")) {
        console.log("\n  ⚠️  API KEY EXHAUSTED — salvam progresul");
        break;
      }
    }
    
    // Progress report every 10 categories
    if (catsDone % 10 === 0) {
      const { rows: [{ count }] } = await pool.query("SELECT COUNT(*) FROM products");
      console.log(`\n  📊 Progress: ${parseInt(count).toLocaleString()} total (+${totalIns} new)`);
    }
  }
  
  // Final report
  const { rows: [{ count: finalCount }] } = await pool.query("SELECT COUNT(*) FROM products");
  
  console.log(`\n${"═".repeat(70)}`);
  console.log("📊 RAPORT FINAL");
  console.log("═".repeat(70));
  console.log(`  Produse noi:     +${totalIns.toLocaleString()}`);
  console.log(`  Actualizate:     ~${totalUpd.toLocaleString()}`);
  console.log(`  Categorii:       ${catsDone}`);
  console.log(`  DB Total:        ${parseInt(initialCount).toLocaleString()} → ${parseInt(finalCount).toLocaleString()}`);
  console.log(`  Target 500K:     ${((parseInt(finalCount)/500000)*100).toFixed(1)}%`);
  console.log("═".repeat(70));
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
