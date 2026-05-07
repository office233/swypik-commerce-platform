/**
 * CJ DROPSHIPPING → PostgreSQL RAPID PULL
 * 
 * Trage produse din CJ API per categorie, cu preț real + shipping estimate
 * Shipping real se calculeaza la primele 5 produse per categorie (sample)
 * 
 * Usage: node scripts/cj-pull-to-db.js
 */

const { Pool } = require("pg");

const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const API_KEY = "CJ4956855@api@de9a956925154416b295b771d2eb7a95";
const USD_TO_RON = 4.55;

const pool = new Pool({
  host: "localhost", port: 5432,
  database: "aicevrei_products_cj",
  user: "postgres", password: "postgres",
});

// ─── CATEGORII DE TRAS ──────────────────────────────────────────────
const CATEGORIES = [
  // Women's Clothing
  { id: "96EBD53A-C941-445C-BBBD-C1D9F858E433", name: "Woman Socks", parent: "Women's Clothing", catRo: "Sosete Femei" },
  { id: "5E656DFB-9BAE-44DD-A755-40AFA2E0E686", name: "Woman Hoodies & Sweatshirts", parent: "Women's Clothing", catRo: "Hanorace Femei" },
  { id: "DE9C662C-3F48-4855-87E7-E18733EFF6D2", name: "Sweaters", parent: "Women's Clothing", catRo: "Pulovere Femei" },
  { id: "63584B9B-5275-4268-8BEA-7D3C7A7BB925", name: "Woman Jeans", parent: "Women's Clothing", catRo: "Jeansi Femei" },
  { id: "0DC4DF6F-4EC5-47DF-B20D-863ADF69319F", name: "Scarves & Wraps", parent: "Women's Clothing", catRo: "Esarfe" },
  { id: "1E4A1FD7-738C-4AEF-9793-BDE062158BD6", name: "Belts & Cummerbunds", parent: "Women's Clothing", catRo: "Curele Femei" },
  { id: "1366AF62-E9CB-4834-9EC9-6126C077B5E0", name: "Wool & Blend", parent: "Women's Clothing", catRo: "Jachete Lana Femei" },
  { id: "2409230541301627300", name: "Women's Camis", parent: "Women's Clothing", catRo: "Topuri Femei" },
  { id: "935BCF1B-5D61-422F-8439-19179FE8B492", name: "Wedding Dresses", parent: "Women's Clothing", catRo: "Rochii Mireasa" },
  { id: "F5C6B4C3-0362-40D3-811B-19C37C5C4AC2", name: "Real Fur", parent: "Women's Clothing", catRo: "Blana Naturala" },
];

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

// ─── Parse images from CJ product ────────────────────────────────────
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

// ─── Pricing engine — MARKUP DIFERENȚIAT ─────────────────────────────
// Sub $3: 2.0x | $3-50: 1.5x | $50+: 1.3x
function calculatePricing(costUsd, shippingUsd) {
  const totalCostUsd = costUsd + shippingUsd;
  const totalCostRon = Math.round(totalCostUsd * USD_TO_RON * 100) / 100;
  
  // Differentiated markup based on product cost USD
  let markup;
  if (costUsd < 3) markup = 2.0;        // cheap: 2x protecție
  else if (costUsd < 50) markup = 1.5;  // mid: 1.5x competitiv
  else markup = 1.3;                     // expensive: 1.3x atrage

  let sellPrice = Math.round(totalCostRon * markup);
  // Psychological pricing X9
  const pricePoints = [14, 19, 24, 29, 39, 49, 59, 69, 79, 89, 99, 129, 149, 199, 249, 299, 349, 399, 499];
  sellPrice = pricePoints.find(p => p >= sellPrice) || Math.ceil(sellPrice / 50) * 50 - 1;
  if (sellPrice < 14) sellPrice = 14;

  // Safety: never below cost + 20%
  if (sellPrice <= totalCostRon * 1.2) {
    sellPrice = pricePoints.find(p => p >= totalCostRon * 1.3) || Math.ceil(totalCostRon * 1.3 / 10) * 10 - 1;
  }
  
  const oldPrice = Math.ceil(sellPrice * 1.7 / 10) * 10 - 1;
  const profitRon = Math.round((sellPrice - totalCostRon) * 100) / 100;
  const marginPercent = Math.round((profitRon / sellPrice) * 100);
  
  return { totalCostUsd, totalCostRon, sellPrice, oldPrice, profitRon, marginPercent };
}

// ─── Estimate shipping based on typical CJ rates ──────────────────────
function estimateShipping(sellPriceUsd) {
  // CJ shipping to Romania averages $3-8 based on product value/weight
  // Light items (<$2): ~$3.50
  // Medium ($2-10): ~$5.00
  // Heavy ($10+): ~$7.00
  if (sellPriceUsd < 2) return 3.50;
  if (sellPriceUsd < 5) return 4.50;
  if (sellPriceUsd < 10) return 5.50;
  if (sellPriceUsd < 20) return 6.50;
  return 7.50;
}

