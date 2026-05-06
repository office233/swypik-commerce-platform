/**
 * Push TOP products from PostgreSQL → Shopify
 * Reads from aicevrei_products_dser, pushes best quality products
 * 
 * Usage: node scripts/ae-push-shopify.js [limit] [min_score]
 * Example: node scripts/ae-push-shopify.js 500 60
 */

require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

const SHOPIFY_STORE = process.env.SHOPIFY_STORE || "uns3hp-cc.myshopify.com";
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const API_VERSION = "2026-04";
const EUR_TO_RON = 4.97;
const USD_TO_RON = 4.56;

const pool = new Pool({
  host: "localhost", port: 5432,
  database: "aicevrei_products_dser",
  user: "postgres", password: "postgres",
});

let shopifyToken = "";
let pushed = 0, failed = 0, skipped = 0;

// ─── Shopify OAuth ──────────────────────────────────────────────────
async function getToken() {
  if (shopifyToken) return shopifyToken;
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Shopify OAuth failed: ${res.status} — ${await res.text()}`);
  const data = await res.json();
  shopifyToken = data.access_token;
  console.log("🔑 Shopify token obtained");
  return shopifyToken;
}

// ─── Shopify REST ───────────────────────────────────────────────────
async function shopifyREST(endpoint, method = "GET", body) {
  const token = await getToken();
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429) {
    console.log("  ⏳ Rate limited, waiting 2s...");
    await new Promise(r => setTimeout(r, 2000));
    return shopifyREST(endpoint, method, body);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Competitive pricing (USD → RON cu markup) ─────────────────────
function calculatePricing(costUsd) {
  const costRON = costUsd * USD_TO_RON;
  
  let markup;
  if (costRON < 15) markup = 1.35;
  else if (costRON < 30) markup = 1.30;
  else if (costRON < 60) markup = 1.28;
  else if (costRON < 120) markup = 1.25;
  else markup = 1.22;

  const rawPrice = costRON * markup;

  // Psychological pricing: X9
  let sellPrice;
  if (rawPrice < 22) sellPrice = 19;
  else if (rawPrice < 32) sellPrice = 29;
  else if (rawPrice < 42) sellPrice = 39;
  else if (rawPrice < 55) sellPrice = 49;
  else if (rawPrice < 70) sellPrice = 59;
  else if (rawPrice < 85) sellPrice = 79;
  else if (rawPrice < 110) sellPrice = 99;
  else if (rawPrice < 140) sellPrice = 129;
  else if (rawPrice < 170) sellPrice = 149;
  else if (rawPrice < 220) sellPrice = 199;
  else if (rawPrice < 280) sellPrice = 249;
  else if (rawPrice < 350) sellPrice = 299;
  else sellPrice = Math.ceil(rawPrice / 50) * 50 - 1;

  if (sellPrice <= costRON) {
    sellPrice = Math.ceil(costRON * 1.25 / 10) * 10 - 1;
  }

  const retailMultiplier = 1.6 + Math.random() * 0.4;
  const oldPrice = Math.ceil(sellPrice * retailMultiplier / 10) * 10 - 1;

  return { sellPrice, oldPrice, costRON: Math.round(costRON * 100) / 100 };
}

// ─── Push single product ────────────────────────────────────────────
async function pushProduct(product) {
  const pricing = calculatePricing(product.cost_usd);

  const imageObjects = (product.images || [])
    .filter(url => url && url.startsWith("http"))
    .slice(0, 5)
    .map(src => ({ src }));

  if (imageObjects.length === 0) return null;

  const catParts = (product.category_name || "").split(" > ");
  const subCategory = catParts[catParts.length - 1] || "General";

  const bodyHtml = `
    <div class="product-description">
      <h3>${product.title}</h3>
      <ul>
        <li>✅ Transport GRATUIT inclus în preț</li>
        <li>📦 Livrare în 15-25 zile lucrătoare</li>
        <li>🔄 Garanție 30 zile retur gratuit</li>
        ${product.rating > 0 ? `<li>⭐ Rating: ${product.rating}/5</li>` : ""}
        ${product.total_sales > 0 ? `<li>🔥 ${product.total_sales}+ vândute</li>` : ""}
      </ul>
      <p><small>Produs importat din colecția internațională AICeVrei.ro</small></p>
    </div>
  `.trim();

  const payload = {
    product: {
      title: product.title,
      body_html: bodyHtml,
      product_type: subCategory,
      vendor: "AICeVrei",
      tags: [
        "aliexpress",
        subCategory.toLowerCase(),
        "transport-gratuit",
        "ai-curated",
        product.quality_score >= 70 ? "top-seller" : "",
        product.rating >= 4.5 ? "best-rated" : "",
      ].filter(Boolean).join(", "),
      status: "active",
      variants: [{
        price: pricing.sellPrice.toFixed(2),
        compare_at_price: pricing.oldPrice > pricing.sellPrice ? pricing.oldPrice.toFixed(2) : null,
        sku: `AE-${product.aliexpress_id}`,
        requires_shipping: true,
        inventory_management: null, // No stock tracking = dropshipping
        cost: pricing.costRON.toFixed(2),
        weight: 0.3,
        weight_unit: "kg",
      }],
      images: imageObjects,
      metafields: [
        {
          namespace: "aliexpress",
          key: "source_id",
          value: product.aliexpress_id,
          type: "single_line_text_field",
        },
        {
          namespace: "aliexpress",
          key: "source_url",
          value: product.aliexpress_url || "",
          type: "single_line_text_field",
        },
        {
          namespace: "aliexpress",
          key: "cost_usd",
          value: String(product.cost_usd),
          type: "number_decimal",
        },
      ],
    },
  };

  try {
    const json = await shopifyREST("products.json", "POST", payload);
    return json.product?.id ? String(json.product.id) : null;
  } catch (err) {
    if (err.message.includes("422")) {
      // Duplicate or validation error
      return "skip";
    }
    throw err;
  }
}

// ─── MAIN ───────────────────────────────────────────────────────────
async function main() {
  const LIMIT = parseInt(process.argv[2] || "100");
  const MIN_SCORE = parseInt(process.argv[3] || "60");

  console.log("═".repeat(70));
  console.log("🚀 PostgreSQL → Shopify Push (AICeVrei)");
  console.log(`   Store: ${SHOPIFY_STORE}`);
  console.log(`   Limit: ${LIMIT} produse`);
  console.log(`   Min score: ${MIN_SCORE}`);
  console.log(`   Currency: RON (markup inclus)`);
  console.log("═".repeat(70));

  // Get top products not yet pushed (NOTE: is_expired ignored — OTAPI marks 99% expired but they're active on AliExpress)
  const { rows: products } = await pool.query(`
    SELECT 
      aliexpress_id, aliexpress_url, title, category_name,
      cost_usd, rating, total_sales, reviews_count,
      main_image, images, image_count, quality_score,
      vendor_name
    FROM products
    WHERE pushed_to_shopify = FALSE
      AND quality_score >= $1
      AND image_count >= 1
      AND cost_usd > 0.5
      AND cost_usd < 200
    ORDER BY quality_score DESC, total_sales DESC
    LIMIT $2
  `, [MIN_SCORE, LIMIT]);

  console.log(`\n📦 Found ${products.length} products to push\n`);

  if (products.length === 0) {
    // Try with relaxed criteria (include expired)
    const { rows: relaxed } = await pool.query(`
      SELECT COUNT(*) as cnt FROM products
      WHERE pushed_to_shopify = FALSE
        AND quality_score >= $1
        AND image_count >= 1
        AND cost_usd > 0.5
    `, [MIN_SCORE]);
    console.log(`   (${relaxed[0].cnt} available if we include expired products)`);
    
    if (parseInt(relaxed[0].cnt) > 0) {
      console.log("   Re-running with expired products included...\n");
      const { rows: prods2 } = await pool.query(`
        SELECT 
          aliexpress_id, aliexpress_url, title, category_name,
          cost_usd, rating, total_sales, reviews_count,
          main_image, images, image_count, quality_score,
          vendor_name
        FROM products
        WHERE pushed_to_shopify = FALSE
          AND quality_score >= $1
          AND image_count >= 1
          AND cost_usd > 0.5
          AND cost_usd < 200
        ORDER BY quality_score DESC, total_sales DESC
        LIMIT $2
      `, [MIN_SCORE, LIMIT]);
      products.length = 0;
      products.push(...prods2);
      console.log(`📦 Found ${products.length} products (with expired)\n`);
    }
  }

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const pricing = calculatePricing(p.cost_usd);

    process.stdout.write(`[${i + 1}/${products.length}] ${p.title.slice(0, 50)}... `);
    process.stdout.write(`$${p.cost_usd} → ${pricing.sellPrice} RON `);

    try {
      const shopifyId = await pushProduct(p);

      if (shopifyId === "skip") {
        skipped++;
        console.log("⏭️ skip");
      } else if (shopifyId) {
        pushed++;
        await pool.query(
          "UPDATE products SET pushed_to_shopify = TRUE, shopify_id = $1, updated_at = NOW() WHERE aliexpress_id = $2",
          [shopifyId, p.aliexpress_id]
        );
        console.log(`✅ #${shopifyId}`);
      } else {
        failed++;
        console.log("❌ no ID returned");
      }

      // Shopify rate limit: ~2 req/sec
      await new Promise(r => setTimeout(r, 600));

    } catch (err) {
      failed++;
      console.log(`❌ ${err.message.slice(0, 60)}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log("\n" + "═".repeat(70));
  console.log("📊 PUSH COMPLETE");
  console.log("═".repeat(70));
  console.log(`  ✅ Pushed:  ${pushed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  📦 Total:   ${products.length}`);

  const { rows: stats } = await pool.query(
    "SELECT COUNT(*) as cnt FROM products WHERE pushed_to_shopify = TRUE"
  );
  console.log(`  🛍️  Total on Shopify: ${stats[0].cnt}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
