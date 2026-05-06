/**
 * CJ DROPSHIPPING → PostgreSQL v2.0
 * Pull COMPLET per categorie principală cu:
 * - Categorii 3 nivele
 * - Produse cu weight estimat
 * - Shipping rates reale per weight_band × country
 * 
 * Usage: node scripts/cj-pull-v2.js [category_index]
 * Example: node scripts/cj-pull-v2.js 0   (Women's Clothing)
 */

const { Pool } = require("pg");
const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const API_KEY = process.env.CJ_API_KEY || "CJ5392130@api@42db7d6aa10b4c7e913623f4c9b69017";

const pool = new Pool({
  host: "localhost", port: 5432,
  database: "aicevrei_products_cj",
  user: "postgres", password: "postgres",
});

let token = null;
async function getToken() {
  if (token) return token;
  const res = await fetch(CJ_BASE + "/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY }),
  });
  const json = await res.json();
  token = json.data?.accessToken || json.data;
  return token;
}

// ─── Weight estimation by category ──────────────────────────────────
const WEIGHT_MAP = {
  // Women's Clothing
  "socks": "0-50", "belts": "50-100", "scarves": "100-200", "gloves": "0-50",
  "hats": "50-100", "caps": "50-100", "masks": "0-50",
  "camis": "100-200", "short sleeve": "100-200", "shirts": "200-500",
  "blouses": "100-200", "hoodies": "200-500", "sweatshirts": "200-500",
  "jumpsuits": "200-500", "rompers": "200-500", "dresses": "200-500",
  "sweaters": "200-500", "suits": "500-1000", "sets": "500-1000",
  "leggings": "100-200", "skirts": "100-200", "jeans": "500-1000",
  "shorts": "100-200", "pants": "200-500", "wide leg": "200-500",
  "blazers": "200-500", "wool": "500-1000", "padded": "500-1000",
  "trench": "500-1000", "jacket": "200-500", "leather": "500-1000",
  "fur": "1000-2000", "cocktail": "200-500", "evening": "200-500",
  "wedding": "500-1000", "bridesmaid": "200-500", "prom": "200-500",
  // Pet
  "pet": "50-100", "collar": "50-100", "leash": "50-100", "toy": "50-100",
  // Home
  "bedding": "1000-2000", "curtain": "500-1000", "mat": "200-500",
  "kitchen": "100-200", "organizer": "100-200", "decor": "100-200",
  "painting": "100-200", "candle": "100-200", "cushion": "200-500",
  // Jewelry
  "ring": "0-50", "necklace": "0-50", "bracelet": "0-50", "earring": "0-50",
  "watch": "100-200", "brooch": "0-50", "pendant": "0-50",
  // Beauty
  "makeup": "50-100", "nail": "0-50", "hair": "50-100", "skincare": "100-200",
  "wig": "100-200", "brush": "50-100", "perfume": "100-200",
  // Men
  "t-shirt": "100-200", "polo": "100-200", "vest": "100-200",
  // Bags
  "wallet": "50-100", "backpack": "200-500", "handbag": "200-500",
  "crossbody": "100-200", "tote": "200-500", "clutch": "100-200",
  // Shoes
  "shoes": "500-1000", "boots": "500-1000", "sneakers": "500-1000",
  "slippers": "200-500", "sandals": "200-500", "heels": "200-500",
  // Electronics
  "cable": "0-50", "charger": "50-100", "earphone": "50-100",
  "headphone": "100-200", "speaker": "200-500", "camera": "200-500",
  "drone": "500-1000", "phone case": "0-50", "screen": "0-50",
  "power bank": "200-500", "smart": "100-200",
  // Auto
  "car": "100-200", "sticker": "0-50", "led": "50-100", "lamp": "100-200",
  // Sport
  "yoga": "200-500", "fitness": "200-500", "cycling": "100-200",
  "fishing": "200-500", "swimming": "100-200",
  // Default
  "default": "100-200"
};

