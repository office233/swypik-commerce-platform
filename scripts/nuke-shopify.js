/**
 * NUKE ALL SHOPIFY PRODUCTS + Reset PostgreSQL flags
 * Ștergem toate cele ~11,476 produse de pe Shopify
 * și resetăm shopify_id/pushed_to_shopify în DB
 * 
 * Usage: node scripts/nuke-shopify.js
 */
require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

const STORE = process.env.SHOPIFY_STORE;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

const pool = new Pool({
  host: "localhost", port: 5432,
  database: "aicevrei_products_cj",
  user: "postgres", password: "postgres",
});

let token = null;
async function getToken() {
  if (token) return token;
  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  token = (await res.json()).access_token;
  return token;
}

async function shopifyDELETE(productId) {
  const t = await getToken();
  const res = await fetch(`https://${STORE}/admin/api/2026-04/products/${productId}.json`, {
    method: "DELETE",
    headers: { "X-Shopify-Access-Token": t },
  });

  // Bucket-based rate limiting
  const limit = res.headers.get("x-shopify-shop-api-call-limit");
  if (limit) {
    const [used, max] = limit.split("/").map(Number);
    if (used > max - 3) await new Promise(r => setTimeout(r, 1500));
  }

  if (res.status === 429) {
    const retry = parseInt(res.headers.get("retry-after") || "3");
    await new Promise(r => setTimeout(r, retry * 1000));
    return shopifyDELETE(productId); // retry
  }

  return res.ok;
}

async function getProducts() {
  const t = await getToken();
  const res = await fetch(`https://${STORE}/admin/api/2026-04/products.json?limit=250&fields=id`, {
    headers: { "X-Shopify-Access-Token": t },
  });

  const limit = res.headers.get("x-shopify-shop-api-call-limit");
  if (limit) {
    const [used, max] = limit.split("/").map(Number);
    if (used > max - 3) await new Promise(r => setTimeout(r, 1500));
  }

  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 3000));
    return getProducts();
  }

  const data = await res.json();
  return data.products || [];
}

async function main() {
  console.log("═".repeat(60));
  console.log("💣 NUKE SHOPIFY — Ștergem TOATE produsele");
  console.log("═".repeat(60));

  await getToken();
  console.log("🔑 Token OK\n");

  let totalDeleted = 0;
  const startTime = Date.now();

  while (true) {
    const products = await getProducts();
    if (products.length === 0) break;

    console.log(`📦 Batch: ${products.length} produse de șters...`);

    for (const p of products) {
      const ok = await shopifyDELETE(p.id);
      if (ok) totalDeleted++;
      if (totalDeleted % 50 === 0 && totalDeleted > 0) {
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        const rate = (totalDeleted / (elapsed || 1)).toFixed(0);
        console.log(`  🗑️  ${totalDeleted} deleted (${elapsed} min, ~${rate}/min)`);
      }
    }
  }

  // Reset PostgreSQL flags
  console.log("\n📊 Resetăm flaguri PostgreSQL...");
  const result = await pool.query(`
    UPDATE products SET 
      pushed_to_shopify = false, 
      shopify_id = NULL, 
      shopify_variant_id = NULL,
      pushed_at = NULL,
      push_error = NULL
    WHERE pushed_to_shopify = true
  `);
  console.log(`  ✅ ${result.rowCount} produse resetate în DB`);

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ DONE! ${totalDeleted} produse șterse de pe Shopify`);
  console.log(`⏱️  Timp: ${elapsed} minute`);
  console.log(`📊 DB: toate flagurile shopify_id resetate`);
  console.log("═".repeat(60));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
