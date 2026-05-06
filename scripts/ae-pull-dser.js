/**
 * AliExpress → PostgreSQL (aicevrei_products_dser)
 * Pull COMPLET per categorie cu subcategorii corecte
 * 
 * Faza 1: Categorii (arbore complet)
 * Faza 2: Produse per subcategorie (200/call, max pagini)
 * 
 * Usage: node scripts/ae-pull-dser.js [root_category_id]
 * Example: node scripts/ae-pull-dser.js ae-200000345   (Women's clothing)
 */

const { Pool } = require("pg");

const OTAPI_KEY = "b784185b-edeb-41e3-bb3d-11a2af9753a0";
const OTAPI_JSON = "https://otapi.net/service-json";
const FRAME_SIZE = 200; // max per call
const MAX_PAGES = 25;   // 25 × 200 = 5000 max per subcategory

const pool = new Pool({
  host: "localhost", port: 5432,
  database: "aicevrei_products_dser",
  user: "postgres", password: "postgres",
});

let callsUsed = 0;
let callsRemaining = 185; // 300 total - 115 used for categories

// ─── Weight estimation by category name ──────────────────────────
const WEIGHT_MAP = {
  "socks": "0-50", "belt": "50-100", "scarf": "50-100", "gloves": "0-50",
  "hat": "50-100", "cap": "50-100", "mask": "0-50", "hijab": "0-50",
  "t-shirt": "100-200", "top": "100-200", "bodysuit": "100-200",
  "shirt": "100-200", "blouse": "100-200", "polo": "100-200",
  "shorts": "100-200", "skirt": "100-200", "legging": "100-200",
  "dress": "200-500", "hoodi": "200-500", "sweatshirt": "200-500",
  "sweater": "200-500", "cardigan": "200-500", "pullover": "200-500",
  "pants": "200-500", "jean": "500-1000", "trouser": "200-500",
  "jacket": "200-500", "blazer": "200-500", "coat": "500-1000",
  "parka": "500-1000", "down jacket": "500-1000", "fur": "1000-2000",
  "overall": "200-500", "jumpsuit": "200-500", "romper": "200-500",
  "bikini": "100-200", "swimsuit": "100-200", "swimwear": "100-200",
  "evening": "200-500", "wedding": "500-1000", "costume": "200-500",
  "vest": "100-200", "cape": "200-500", "poncho": "200-500",
  "leather": "500-1000", "denim": "500-1000",
  "ring": "0-50", "necklace": "0-50", "bracelet": "0-50", "earring": "0-50",
  "watch": "100-200", "bag": "200-500", "backpack": "200-500",
  "wallet": "50-100", "shoe": "500-1000", "boot": "500-1000",
  "sneaker": "500-1000", "sandal": "200-500", "slipper": "200-500",
  "phone case": "0-50", "cable": "0-50", "charger": "50-100",
  "earphone": "50-100", "headphone": "100-200", "speaker": "200-500",
  "drone": "500-1000", "lamp": "100-200", "led": "50-100",
  "pillow": "200-500", "curtain": "500-1000", "rug": "500-1000",
  "toy": "100-200", "pet": "50-100", "baby": "100-200",
};

function estimateWeightBand(categoryName, title) {
  const combined = (categoryName + " " + title).toLowerCase();
  for (const [key, band] of Object.entries(WEIGHT_MAP)) {
    if (combined.includes(key)) return band;
  }
  return "100-200"; // default
}

// ─── Quality Score ──────────────────────────────────────────────
function calcQuality(item) {
  let score = 50;
  const sales = parseInt(getFeat(item, "TotalSales") || "0");
  if (sales > 5000) score += 30;
  else if (sales > 1000) score += 25;
  else if (sales > 300) score += 20;
  else if (sales > 100) score += 15;
  else if (sales > 30) score += 10;
  else if (sales > 5) score += 5;
  else score -= 10;

  const rating = parseFloat(getFeat(item, "rating") || "0");
  if (rating >= 4.8) score += 15;
  else if (rating >= 4.5) score += 10;
  else if (rating >= 4.0) score += 5;
  else if (rating > 0 && rating < 3.5) score -= 15;

  const pics = (item.Pictures || []).length;
  if (pics >= 5) score += 10;
  else if (pics >= 3) score += 5;
  else if (pics < 2) score -= 15;

  const price = item.Price?.OriginalPrice || 0;
  if (price < 0.3) score -= 20;
  if (price > 300) score -= 5;

  const features = item.Features || [];
  if (features.includes("Expired")) score -= 25;
  if (features.includes("Incomplete")) score -= 15;
  if (features.includes("FakeQuantity")) score -= 5;

  return Math.max(0, Math.min(100, score));
}