function estimateWeightBand(categoryName, productName) {
  const combined = (categoryName + " " + productName).toLowerCase();
  for (const [key, band] of Object.entries(WEIGHT_MAP)) {
    if (key !== "default" && combined.includes(key)) return band;
  }
  return WEIGHT_MAP.default;
}

// ─── Parse images ──────────────────────────────────────────────────
function parseImages(item) {
  const images = [];
  if (item.bigImage) images.push(item.bigImage);
  if (item.productImageSet && Array.isArray(item.productImageSet)) {
    for (const url of item.productImageSet) {
      if (typeof url === "string" && url.startsWith("http") && !images.includes(url)) {
        images.push(url);
      }
    }
  }
  return images.slice(0, 10);
}

// ─── FASE 1: Pull categories ──────────────────────────────────────
async function pullCategories() {
  console.log("\n📂 FASE 1: Pulling CJ categories...");
  const t = await getToken();
  const res = await fetch(CJ_BASE + "/product/getCategory", {
    headers: { "CJ-Access-Token": t }
  });
  const json = await res.json();
  
  let count = 0;
  for (const main of (json.data || [])) {
    // Level 1
    await pool.query(`
      INSERT INTO categories (cj_category_id, name_en, parent_en, level)
      VALUES ($1, $2, NULL, 1)
      ON CONFLICT (cj_category_id) DO NOTHING
    `, [main.categoryFirstId, main.categoryFirstName]);
    
    for (const sub of (main.categoryFirstList || [])) {
      // Level 2
      await pool.query(`
        INSERT INTO categories (cj_category_id, name_en, parent_en, parent_category_id, level)
        VALUES ($1, $2, $3, $4, 2)
        ON CONFLICT (cj_category_id) DO NOTHING
      `, [sub.categorySecondId, sub.categorySecondName, main.categoryFirstName, main.categoryFirstId]);
      
      for (const leaf of (sub.categorySecondList || [])) {
        // Level 3
        await pool.query(`
          INSERT INTO categories (cj_category_id, name_en, parent_en, parent_category_id, level)
          VALUES ($1, $2, $3, $4, 3)
          ON CONFLICT (cj_category_id) DO NOTHING
        `, [leaf.categoryId, leaf.categoryName, sub.categorySecondName, sub.categorySecondId]);
        count++;
      }
    }
  }
  console.log("  ✅ " + count + " leaf categories inserted");
  return json.data || [];
}

