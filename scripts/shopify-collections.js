/**
 * AIcevrei — Create Shopify Collections from CJ Categories
 * Uses OAuth Client Credentials (auto-token)
 * Then pushes products in batches
 */
require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

const pool = new Pool({ host:"localhost", port:5432, database:"aicevrei_products_cj", user:"postgres", password:"postgres" });

const SHOPIFY_STORE = process.env.SHOPIFY_STORE || "uns3hp-cc.myshopify.com";
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

let shopifyToken = null;

// ─── Get OAuth Token ──────────────────────────────────────────────
async function getToken() {
  if (shopifyToken) return shopifyToken;
  console.log("🔑 Getting Shopify OAuth token...");
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("OAuth failed: " + res.status + " — " + err);
  }
  const data = await res.json();
  shopifyToken = data.access_token;
  console.log("  ✅ Token obtained");
  return shopifyToken;
}

// ─── Shopify REST API helper ──────────────────────────────────────
async function shopifyREST(endpoint, method = "GET", body = null) {
  const token = await getToken();
  const opts = {
    method,
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2026-04/${endpoint}`, opts);
  
  // Rate limit handling
  const remaining = res.headers.get("x-shopify-shop-api-call-limit");
  if (remaining) {
    const [used, max] = remaining.split("/").map(Number);
    if (used > max - 5) {
      console.log("  ⏳ Rate limit close, waiting 2s...");
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  const json = await res.json();
  if (!res.ok) {
    throw new Error("Shopify " + res.status + ": " + JSON.stringify(json.errors || json));
  }
  return json;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── STEP 1: Create Collections ───────────────────────────────────
async function createCollections() {
  console.log("\n📂 STEP 1: Creating Shopify Collections...\n");

  // Get existing collections
  const existing = await shopifyREST("custom_collections.json?limit=250");
  const existingTitles = (existing.custom_collections || []).map(c => c.title);
  console.log("  Existing collections: " + existingTitles.length);
  if (existingTitles.length > 0) {
    existingTitles.forEach(t => console.log("    - " + t));
  }

  // Get main categories from DB
  const { rows: mainCats } = await pool.query(`
    SELECT split_part(category, ' > ', 1) as main_cat, COUNT(*) as cnt
    FROM products
    WHERE (is_filtered = false OR is_filtered IS NULL) AND retail_price_gbp > 0
    GROUP BY 1 ORDER BY cnt DESC
  `);

  // Get subcategories too
  const { rows: subCats } = await pool.query(`
    SELECT 
      split_part(category, ' > ', 1) as main_cat,
      split_part(category, ' > ', 2) as sub_cat,
      COUNT(*) as cnt
    FROM products
    WHERE (is_filtered = false OR is_filtered IS NULL) AND retail_price_gbp > 0
    GROUP BY 1, 2 ORDER BY cnt DESC
  `);

  const collectionMap = {}; // title -> shopify_id

  // Create main category collections
  for (const cat of mainCats) {
    const title = cat.main_cat.trim();
    if (existingTitles.includes(title)) {
      const ec = existing.custom_collections.find(c => c.title === title);
      if (ec) collectionMap[title] = ec.id;
      console.log("  ⏭️  SKIP: " + title + " (exists)");
      continue;
    }

    try {
      const result = await shopifyREST("custom_collections.json", "POST", {
        custom_collection: {
          title: title,
          body_html: `<p>Browse our complete ${title} collection. Carefully curated products at the best prices with worldwide shipping.</p>`,
          published: true,
          sort_order: "best-selling",
        }
      });
      collectionMap[title] = result.custom_collection.id;
      console.log("  ✅ Created: " + title + " (ID: " + result.custom_collection.id + ")");
      await sleep(500);
    } catch(e) {
      console.log("  ❌ " + title + ": " + e.message.substring(0, 80));
    }
  }

  // Create subcategory collections
  const uniqueSubs = new Map();
  for (const sc of subCats) {
    const title = sc.sub_cat.trim();
    if (!title || title === sc.main_cat.trim()) continue;
    if (!uniqueSubs.has(title)) uniqueSubs.set(title, sc.cnt);
  }

  for (const [title, cnt] of uniqueSubs) {
    if (cnt < 10) continue; // Skip tiny subcategories
    if (existingTitles.includes(title)) {
      const ec = existing.custom_collections.find(c => c.title === title);
      if (ec) collectionMap[title] = ec.id;
      continue;
    }

    try {
      const result = await shopifyREST("custom_collections.json", "POST", {
        custom_collection: {
          title: title,
          published: true,
          sort_order: "best-selling",
        }
      });
      collectionMap[title] = result.custom_collection.id;
      console.log("  ✅ Sub: " + title + " (" + cnt + " products)");
      await sleep(500);
    } catch(e) {
      console.log("  ❌ " + title + ": " + e.message.substring(0, 60));
    }
  }

  console.log("\n  📊 Total collections: " + Object.keys(collectionMap).length);
  return collectionMap;
}

// ─── MAIN ──────────────────────────────────────────────────────────
async function main() {
  console.log("═".repeat(60));
  console.log("🏪 AIcevrei — Shopify Collection Setup");
  console.log("═".repeat(60));

  // Test OAuth first
  await getToken();

  // Create collections
  const collectionMap = await createCollections();

  // Save collection map for push script
  const fs = require("fs");
  fs.writeFileSync("scripts/collection-map.json", JSON.stringify(collectionMap, null, 2));
  console.log("\n💾 Collection map saved to scripts/collection-map.json");

  // Summary
  const { rows } = await pool.query("SELECT COUNT(*) as cnt FROM products WHERE (is_filtered=false OR is_filtered IS NULL) AND retail_price_gbp > 0");
  console.log("\n" + "═".repeat(60));
  console.log("📊 READY FOR PUSH");
  console.log("═".repeat(60));
  console.log("  Collections created: " + Object.keys(collectionMap).length);
  console.log("  Products ready: " + rows[0].cnt);
  console.log("\n  Next: node scripts/shopify-push.js");

  await pool.end();
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
