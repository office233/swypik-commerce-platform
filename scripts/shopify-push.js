/**
 * AIcevrei — Shopify BULK Product Push
 * Pushes products from PostgreSQL → Shopify with auto-collections
 * Usage: node scripts/shopify-push.js [--batch 100] [--category "Women's Clothing"]
 */
require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const fs = require("fs");

const pool = new Pool({ host:"localhost", port:5432, database:"aicevrei_products_cj", user:"postgres", password:"postgres" });
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

let shopifyToken = null;
let apiCalls = 0;

// ─── Parse args ───────────────────────────────────────────────────
const args = process.argv.slice(2);
const batchSize = parseInt(args.find((_, i) => args[i-1] === "--batch") || "50");
const catFilter = args.find((_, i) => args[i-1] === "--category") || null;

// ─── OAuth Token ──────────────────────────────────────────────────
async function getToken() {
  if (shopifyToken) return shopifyToken;
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error("OAuth failed: " + await res.text());
  shopifyToken = (await res.json()).access_token;
  return shopifyToken;
}

// ─── Shopify REST with rate limiting ──────────────────────────────
async function shopify(endpoint, method = "GET", body = null) {
  const token = await getToken();
  const opts = { method, headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token } };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2026-04/${endpoint}`, opts);
  apiCalls++;

  // Rate limit check
  const limit = res.headers.get("x-shopify-shop-api-call-limit");
  if (limit) {
    const [used, max] = limit.split("/").map(Number);
    if (used > max - 3) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (res.status === 429) {
    const retry = parseInt(res.headers.get("retry-after") || "4");
    console.log("  ⏳ Rate limited, waiting " + retry + "s...");
    await new Promise(r => setTimeout(r, retry * 1000));
    return shopify(endpoint, method, body); // retry
  }

  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.errors || json).substring(0, 200));
  return json;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Push single product ──────────────────────────────────────────
async function pushProduct(product, collectionMap) {
  const mainCat = (product.category || "").split(" > ")[0].trim();
  const subCat = (product.category || "").split(" > ")[1]?.trim() || "";
  const leafCat = (product.category || "").split(" > ")[2]?.trim() || "";

  // Build Shopify product
  const shopifyProduct = {
    product: {
      title: product.title,
      body_html: product.description || "",
      vendor: "AIcevrei",
      product_type: leafCat || subCat || mainCat,
      tags: [mainCat, subCat, leafCat, "cj-dropshipping"].filter(Boolean).join(", "),
      status: "active",
      images: [{ src: product.main_image, alt: product.title }],
      variants: [{
        price: String(product.retail_price_gbp || product.retail_price_usd || "9.99"),
        compare_at_price: String(((product.retail_price_gbp || product.retail_price_usd || 9.99) * 1.4).toFixed(2)),
        sku: product.cj_sku || product.cj_pid,
        inventory_management: "shopify",
        inventory_quantity: Math.min(product.total_stock || 999, 999),
        requires_shipping: true,
        weight: 0.2,
        weight_unit: "kg",
      }],
    }
  };

  // Create product
  const result = await shopify("products.json", "POST", shopifyProduct);
  if (!result.product) throw new Error("No product in response");

  const shopifyId = result.product.id;
  const variantId = result.product.variants?.[0]?.id;

  // Set COGS
  const invItemId = result.product.variants?.[0]?.inventory_item_id;
  if (invItemId) {
    try {
      await shopify(`inventory_items/${invItemId}.json`, "PUT", {
        inventory_item: { id: invItemId, cost: String(product.cost_usd) }
      });
    } catch(e) {}
  }

  // Add CJ metafields
  try {
    await shopify(`products/${shopifyId}/metafields.json`, "POST", {
      metafield: { namespace: "cj", key: "pid", value: product.cj_pid, type: "single_line_text_field" }
    });
  } catch(e) {}

  // Add to collections
  const collectionsToAdd = [mainCat, subCat].filter(Boolean);
  for (const colName of collectionsToAdd) {
    const colId = collectionMap[colName];
    if (colId) {
      try {
        await shopify("collects.json", "POST", {
          collect: { product_id: shopifyId, collection_id: colId }
        });
      } catch(e) {} // skip if already in collection
    }
  }

  // Update DB
  await pool.query(`
    UPDATE products SET pushed_to_shopify = true, shopify_id = $1, shopify_variant_id = $2, pushed_at = NOW(), push_error = NULL
    WHERE id = $3
  `, [shopifyId, variantId, product.id]);

  return shopifyId;
}

// ─── MAIN ──────────────────────────────────────────────────────────
async function main() {
  console.log("═".repeat(60));
  console.log("🚀 AIcevrei — Shopify BULK Product Push");
  console.log("═".repeat(60));
  console.log("  Batch size: " + batchSize);
  if (catFilter) console.log("  Category: " + catFilter);

  // Load collection map
  let collectionMap = {};
  try {
    collectionMap = JSON.parse(fs.readFileSync("scripts/collection-map.json", "utf8"));
    console.log("  Collections loaded: " + Object.keys(collectionMap).length);
  } catch(e) {
    console.log("  ⚠️ No collection map found, products won't be added to collections");
  }

  // Test OAuth
  await getToken();
  console.log("  ✅ Shopify connected\n");

  // Get products to push
  let query = `
    SELECT * FROM products
    WHERE (pushed_to_shopify = false OR pushed_to_shopify IS NULL)
      AND (is_filtered = false OR is_filtered IS NULL)
      AND retail_price_gbp > 0
      AND main_image IS NOT NULL
      AND cost_usd > 0
  `;
  if (catFilter) query += ` AND category LIKE '${catFilter}%'`;
  query += ` ORDER BY listed_count DESC, total_stock DESC LIMIT ${batchSize}`;

  const { rows: products } = await pool.query(query);
  console.log("📦 Products to push: " + products.length + "\n");

  if (products.length === 0) {
    console.log("✅ Nothing to push!");
    await pool.end();
    return;
  }

  let success = 0, failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const pct = Math.round((i / products.length) * 100);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = success > 0 ? (success / (elapsed / 60)).toFixed(1) : "0";

    process.stdout.write(`[${pct}%] ${i+1}/${products.length} | ${rate}/min | `);

    try {
      const sid = await pushProduct(p, collectionMap);
      success++;
      console.log(`✅ ${p.title.substring(0, 45)} → #${sid}`);
    } catch(e) {
      failed++;
      const errMsg = e.message.substring(0, 80);
      console.log(`❌ ${p.title.substring(0, 35)} — ${errMsg}`);
      // Save error to DB
      await pool.query("UPDATE products SET push_error = $1 WHERE id = $2", [errMsg, p.id]);
    }

    // Throttle: ~500ms between products (Shopify allows 2/sec but each product = ~4-5 calls)
    await sleep(600);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  // Final stats
  const { rows: stats } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM products WHERE pushed_to_shopify = true) as pushed,
      (SELECT COUNT(*) FROM products WHERE (pushed_to_shopify = false OR pushed_to_shopify IS NULL) AND (is_filtered = false OR is_filtered IS NULL) AND retail_price_gbp > 0) as remaining
  `);

  console.log("\n" + "═".repeat(60));
  console.log("📊 PUSH COMPLETE");
  console.log("═".repeat(60));
  console.log("  ✅ Success:    " + success);
  console.log("  ❌ Failed:     " + failed);
  console.log("  ⏱️  Time:       " + totalTime + " min");
  console.log("  📞 API calls:  " + apiCalls);
  console.log("  🛒 Total pushed (all time): " + stats[0].pushed);
  console.log("  📦 Remaining:  " + stats[0].remaining);
  console.log("\n  Run again to push next batch!");

  await pool.end();
}

main().catch(e => { console.error("❌ Fatal:", e.message); process.exit(1); });