// ─── FASE 2: Pull products for a main category ──────────────────
async function pullMainCategory(mainCat, allData) {
  const t = await getToken();
  const mainName = mainCat.categoryFirstName;
  let totalInserted = 0;
  
  console.log("\n🚀 FASE 2: Pulling products for: " + mainName);
  
  for (const sub of (mainCat.categoryFirstList || [])) {
    for (const leaf of (sub.categorySecondList || [])) {
      let page = 1;
      let catInserted = 0;
      let retries = 0;
      const MAX_RETRIES = 5;
      
      while (page <= 30) { // API max 3000 per category
        try {
          const url = `${CJ_BASE}/product/listV2?categoryId=${leaf.categoryId}&page=${page}&size=200`;
          const res = await fetch(url, { headers: { "CJ-Access-Token": t } });
          const text = await res.text();
          
          let json;
          try { json = JSON.parse(text); } catch (e) {
            console.log("  ⚠️ Bad JSON p" + page + ", retry...");
            retries++;
            if (retries >= MAX_RETRIES) { page++; retries = 0; }
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          
          if (json.code !== 200 || !json.data?.content) {
            const msg = json.message || "";
            if (msg.includes("Too Many") || json.code === 1600100) {
              retries++;
              if (retries >= MAX_RETRIES) {
                console.log("  ⏭️ Max retries p" + page + ", skipping...");
                page++; retries = 0;
              } else {
                await new Promise(r => setTimeout(r, 2000 + retries * 1000));
              }
              continue;
            }
            break; // No more data
          }
          
          retries = 0; // Reset on success
          const items = [];
          for (const group of json.data.content) {
            if (group.productList) items.push(...group.productList);
          }
          if (items.length === 0) break;
          
          for (const item of items) {
            const costUsd = parseFloat(String(item.sellPrice || "0").split("--")[0].trim());
            if (costUsd <= 0) continue;
            
            const images = parseImages(item);
            if (images.length === 0) continue;
            
            const pid = item.id || "";
            if (!pid) continue;
            
            const catPath = mainName + " > " + sub.categorySecondName + " > " + leaf.categoryName;
            const weightBand = estimateWeightBand(leaf.categoryName, item.nameEn || "");
            
            try {
              await pool.query(`
                INSERT INTO products (
                  cj_pid, cj_sku, title, category, category_id,
                  cost_usd, weight_band,
                  main_image, images, image_count,
                  total_stock, listed_count
                ) VALUES (
                  $1, $2, $3, $4,
                  (SELECT id FROM categories WHERE cj_category_id = $5 LIMIT 1),
                  $6, $7,
                  $8, $9, $10,
                  $11, $12
                ) ON CONFLICT (cj_pid) DO UPDATE SET
                  cost_usd = EXCLUDED.cost_usd,
                  total_stock = EXCLUDED.total_stock,
                  updated_at = NOW()
              `, [
                pid,
                item.sku || item.productSku || "",
                item.nameEn || item.productNameEn || "Unknown",
                catPath,
                leaf.categoryId,
                costUsd,
                weightBand,
                images[0],
                images,
                images.length,
                item.warehouseInventoryNum || 0,
                item.listedNum || 0,
              ]);
              catInserted++;
            } catch (e) {
              // skip duplicates silently
            }
          }
          
          process.stdout.write("  p" + page + ":+" + items.length + " ");
          page++;
          await new Promise(r => setTimeout(r, 300));
          
        } catch (e) {
          console.log("  ❌ Fetch error p" + page + ": " + e.message.substring(0, 60));
          await new Promise(r => setTimeout(r, 3000));
          retries++;
          if (retries >= MAX_RETRIES) { page++; retries = 0; }
        }
      }
      
      if (catInserted > 0) {
        totalInserted += catInserted;
        console.log("\n  ✅ " + leaf.categoryName + ": +" + catInserted + " (total: " + totalInserted + ")");
        
        // Update category product count
        await pool.query(`
          UPDATE categories SET product_count = $1 WHERE cj_category_id = $2
        `, [catInserted, leaf.categoryId]);
      }
    }
  }
  
  console.log("\n  ✅ " + mainName + ": " + totalInserted + " produse total");
  return totalInserted;
}

// ─── FASE 3: Shipping rates ─────────────────────────────────────
async function pullShippingRates() {
  console.log("\n🚚 FASE 3: Pulling REAL shipping rates...");
  const t = await getToken();
  
  const WEIGHT_BANDS = ["0-50", "50-100", "100-200", "200-500", "500-1000", "1000-2000", "2000-5000", "5000+"];
  
  // Get a sample VID for each weight band from existing products
  const sampleVids = {};
  for (const band of WEIGHT_BANDS) {
    const { rows } = await pool.query(
      "SELECT cj_pid FROM products WHERE weight_band = $1 LIMIT 1", [band]
    );
    if (rows[0]) {
      // Get VID from product query
      await new Promise(r => setTimeout(r, 1100));
      try {
        const res = await fetch(CJ_BASE + "/product/query?pid=" + rows[0].cj_pid, {
          headers: { "CJ-Access-Token": t }
        });
        const json = await res.json();
        const vid = json.data?.variants?.[0]?.vid;
        if (vid) sampleVids[band] = vid;
      } catch (e) {}
    }
  }
  
  console.log("  Sample VIDs found for " + Object.keys(sampleVids).length + " weight bands");
  
  // Get all country codes
  const { rows: countries } = await pool.query("SELECT code FROM countries WHERE active = true");
  
  let ratesInserted = 0;
  for (const [band, vid] of Object.entries(sampleVids)) {
    for (const country of countries) {
      await new Promise(r => setTimeout(r, 1100));
      try {
        const res = await fetch(CJ_BASE + "/logistic/freightCalculate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "CJ-Access-Token": t },
          body: JSON.stringify({
            startCountryCode: "CN",
            endCountryCode: country.code === "UK" ? "GB" : country.code,
            products: [{ quantity: 1, vid: vid }]
          })
        });
        const json = await res.json();
        
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          // Find cheapest
          const cheapest = json.data.reduce((min, s) =>
            (s.logisticPrice || 999) < (min.logisticPrice || 999) ? s : min
          , json.data[0]);
          
          // Find fastest (lowest first number in aging)
          const fastest = json.data.reduce((fast, s) => {
            const days = parseInt(String(s.logisticAging || "999").split("-")[0]);
            const fastDays = parseInt(String(fast.logisticAging || "999").split("-")[0]);
            return days < fastDays ? s : fast;
          }, json.data[0]);
          
          await pool.query(`
            INSERT INTO shipping_rates (
              country_code, weight_band,
              cheapest_method, cheapest_shipping_usd, cheapest_total_usd, cheapest_days,
              fastest_method, fastest_shipping_usd, fastest_total_usd, fastest_days,
              all_methods, methods_count, sample_vid
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT (country_code, weight_band) DO UPDATE SET
              cheapest_shipping_usd = EXCLUDED.cheapest_shipping_usd,
              cheapest_total_usd = EXCLUDED.cheapest_total_usd,
              all_methods = EXCLUDED.all_methods,
              fetched_at = NOW()
          `, [
            country.code, band,
            cheapest.logisticName, cheapest.logisticPrice, cheapest.totalPostageFee || cheapest.logisticPrice, cheapest.logisticAging,
            fastest.logisticName, fastest.logisticPrice, fastest.totalPostageFee || fastest.logisticPrice, fastest.logisticAging,
            JSON.stringify(json.data.map(s => ({
              name: s.logisticName, price: s.logisticPrice, total: s.totalPostageFee, days: s.logisticAging
            }))),
            json.data.length,
            vid
          ]);
          ratesInserted++;
        }
      } catch (e) {
        // skip
      }
    }
    console.log("  Band " + band + ": " + countries.length + " countries done");
  }
  console.log("  ✅ " + ratesInserted + " shipping rates inserted");
}