function getFeat(item, name) {
  return (item.FeaturedValues || []).find(f => f.Name === name)?.Value;
}

// ─── FAZA 1: Pull categories tree ───────────────────────────────
async function pullCategoryTree(parentId, parentName, level) {
  try {
    const url = `${OTAPI_JSON}/GetCategorySubcategoryInfoList?instanceKey=${OTAPI_KEY}&language=en&signature=&timestamp=&parentCategoryId=${parentId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const json = await res.json();
    callsUsed++;

    const cats = json.CategoryInfoList?.Content || [];
    if (cats.length === 0) return [];

    const result = [];
    for (const c of cats) {
      await pool.query(`
        INSERT INTO categories (ae_category_id, name_en, parent_en, parent_category_id, level)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (ae_category_id) DO UPDATE SET name_en = EXCLUDED.name_en
      `, [c.Id, c.Name, parentName, parentId, level]);

      result.push({ id: c.Id, name: c.Name, parentName, level });

      // Recurse for subcategories (max 3 levels)
      if (level < 3) {
        const subs = await pullCategoryTree(c.Id, c.Name, level + 1);
        result.push(...subs);
        await new Promise(r => setTimeout(r, 200));
      }
    }
    return result;
  } catch (e) {
    console.error(`  ⚠️ Category error: ${e.message}`);
    return [];
  }
}

// ─── FAZA 2: Pull products for a category ───────────────────────
async function pullProducts(categoryId, categoryName, parentName) {
  let page = 0;
  let totalInserted = 0;
  const fullCatPath = parentName ? `${parentName} > ${categoryName}` : categoryName;

  while (page < MAX_PAGES) {
    if (callsUsed >= callsRemaining) {
      console.log("  ⛔ API call limit reached!");
      return totalInserted;
    }

    try {
      const xmlParams = `<SearchItemsParameters><Provider>Aliexpress</Provider><CategoryId>${categoryId}</CategoryId></SearchItemsParameters>`;
      const params = new URLSearchParams({
        instanceKey: OTAPI_KEY, language: "en",
        signature: "", timestamp: "", sessionId: "", blockList: "",
        framePosition: String(page * FRAME_SIZE),
        frameSize: String(FRAME_SIZE),
      });
      const url = `${OTAPI_JSON}/BatchSearchItemsFrame?${params}&xmlParameters=${encodeURIComponent(xmlParams)}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      const json = await res.json();
      callsUsed++;

      if (json.ErrorCode !== "Ok") {
        if (json.ErrorCode === "Busy") {
          console.log("  ⏳ API busy, waiting 5s...");
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        break;
      }

      const items = json.Result?.Items?.Items?.Content || [];
      const totalCount = json.Result?.Items?.Items?.TotalCount || 0;

      if (items.length === 0) break;

      let inserted = 0;
      for (const item of items) {
        const priceUsd = item.Price?.OriginalPrice || 0;
        if (priceUsd <= 0.1) continue;

        const id = item.Id || "";
        if (!id) continue;
        const numericId = id.replace("ae-", "");

        // Images
        const images = (item.Pictures || [])
          .map(p => p.Large?.Url || p.Medium?.Url || p.Url || "")
          .filter(u => u.length > 10 && u.startsWith("http"))
          .slice(0, 6);
        if (images.length === 0) continue;

        const mainImage = item.MainPictureUrl || images[0];
        const features = item.Features || [];
        const quality = calcQuality(item);
        const promoPrice = item.PromotionPrice?.OriginalPrice || null;
        const deliveryPrice = item.Price?.DeliveryPrice?.OriginalPrice || 0;
        const effectivePrice = promoPrice && promoPrice > 0 ? Math.min(priceUsd, promoPrice) : priceUsd;
        const costUsd = Math.round((effectivePrice + deliveryPrice) * 100) / 100;
        const weightBand = estimateWeightBand(categoryName, item.Title || "");

        try {
          await pool.query(`
            INSERT INTO products (
              aliexpress_id, aliexpress_url, title,
              category_id, category_name,
              price_usd, promotion_price_usd, delivery_price_usd, cost_usd,
              weight_band,
              main_image, images, image_count,
              total_sales, rating, reviews_count, favorites_count,
              master_quantity,
              vendor_id, vendor_name, vendor_score,
              is_expired, is_fake_quantity, is_incomplete,
              quality_score, ae_updated_at
            ) VALUES (
              $1, $2, $3,
              (SELECT id FROM categories WHERE ae_category_id = $4 LIMIT 1), $5,
              $6, $7, $8, $9,
              $10,
              $11, $12, $13,
              $14, $15, $16, $17,
              $18,
              $19, $20, $21,
              $22, $23, $24,
              $25, $26
            ) ON CONFLICT (aliexpress_id) DO UPDATE SET
              price_usd = EXCLUDED.price_usd,
              promotion_price_usd = EXCLUDED.promotion_price_usd,
              cost_usd = EXCLUDED.cost_usd,
              total_sales = EXCLUDED.total_sales,
              rating = EXCLUDED.rating,
              master_quantity = EXCLUDED.master_quantity,
              quality_score = EXCLUDED.quality_score,
              updated_at = NOW()
          `, [
            numericId,
            item.ExternalItemUrl || item.TaobaoItemUrl || `https://www.aliexpress.us/item/${numericId}.html`,
            (item.Title || "Unknown").slice(0, 500),
            categoryId, fullCatPath,
            priceUsd,
            promoPrice > 0 ? promoPrice : null,
            deliveryPrice,
            costUsd,
            weightBand,
            mainImage,
            images,
            images.length,
            parseInt(getFeat(item, "TotalSales") || "0"),
            Math.min(5, parseFloat(getFeat(item, "rating") || "0")),
            parseInt(getFeat(item, "reviews") || "0"),
            parseInt(getFeat(item, "favCount") || "0"),
            item.MasterQuantity || 0,
            item.VendorId || null,
            item.VendorName || null,
            item.VendorScore || 0,
            features.includes("Expired"),
            features.includes("FakeQuantity"),
            features.includes("Incomplete"),
            quality,
            item.LastUpdatedTime || null,
          ]);
          inserted++;
        } catch (e) {
          if (!e.message.includes("duplicate")) {
            // skip silently
          }
        }
      }

      totalInserted += inserted;
      process.stdout.write(`  p${page + 1}: +${inserted} (sub: ${totalInserted}, of ${totalCount}) [calls: ${callsUsed}]\n`);

      // If we got fewer items than requested, we're at the end
      if (items.length < FRAME_SIZE) break;

      page++;
      await new Promise(r => setTimeout(r, 300));

    } catch (e) {
      console.error(`  ⚠️ Error page ${page}: ${e.message.slice(0, 80)}`);
      await new Promise(r => setTimeout(r, 2000));
      page++;
    }
  }

  return totalInserted;
}

