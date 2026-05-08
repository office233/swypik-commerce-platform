/**
 * E2E Test: Search multiple categories, verify CJ returns correct products + Shopify sync
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const API = "http://localhost:3001/api/chat";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const TESTS = [
  { query: "rochie", expect: "dress" },
  { query: "casti wireless", expect: "earbuds|headphone|wireless" },
  { query: "husa telefon", expect: "case|phone|cover" },
  { query: "crema de fata", expect: "cream|face|serum|skin" },
  { query: "ceas smart", expect: "watch|smart|fitness" },
  { query: "pantofi sport", expect: "shoes|sneaker|sport" },
  { query: "lampa LED", expect: "lamp|led|light" },
  { query: "geanta dama", expect: "bag|handbag|women" },
];

async function testCategory(query: string, expectPattern: string) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: query, sessionId: "test-" + Date.now() }),
  });
  const data = await res.json();
  
  const products = data.products || [];
  const aiReply = data.reply || "";
  const regex = new RegExp(expectPattern, "i");
  
  // Check if at least 1 product matches expected pattern
  const matching = products.filter((p: any) => 
    regex.test(p.originalTitle || "") || regex.test(p.title || "") || regex.test(p.category || "")
  );
  
  const hasImages = products.filter((p: any) => (p.images || []).length > 0).length;
  const hasPrices = products.filter((p: any) => p.price > 0).length;
  
  const pass = products.length > 0 && matching.length > 0;
  
  console.log(`${pass ? "✅" : "❌"} "${query}" → ${products.length} products (${matching.length} matching "${expectPattern}")`);
  console.log(`   AI: ${aiReply.slice(0, 80)}...`);
  if (products[0]) {
    console.log(`   1st: "${products[0].originalTitle}" — ${products[0].price} lei — imgs: ${products[0].images?.length || 0}`);
  }
  console.log(`   Images: ${hasImages}/${products.length} | Prices: ${hasPrices}/${products.length}`);
  console.log("");
  
  return { query, pass, total: products.length, matching: matching.length };
}

async function main() {
  console.log("🧪 AICeVrei E2E Test — CJ + Gemini + Shopify\n");
  console.log("=".repeat(60));
  
  const results = [];
  
  for (const test of TESTS) {
    const result = await testCategory(test.query, test.expect);
    results.push(result);
    await sleep(3000); // CJ rate limit + Gemini
  }
  
  console.log("=".repeat(60));
  const passed = results.filter(r => r.pass).length;
  console.log(`\n🏁 RESULTS: ${passed}/${results.length} categories passed`);
  
  // Check Shopify count
  await sleep(5000); // Wait for background syncs
  const STORE = process.env.SHOPIFY_STORE!;
  const authRes = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET, grant_type: "client_credentials"}),
  });
  const token = (await authRes.json()).access_token;
  const countRes = await fetch(`https://${STORE}/admin/api/2026-04/products/count.json`, {
    headers: {"X-Shopify-Access-Token": token},
  });
  const count = (await countRes.json()).count;
  console.log(`\n📦 Shopify products after test: ${count}`);
}

main().catch(console.error);