// ─── MAIN ───────────────────────────────────────────────────────
async function main() {
  const catIndex = parseInt(process.argv[2] || "0");
  
  console.log("=".repeat(70));
  console.log("🚀 CJ DROPSHIPPING v2.0 → PostgreSQL");
  console.log("=".repeat(70));
  
  // Phase 1: Categories
  const allData = await pullCategories();
  
  // Phase 2: Products for selected main category
  if (allData[catIndex]) {
    const total = await pullMainCategory(allData[catIndex], allData);
    
    // Phase 3: Shipping (only after first category)
    const { rows: existingRates } = await pool.query("SELECT COUNT(*) as cnt FROM shipping_rates");
    if (parseInt(existingRates[0].cnt) < 100) {
      await pullShippingRates();
    } else {
      console.log("\n🚚 Shipping rates already populated (" + existingRates[0].cnt + " rows)");
    }
    
    // Final stats
    const { rows: stats } = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM categories) as cats,
        (SELECT COUNT(*) FROM products) as prods,
        (SELECT COUNT(*) FROM shipping_rates) as rates,
        (SELECT COUNT(DISTINCT category) FROM products) as used_cats
    `);
    
    console.log("\n" + "=".repeat(70));
    console.log("📊 DATABASE STATUS");
    console.log("=".repeat(70));
    console.log("  Categories: " + stats[0].cats);
    console.log("  Products:   " + stats[0].prods);
    console.log("  Used cats:  " + stats[0].used_cats);
    console.log("  Ship rates: " + stats[0].rates);
  }
  
  await pool.end();
}

main().catch(console.error);