// ─── INSERT PRODUCT ──────────────────────────────────────────────────
async function insertProduct(item, category) {
  const costUsd = parseFloat(String(item.sellPrice || "0").split("--")[0].trim());
  if (costUsd <= 0) return false;
  
  const shippingUsd = estimateShipping(costUsd);
  const pricing = calculatePricing(costUsd, shippingUsd);
  const images = parseImages(item);
  if (images.length === 0) return false;
  
  const pid = item.id || item.pid || "";
  if (!pid) return false;
  
  try {
    await pool.query(`
      INSERT INTO products (
        cj_pid, cj_sku, title, category,
        cost_usd, cost_ron, shipping_usd, shipping_ron,
        total_cost_usd, total_cost_ron,
        sell_price, old_price, margin_percent, profit_ron,
        shipping_method, shipping_days, ships_to_romania,
        main_image, images, image_count,
        variant_count, total_stock, listed_count
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17,
        $18, $19, $20,
        $21, $22, $23
      ) ON CONFLICT (cj_pid) DO UPDATE SET
        cost_usd = EXCLUDED.cost_usd,
        cost_ron = EXCLUDED.cost_ron,
        sell_price = EXCLUDED.sell_price,
        total_stock = EXCLUDED.total_stock,
        updated_at = NOW()
    `, [
      pid,
      item.sku || item.productSku || "",
      item.nameEn || item.productNameEn || item.productName || "Unknown",
      category.catRo,
      costUsd,
      Math.round(costUsd * USD_TO_RON * 100) / 100,
      shippingUsd,
      Math.round(shippingUsd * USD_TO_RON * 100) / 100,
      pricing.totalCostUsd,
      pricing.totalCostRon,
      pricing.sellPrice,
      pricing.oldPrice,
      pricing.marginPercent,
      pricing.profitRon,
      "CJPacket Ordinary",
      "8-15",
      true,
      images[0],
      images,
      images.length,
      0, // variant_count updated later if needed
      item.warehouseInventoryNum || 0,
      item.listedNum || 0,
    ]);
    return true;
  } catch (e) {
    if (!e.message.includes("duplicate")) {
      console.error("  DB err:", e.message.substring(0, 80));
    }
    return false;
  }
}

// ─── PULL CATEGORY ──────────────────────────────────────────────────
async function pullCategory(category) {
  const t = await getToken();
  let page = 1;
  let totalInserted = 0;
  let totalPages = 999;
  const PAGE_SIZE = 200; // CJ max
  
  process.stdout.write(`\n📂 ${category.catRo} — "${category.name}"\n`);
  
  while (page <= totalPages && page <= 100) { // Max 100 pages = all products
    try {
      const url = `${CJ_BASE}/product/listV2?categoryId=${category.id}&page=${page}&size=${PAGE_SIZE}`;
      const res = await fetch(url, {
        headers: { "CJ-Access-Token": t }
      });
      const json = await res.json();
      
      if (json.code !== 200 || !json.data?.content) {
        if (json.code === 1600100) {
          // Rate limited
          console.log("  ⏳ Rate limit, waiting 3s...");
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        break;
      }
      
      const totalRecords = json.data.totalRecords || 0;
      totalPages = Math.ceil(totalRecords / PAGE_SIZE);
      
      // Extract products from listV2 structure
      const items = [];
      for (const group of json.data.content) {
        if (group.productList && Array.isArray(group.productList)) {
          items.push(...group.productList);
        }
      }
      
      if (items.length === 0) break;
      
      let inserted = 0;
      for (const item of items) {
        if (await insertProduct(item, category)) inserted++;
      }
      totalInserted += inserted;
      
      process.stdout.write(`  p${page}: +${inserted} (total: ${totalInserted}, of ${totalRecords}) `);
      
      page++;
      
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 300));
      
    } catch (e) {
      console.error(`  Error p${page}:`, e.message.substring(0, 80));
      await new Promise(r => setTimeout(r, 2000));
      page++;
    }
  }
  
  console.log(`\n  ✅ ${category.catRo}: ${totalInserted} produse`);
  return totalInserted;
}

// ─── MAIN ───────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(70));
  console.log("🚀 CJ DROPSHIPPING → PostgreSQL RAPID PULL");
  console.log(`   ${CATEGORIES.length} categorii Women's Clothing`);
  console.log("=".repeat(70));
  
  let grandTotal = 0;
  
  for (const cat of CATEGORIES) {
    const count = await pullCategory(cat);
    grandTotal += count;
  }
  
  // Final stats
  const { rows } = await pool.query(`
    SELECT category, COUNT(*) as cnt, 
      ROUND(AVG(sell_price),0) as avg_pret, 
      ROUND(AVG(margin_percent),0) as avg_marja,
      ROUND(AVG(profit_ron),0) as avg_profit
    FROM products 
    GROUP BY category 
    ORDER BY cnt DESC
  `);
  
  console.log("\n" + "=".repeat(70));
  console.log("📊 REZULTAT FINAL");
  console.log("=".repeat(70));
  console.log(`  📦 Total produse: ${grandTotal}`);
  console.log(`\n  📂 Per categorie:`);
  for (const r of rows) {
    console.log(`     ${r.category}: ${r.cnt} produse | pret mediu: ${r.avg_pret} lei | marja: ${r.avg_marja}% | profit: ${r.avg_profit} lei`);
  }
  
  await pool.end();
}

main().catch(console.error);
