/**
 * Pull REMAINING CJ categories + products
 * Skips categories already pulled, continues where left off
 * Respects 1000 calls/day limit
 */
const { Pool } = require("pg");
const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const API_KEY = "CJ4956855@api@de9a956925154416b295b771d2eb7a95";

const pool = new Pool({ host:"localhost", port:5432, database:"aicevrei_products_cj", user:"postgres", password:"postgres" });

let token = null;
let callsUsed = 0;
const MAX_CALLS = 950; // Leave 50 buffer

async function getToken() {
  if (token) return token;
  const res = await fetch(CJ_BASE + "/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY }),
  });
  const json = await res.json();
  token = json.data?.accessToken || json.data;
  callsUsed++;
  return token;
}

function parseImages(item) {
  const images = [];
  if (item.bigImage) images.push(item.bigImage);
  if (item.productImageSet && Array.isArray(item.productImageSet)) {
    for (const url of item.productImageSet) {
      if (typeof url === "string" && url.startsWith("http") && !images.includes(url)) images.push(url);
    }
  }
  return images.slice(0, 10);
}

const WEIGHT_MAP = {
  "socks":"0-50","belt":"50-100","scarf":"100-200","gloves":"0-50","hat":"50-100",
  "t-shirt":"100-200","shirt":"100-200","blouse":"100-200","dress":"200-500",
  "hoodi":"200-500","sweater":"200-500","pants":"200-500","jean":"500-1000",
  "jacket":"200-500","coat":"500-1000","shoe":"500-1000","boot":"500-1000",
  "sneaker":"500-1000","sandal":"200-500","ring":"0-50","necklace":"0-50",
  "bracelet":"0-50","earring":"0-50","watch":"100-200","bag":"200-500",
  "backpack":"200-500","wallet":"50-100","phone case":"0-50","cable":"0-50",
  "charger":"50-100","earphone":"50-100","headphone":"100-200","speaker":"200-500",
  "drone":"500-1000","lamp":"100-200","led":"50-100","pillow":"200-500",
  "curtain":"500-1000","toy":"100-200","pet":"50-100","baby":"100-200",
  "makeup":"50-100","nail":"0-50","brush":"50-100","skincare":"100-200",
  "yoga":"200-500","fitness":"200-500","fishing":"200-500","car":"100-200",
  "kitchen":"100-200","bedding":"1000-2000","rug":"500-1000",
};

function estimateWeight(catName, prodName) {
  const combined = (catName + " " + prodName).toLowerCase();
  for (const [key, band] of Object.entries(WEIGHT_MAP)) {
    if (combined.includes(key)) return band;
  }
  return "100-200";
}

