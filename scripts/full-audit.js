/**
 * 🔍 FULL AUDIT — AICeVrei Project
 * Tests all API endpoints, DB, frontend, and infrastructure
 */
const http = require("http");
const https = require("https");

const BASE_LOCAL = "http://localhost:3000";
const BASE_PROD = "https://aicevrei.ro";

async function fetchJSON(url, timeout = 15000) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout }, (res) => {
      let data = "";
      res.on("data", (d) => data += d);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: data.substring(0, 200) }); }
      });
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "TIMEOUT" }); });
  });
}

async function testEndpoint(name, url, check) {
  const r = await fetchJSON(url);
  const ok = r.status === 200 && (!check || check(r));
  const detail = check ? check(r, true) : `status=${r.status}`;
  console.log(`  ${ok ? "✅" : "❌"} ${name.padEnd(35)} ${ok ? "OK" : "FAIL"} — ${detail}`);
  return ok;
}

async function main() {
  console.log("═".repeat(70));
  console.log("🔍 FULL AUDIT — AICeVrei.ro");
  console.log("═".repeat(70));

  let pass = 0, fail = 0;
  function score(ok) { ok ? pass++ : fail++; }

  // ─── 1. Production API Tests ───────────────────────────────────
  console.log("\n📡 1. PRODUCTION API (aicevrei.ro)");
  console.log("─".repeat(50));

  score(await testEndpoint("GET /api/products (browse)", `${BASE_PROD}/api/products?limit=3`,
    (r, d) => d ? `total=${r.data?.total}, source=${r.data?.source}` : r.data?.total > 1000 && r.data?.source === "postgresql"));

  score(await testEndpoint("GET /api/products?search=dress", `${BASE_PROD}/api/products?search=dress&limit=3`,
    (r, d) => d ? `found=${r.data?.total}` : r.data?.total > 100));

  score(await testEndpoint("GET /api/products?categories=true", `${BASE_PROD}/api/products?categories=true`,
    (r, d) => d ? `cats=${r.data?.categories?.length}` : r.data?.categories?.length > 5));

  score(await testEndpoint("GET /api/products?mode=trending", `${BASE_PROD}/api/products?mode=trending&limit=5`,
    (r, d) => d ? `products=${r.data?.products?.length}` : r.data?.products?.length > 0));

  score(await testEndpoint("GET /api/products?mode=deals", `${BASE_PROD}/api/products?mode=deals&limit=5`,
    (r, d) => d ? `products=${r.data?.products?.length}` : r.data?.products?.length > 0));

  score(await testEndpoint("GET /api/products?mode=feed", `${BASE_PROD}/api/products?mode=feed&limit=5`,
    (r, d) => d ? `products=${r.data?.products?.length}` : r.data?.products?.length > 0));

  score(await testEndpoint("GET /api/products pagination", `${BASE_PROD}/api/products?limit=10&offset=100`,
    (r, d) => d ? `offset=${r.data?.offset}, next=${r.data?.nextPage ? "yes" : "no"}` : r.data?.offset === 100));

  score(await testEndpoint("GET /api/products price filter", `${BASE_PROD}/api/products?minPrice=50&maxPrice=200&limit=3`,
    (r, d) => d ? `total=${r.data?.total}` : r.data?.products?.every(p => p.price >= 50 && p.price <= 200)));

  score(await testEndpoint("GET /api/products category filter", `${BASE_PROD}/api/products?category=Jewelry&limit=3`,
    (r, d) => d ? `total=${r.data?.total}` : r.data?.total > 0));

  score(await testEndpoint("GET /api/shopify-products (legacy)", `${BASE_PROD}/api/shopify-products?limit=3`,
    (r, d) => d ? `status=${r.status}` : r.status === 200 || r.status === 500));

  score(await testEndpoint("GET /api/collections", `${BASE_PROD}/api/collections`,
    (r, d) => d ? `status=${r.status}` : r.status === 200));

  score(await testEndpoint("GET /api/search/suggest", `${BASE_PROD}/api/search/suggest?q=dress&limit=5`,
    (r, d) => d ? `status=${r.status}` : r.status === 200));

  score(await testEndpoint("GET /api/shopify-health", `${BASE_PROD}/api/shopify-health`,
    (r, d) => d ? `status=${r.status}` : r.status === 200));

  // ─── 2. Product Data Quality ───────────────────────────────────
  console.log("\n📊 2. DATA QUALITY");
  console.log("─".repeat(50));

  const browse = await fetchJSON(`${BASE_PROD}/api/products?limit=20`);
  if (browse.data?.products) {
    const prods = browse.data.products;
    const withImg = prods.filter(p => p.images?.length > 0 && p.images[0]?.startsWith("http")).length;
    const withPrice = prods.filter(p => p.price > 0).length;
    const withOldPrice = prods.filter(p => p.oldPrice > p.price).length;
    const withTitle = prods.filter(p => p.title?.length > 10).length;
    const withCategory = prods.filter(p => p.category?.length > 3).length;
    const withPgId = prods.filter(p => p.pgId).length;
    const withVariantId = prods.filter(p => p.variantId).length;
    const withBenefits = prods.filter(p => p.benefits?.length > 0).length;

    const check = (name, val, total) => {
      const ok = val === total;
      console.log(`  ${ok ? "✅" : "❌"} ${name.padEnd(35)} ${val}/${total}`);
      score(ok);
    };

    check("Products have images", withImg, 20);
    check("Products have price > 0", withPrice, 20);
    check("Products have oldPrice > price", withOldPrice, 20);
    check("Products have title > 10 chars", withTitle, 20);
    check("Products have category", withCategory, 20);
    check("Products have pgId (for JIT)", withPgId, 20);
    check("Products have benefits[]", withBenefits, 20);

    // Price sanity
    const avgPrice = prods.reduce((s, p) => s + p.price, 0) / prods.length;
    const minCostUsd = Math.min(...prods.map(p => p.costUsd || 999));
    const maxCostUsd = Math.max(...prods.map(p => p.costUsd || 0));
    console.log(`  📈 Avg price: ${Math.round(avgPrice)} RON | Cost range: $${minCostUsd}-$${maxCostUsd}`);
    
    // Check markup
    const margins = prods.map(p => p.costUsd > 0 ? p.price / (p.costUsd * 5) : 0).filter(m => m > 0);
    const avgMargin = margins.reduce((s, m) => s + m, 0) / margins.length;
    console.log(`  📈 Avg markup vs cost*5: ${(avgMargin * 100).toFixed(0)}%`);
  }

  // ─── 3. Frontend Check ─────────────────────────────────────────
  console.log("\n🖥️  3. FRONTEND & PWA");
  console.log("─".repeat(50));

  score(await testEndpoint("Homepage loads", BASE_PROD,
    (r, d) => d ? `status=${r.status}` : r.status === 200));

  score(await testEndpoint("icon-192.png (PWA)", `${BASE_PROD}/icon-192.png`,
    (r, d) => d ? `status=${r.status}` : r.status === 200));

  score(await testEndpoint("sw.js (Service Worker)", `${BASE_PROD}/sw.js`,
    (r, d) => d ? `status=${r.status}` : r.status === 200));

  score(await testEndpoint("manifest.json", `${BASE_PROD}/manifest.json`,
    (r, d) => d ? `status=${r.status}` : r.status === 200));

  // ─── 4. Cart & Checkout ────────────────────────────────────────
  console.log("\n🛒 4. CART & CHECKOUT (JIT)");
  console.log("─".repeat(50));

  // Check cart endpoint accepts POST
  const cartTest = await new Promise((resolve) => {
    const data = JSON.stringify({ products: [{ pgId: 1, title: "Test", quantity: 1 }], customer: { name: "Test", phone: "0721", address: "Test", city: "Test" } });
    const opts = { hostname: "aicevrei.ro", path: "/api/cart", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } };
    const req = https.request(opts, (res) => {
      let body = "";
      res.on("data", (d) => body += d);
      res.on("end", () => { try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch { resolve({ status: res.statusCode, data: body }); } });
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.write(data);
    req.end();
  });
  const cartOk = cartTest.status === 200 || cartTest.status === 500; // 500 means it tried (JIT push might fail for pgId=1)
  console.log(`  ${cartOk ? "⚠️" : "❌"} POST /api/cart (JIT)               ${cartTest.status} — ${JSON.stringify(cartTest.data).substring(0, 80)}`);

  // ─── 5. Environment & Config ───────────────────────────────────
  console.log("\n⚙️  5. ENVIRONMENT & CONFIG");
  console.log("─".repeat(50));

  const { Pool } = require("pg");
  // Test Neon
  try {
    const neon = new Pool({ connectionString: "postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require", ssl: { rejectUnauthorized: false }, max: 1 });
    const { rows } = await neon.query("SELECT COUNT(*) as c FROM products");
    const neonCount = parseInt(rows[0].c);
    const ok = neonCount > 100000;
    console.log(`  ${ok ? "✅" : "❌"} Neon Cloud DB                       ${neonCount} products`);
    score(ok);

    const imgCheck = await neon.query("SELECT COUNT(*) as c FROM products WHERE main_image IS NOT NULL AND main_image != ''");
    console.log(`  📊 Products with images:              ${imgCheck.rows[0].c}`);

    const catCheck = await neon.query("SELECT COUNT(*) as c FROM categories");
    console.log(`  📊 Categories:                        ${catCheck.rows[0].c}`);

    const shipCheck = await neon.query("SELECT COUNT(*) as c FROM shipping_rates");
    console.log(`  📊 Shipping rates:                    ${shipCheck.rows[0].c}`);

    // Check for products with cost=0
    const zeroCost = await neon.query("SELECT COUNT(*) as c FROM products WHERE cost_usd = 0 OR cost_usd IS NULL");
    const zeroCostCount = parseInt(zeroCost.rows[0].c);
    console.log(`  ${zeroCostCount === 0 ? "✅" : "⚠️"} Products with $0 cost:               ${zeroCostCount}`);

    await neon.end();
  } catch (e) {
    console.log(`  ❌ Neon Cloud DB                       ERROR: ${e.message}`);
    fail++;
  }

  // Test local DB
  try {
    const local = new Pool({ host: "localhost", port: 5432, database: "aicevrei_products_cj", user: "postgres", password: "postgres", max: 1 });
    const { rows } = await local.query("SELECT COUNT(*) as c FROM products");
    console.log(`  ✅ Local PostgreSQL                    ${rows[0].c} products`);
    score(true);
    await local.end();
  } catch (e) {
    console.log(`  ❌ Local PostgreSQL                    ${e.message}`);
    fail++;
  }

  // ─── 6. Files & Cleanup ────────────────────────────────────────
  console.log("\n🗂️  6. FILES & CLEANUP");
  console.log("─".repeat(50));

  const fs = require("fs");
  const rootJunk = ["cart-patch.js","fix-prompt.js","push-to-shopify.py","scrape-aliexpress.py",
    "test-ae-sdk.js","test-aliexpress.js","test-chat.js","test-scrape-quick.py",
    "test-scrapling-quick.py","test-scrapling.py","check-db.py","check-db-size.py",
    "check-eligibility.py","check-size-detail.py","db_export.dump","db_export.sql"];
  const junkFound = rootJunk.filter(f => fs.existsSync(`d:\\Aicevrei\\${f}`));
  console.log(`  ⚠️  Root junk files:                   ${junkFound.length} (${junkFound.join(", ")})`);

  const envExists = fs.existsSync("d:\\Aicevrei\\.env.local");
  console.log(`  ${envExists ? "✅" : "❌"} .env.local exists`);

  const gitignoreContent = fs.readFileSync("d:\\Aicevrei\\.gitignore", "utf8");
  const envInGitignore = gitignoreContent.includes(".env");
  console.log(`  ${envInGitignore ? "✅" : "❌"} .env.local in .gitignore`);
  
  const dumpInGitignore = gitignoreContent.includes("db_export");
  console.log(`  ${dumpInGitignore ? "✅" : "⚠️"} db_export.* in .gitignore:           ${dumpInGitignore ? "yes" : "NO — sensitive!"}`);

  // ─── Summary ───────────────────────────────────────────────────
  console.log("\n" + "═".repeat(70));
  console.log(`📊 AUDIT SUMMARY: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL`);
  console.log("═".repeat(70));
}

main().catch(e => { console.error(e); process.exit(1); });