// ─── MAIN ───────────────────────────────────────────────────────
async function main() {
  const rootCatId = process.argv[2] || "ae-200000345"; // Default: Women's clothing

  console.log("═".repeat(70));
  console.log("🚀 AliExpress (OTAPI) → PostgreSQL DSER");
  console.log(`   Root category: ${rootCatId}`);
  console.log(`   Frame size: ${FRAME_SIZE} | Max pages: ${MAX_PAGES}`);
  console.log("═".repeat(70));

  // ── FAZA 1: Categorii ──
  console.log("\n📂 FAZA 1: Checking categories...");

  // Check if categories already exist
  const { rows: existingCats } = await pool.query("SELECT COUNT(*) as cnt FROM categories");
  let rootName = "Women's clothing";

  if (parseInt(existingCats[0].cnt) > 10) {
    console.log(`  ✅ Categories already populated (${existingCats[0].cnt} rows), skipping to save calls`);
    // Get root name from DB
    const { rows: rootRow } = await pool.query("SELECT name_en FROM categories WHERE ae_category_id = $1", [rootCatId]);
    if (rootRow[0]) rootName = rootRow[0].name_en;
  } else {
    // Insert root first
    const rootRes = await fetch(`${OTAPI_JSON}/GetCategorySubcategoryInfoList?instanceKey=${OTAPI_KEY}&language=en&signature=&timestamp=&parentCategoryId=ae-0`, { signal: AbortSignal.timeout(30000) });
    const rootJson = await rootRes.json();
    callsUsed++;
    const rootCats = rootJson.CategoryInfoList?.Content || [];
    for (const c of rootCats) {
      await pool.query(`
        INSERT INTO categories (ae_category_id, name_en, parent_category_id, level)
        VALUES ($1, $2, 'ae-0', 1)
        ON CONFLICT (ae_category_id) DO UPDATE SET name_en = EXCLUDED.name_en
      `, [c.Id, c.Name]);
    }
    console.log(`  ✅ ${rootCats.length} root categories inserted`);

    const rootCat = rootCats.find(c => c.Id === rootCatId);
    rootName = rootCat?.Name || "Unknown";

    const allCats = await pullCategoryTree(rootCatId, rootName, 2);
    console.log(`  ✅ ${allCats.length} subcategories inserted`);
  }

  console.log(`  🎯 Target: ${rootName} (${rootCatId})`);

  // ── FAZA 2: Produse per subcategorie ──
  console.log("\n🛍️  FAZA 2: Pulling products...");

  // Get leaf categories directly from DB

  // But wait - some level 2 cats may have no children AND have products (like "Shorts", "Dresses", etc.)
  // Let's just get all categories that don't have children
  const { rows: allDbCats } = await pool.query(`
    SELECT c.ae_category_id, c.name_en, c.parent_en, c.level
    FROM categories c
    WHERE (c.parent_category_id = $1
       OR c.parent_category_id IN (SELECT ae_category_id FROM categories WHERE parent_category_id = $1))
    AND NOT EXISTS (
      SELECT 1 FROM categories child WHERE child.parent_category_id = c.ae_category_id
    )
    ORDER BY c.level, c.name_en
  `, [rootCatId]);

  console.log(`  📋 ${allDbCats.length} leaf categories to pull from\n`);

  let grandTotal = 0;
  for (let i = 0; i < allDbCats.length; i++) {
    const cat = allDbCats[i];
    if (callsUsed >= callsRemaining) {
      console.log("\n  ⛔ API call limit reached! Stopping.");
      break;
    }

    console.log(`\n📂 [${i + 1}/${allDbCats.length}] ${cat.parent_en || rootName} > ${cat.name_en}`);
    const count = await pullProducts(cat.ae_category_id, cat.name_en, cat.parent_en || rootName);
    grandTotal += count;

    // Update category product count
    await pool.query(`UPDATE categories SET product_count = $1 WHERE ae_category_id = $2`, [count, cat.ae_category_id]);
  }

  // ── FINAL STATS ──
  const { rows: stats } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM categories) as cats,
      (SELECT COUNT(*) FROM products) as prods,
      (SELECT COUNT(*) FROM products WHERE NOT is_expired AND quality_score >= 40) as quality_prods,
      (SELECT COUNT(DISTINCT category_name) FROM products) as used_cats,
      (SELECT ROUND(AVG(rating), 2) FROM products WHERE rating > 0) as avg_rating,
      (SELECT ROUND(AVG(cost_usd), 2) FROM products) as avg_cost,
      (SELECT ROUND(AVG(total_sales), 0) FROM products WHERE total_sales > 0) as avg_sales
  `);

  const { rows: topCats } = await pool.query(`
    SELECT category_name, COUNT(*) as cnt,
      ROUND(AVG(cost_usd), 2) as avg_cost,
      ROUND(AVG(rating), 2) as avg_rating
    FROM products
    GROUP BY category_name
    ORDER BY cnt DESC
    LIMIT 20
  `);

  console.log("\n" + "═".repeat(70));
  console.log("📊 PULL COMPLETE");
  console.log("═".repeat(70));
  console.log(`  📂 Categories:       ${stats[0].cats}`);
  console.log(`  📦 Total products:   ${stats[0].prods}`);
  console.log(`  ✅ Quality products:  ${stats[0].quality_prods} (score ≥ 40, not expired)`);
  console.log(`  🏷️  Used categories:  ${stats[0].used_cats}`);
  console.log(`  ⭐ Avg rating:       ${stats[0].avg_rating}`);
  console.log(`  💰 Avg cost (USD):   $${stats[0].avg_cost}`);
  console.log(`  📈 Avg sales:        ${stats[0].avg_sales}`);
  console.log(`  📞 API calls used:   ${callsUsed}`);

  console.log("\n  📂 Top categories:");
  for (const c of topCats) {
    console.log(`     ${c.category_name}: ${c.cnt} produse | cost: $${c.avg_cost} | rating: ${c.avg_rating}`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