async function pullProducts(leaf, mainName, subName) {
  const t = await getToken();
  let page = 1, inserted = 0, retries = 0;
  const catPath = mainName + " > " + subName + " > " + leaf.categoryName;

  while (page <= 30 && callsUsed < MAX_CALLS) {
    try {
      const res = await fetch(`${CJ_BASE}/product/listV2?categoryId=${leaf.categoryId}&page=${page}&size=200`, {
        headers: { "CJ-Access-Token": t }
      });
      callsUsed++;
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch(e) {
        retries++;
        if (retries >= 3) { page++; retries = 0; }
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (json.code !== 200 || !json.data?.content) {
        if (json.message?.includes("Too Many") || json.code === 1600100) {
          retries++;
          if (retries >= 3) { page++; retries = 0; }
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        break;
      }
      retries = 0;

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

        try {
          await pool.query(`
            INSERT INTO products (cj_pid, cj_sku, title, category, category_id, cost_usd, weight_band, main_image, images, image_count, total_stock, listed_count)
            VALUES ($1,$2,$3,$4,(SELECT id FROM categories WHERE cj_category_id=$5 LIMIT 1),$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (cj_pid) DO UPDATE SET cost_usd=EXCLUDED.cost_usd, total_stock=EXCLUDED.total_stock, updated_at=NOW()
          `, [pid, item.sku||item.productSku||"", item.nameEn||item.productNameEn||"Unknown", catPath, leaf.categoryId, costUsd, estimateWeight(leaf.categoryName, item.nameEn||""), images[0], images, images.length, item.warehouseInventoryNum||0, item.listedNum||0]);
          inserted++;
        } catch(e) {}
      }

      process.stdout.write(`p${page}:+${items.length} `);
      if (items.length < 200) break;
      page++;
      await new Promise(r => setTimeout(r, 350));
    } catch(e) {
      retries++;
      if (retries >= 3) { page++; retries = 0; }
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return inserted;
}

async function main() {
  console.log("═".repeat(60));
  console.log("🚀 Pull REMAINING CJ categories + products");
  console.log("═".repeat(60));

  const t = await getToken();

  // Get all CJ categories
  const res = await fetch(CJ_BASE + "/product/getCategory", { headers: { "CJ-Access-Token": t } });
  const json = await res.json();
  callsUsed++;
  const allMainCats = json.data || [];
  console.log("\n📂 CJ has " + allMainCats.length + " main categories:");
  allMainCats.forEach(c => console.log("  - " + c.categoryFirstName));

  // Check which categories already have products
  const { rows: existingCats } = await pool.query("SELECT DISTINCT split_part(category, ' > ', 1) as main FROM products");
  const pulledMains = existingCats.map(r => r.main);
  console.log("\n✅ Already pulled: " + pulledMains.join(", "));

  // Insert new categories
  for (const main of allMainCats) {
    await pool.query(`INSERT INTO categories (cj_category_id, name_en, level) VALUES ($1,$2,1) ON CONFLICT (cj_category_id) DO NOTHING`, [main.categoryFirstId, main.categoryFirstName]);
    for (const sub of (main.categoryFirstList || [])) {
      await pool.query(`INSERT INTO categories (cj_category_id, name_en, parent_en, parent_category_id, level) VALUES ($1,$2,$3,$4,2) ON CONFLICT (cj_category_id) DO NOTHING`, [sub.categorySecondId, sub.categorySecondName, main.categoryFirstName, main.categoryFirstId]);
      for (const leaf of (sub.categorySecondList || [])) {
        await pool.query(`INSERT INTO categories (cj_category_id, name_en, parent_en, parent_category_id, level) VALUES ($1,$2,$3,$4,3) ON CONFLICT (cj_category_id) DO NOTHING`, [leaf.categoryId, leaf.categoryName, sub.categorySecondName, sub.categorySecondId]);
      }
    }
  }

  // Pull products for unpulled categories
  let grandTotal = 0;
  for (const main of allMainCats) {
    if (pulledMains.includes(main.categoryFirstName)) {
      console.log("\n⏭️  SKIP: " + main.categoryFirstName + " (already pulled)");
      continue;
    }
    if (callsUsed >= MAX_CALLS) {
      console.log("\n⛔ Daily call limit reached (" + callsUsed + "/" + MAX_CALLS + "). Resume tomorrow!");
      break;
    }

    console.log("\n\n🚀 PULLING: " + main.categoryFirstName);
    let catTotal = 0;
    for (const sub of (main.categoryFirstList || [])) {
      for (const leaf of (sub.categorySecondList || [])) {
        if (callsUsed >= MAX_CALLS) break;
        process.stdout.write(`  ${leaf.categoryName}: `);
        const cnt = await pullProducts(leaf, main.categoryFirstName, sub.categorySecondName);
        if (cnt > 0) {
          catTotal += cnt;
          console.log(` → ${cnt} products`);
          await pool.query("UPDATE categories SET product_count=$1 WHERE cj_category_id=$2", [cnt, leaf.categoryId]);
        } else {
          console.log(" → 0");
        }
      }
    }
    grandTotal += catTotal;
    console.log("  ✅ " + main.categoryFirstName + ": " + catTotal + " total");
  }

  // Apply fixes to new products (descriptions + prices)
  console.log("\n\n📝 Applying descriptions + prices to new products...");
  await pool.query(`
    UPDATE products SET
      retail_price_usd = CASE WHEN cost_usd<2 THEN ROUND(cost_usd*4.5,2) WHEN cost_usd<5 THEN ROUND(cost_usd*3.5,2) WHEN cost_usd<15 THEN ROUND(cost_usd*3.0,2) WHEN cost_usd<50 THEN ROUND(cost_usd*2.5,2) ELSE ROUND(cost_usd*2.0,2) END,
      retail_price_gbp = CASE WHEN cost_usd<2 THEN ROUND(cost_usd*4.5*0.79,2) WHEN cost_usd<5 THEN ROUND(cost_usd*3.5*0.79,2) WHEN cost_usd<15 THEN ROUND(cost_usd*3.0*0.79,2) WHEN cost_usd<50 THEN ROUND(cost_usd*2.5*0.79,2) ELSE ROUND(cost_usd*2.0*0.79,2) END,
      profit_margin_pct = CASE WHEN cost_usd<2 THEN 78 WHEN cost_usd<5 THEN 71 WHEN cost_usd<15 THEN 67 WHEN cost_usd<50 THEN 60 ELSE 50 END
    WHERE retail_price_gbp IS NULL AND (is_filtered IS NULL OR is_filtered = false)
  `);

  // Final stats
  const { rows: stats } = await pool.query(`
    SELECT (SELECT COUNT(*) FROM products) as total, (SELECT COUNT(*) FROM categories) as cats,
    (SELECT COUNT(DISTINCT split_part(category, ' > ', 1)) FROM products) as main_cats
  `);
  console.log("\n" + "═".repeat(60));
  console.log("📊 FINAL: " + stats[0].total + " products | " + stats[0].cats + " categories | " + stats[0].main_cats + " main cats");
  console.log("   API calls used: " + callsUsed + "/" + MAX_CALLS);
  console.log("═".repeat(60));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
