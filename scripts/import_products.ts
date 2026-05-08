/**
 * Import 1000+ quality products from AliExpress → Shopify
 * Run: npx tsx scripts/import_products.ts
 * 
 * Strategy: Fetch bestsellers (sorted by orders) across 10 categories,
 * filter by quality (rating 4+, price 2-50 EUR), push to Shopify.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const API_HOST = process.env.RAPIDAPI_HOST || "aliexpress-datahub.p.rapidapi.com";
const API_KEY = process.env.RAPIDAPI_KEY || "";
const SHOPIFY_STORE = process.env.SHOPIFY_STORE || "";
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || "";
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || "";
const EUR_TO_RON = 4.97;

let shopifyToken = "";
async function getToken(): Promise<string> {
  if (shopifyToken) return shopifyToken;
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: SHOPIFY_CLIENT_ID, client_secret: SHOPIFY_CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Shopify OAuth failed: ${res.status}`);
  const data = await res.json();
  shopifyToken = data.access_token;
  console.log("🔑 Shopify token obtained");
  return shopifyToken;
}


// Categories with specific, targeted search queries
const CATEGORIES = [
  { name: "Căști & Audio", queries: ["wireless earbuds bluetooth 5.3", "bluetooth speaker portable waterproof", "headphones noise cancelling ANC"] },
  { name: "Telefon", queries: ["phone case silicone protective", "USB C fast charger cable", "phone holder car magnetic mount"] },
  { name: "Beauty", queries: ["face serum vitamin C", "makeup brush set professional", "lip gloss matte waterproof"] },
  { name: "Casă & Bucătărie", queries: ["kitchen gadget organizer tool", "bathroom accessories storage", "home decor LED light"] },
  { name: "Fashion", queries: ["t-shirt men summer streetwear", "sunglasses women polarized UV", "watch men casual luxury"] },
  { name: "Fitness", queries: ["resistance bands set gym", "yoga mat exercise workout", "water bottle sport portable"] },
  { name: "Gaming", queries: ["gaming mouse RGB wired", "keyboard mechanical gaming RGB", "mouse pad large XXL"] },
  { name: "Auto", queries: ["car phone holder dashboard", "car interior accessories organizer", "LED car ambient light"] },
  { name: "LED & Lumini", queries: ["LED strip light RGB bedroom", "night light projector bedroom", "desk lamp LED reading"] },
  { name: "Tech & Gadgets", queries: ["USB C hub adapter multiport", "smart watch fitness tracker", "power bank portable charger"] },
];

// Shopify rate limit: ~2 req/sec → 500ms between calls
const SHOPIFY_DELAY = 600;
const AE_DELAY = 2000;  // 2s between AliExpress calls (rate limit)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Product {
  id: string;
  title: string;
  priceEUR: number;
  priceRON: number;
  rating: number;
  orders: number;
  image: string;
  category: string;
}

async function aeSearch(query: string, page: number): Promise<Product[]> {
  try {
    const url = `https://${API_HOST}/item_search_4?q=${encodeURIComponent(query)}&page=${page}&sort=orders&region=RO&locale=en_US&currency=EUR`;
    const res = await fetch(url, {
      headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": API_HOST },
    });
    if (!res.ok) {
      if (res.status === 429) {
        console.log(`  ⏳ Rate limited, waiting 5s...`);
        await sleep(5000);
        return aeSearch(query, page); // retry
      }
      console.log(`  ❌ HTTP ${res.status} for "${query}" p${page}`); return [];
    }
    const json = await res.json();
    if (json.result?.status?.code !== 200 || !json.result?.resultList) return [];

    const products: Product[] = [];
    for (const entry of json.result.resultList) {
      const item = entry.item || entry;
      const itemId = String(item.itemId || "");
      if (!itemId) continue;

      const skuDef = item.sku?.def || {};
      const rawPrice = skuDef.promotionPrice ?? skuDef.price ?? 0;
      const priceEUR = typeof rawPrice === "string" ? parseFloat(rawPrice.split(" - ")[0]) : (rawPrice || 0);
      if (priceEUR < 2 || priceEUR > 50) continue;

      const rating = item.averageStarRate || 0;
      if (rating > 0 && rating < 4.0) continue;

      // Image
      let image = "";
      const imgField = item.image;
      if (typeof imgField === "string") image = imgField;
      else if (imgField?.imgUrl) image = imgField.imgUrl;
      if (image.startsWith("//")) image = `https:${image}`;
      if (!image.startsWith("http")) continue;

      products.push({
        id: itemId,
        title: item.title || "",
        priceEUR,
        priceRON: Math.round(priceEUR * EUR_TO_RON),
        rating: rating || 4.5,
        orders: typeof item.sales === "number" ? item.sales : parseInt(String(item.sales || "0").replace(/[^0-9]/g, "")) || 0,
        image,
        category: "",
      });
    }
    return products;
  } catch (e: any) {
    console.log(`  ❌ Error: ${e.message}`);
    return [];
  }
}

function calculatePrice(costRON: number): { sell: number; old: number; discount: number } {
  let markup: number;
  if (costRON < 25) markup = 1.6;
  else if (costRON < 60) markup = 1.45;
  else if (costRON < 120) markup = 1.35;
  else markup = 1.28;

  const sell = Math.ceil(costRON * markup / 10) * 10 - 1;
  const discount = Math.round(Math.random() * 10 + 15);
  const old = Math.ceil((sell / (1 - discount / 100)) / 10) * 10 - 1;
  return { sell, old, discount };
}

async function pushToShopify(product: Product, category: string): Promise<boolean> {
  try {
    const { sell, old } = calculatePrice(product.priceRON);
    const payload = {
      product: {
        title: product.title,
        body_html: `<p>${product.title}</p><p>⭐ ${product.rating} | ${product.orders}+ comenzi | 🚚 Transport gratuit</p>`,
        product_type: category,
        vendor: "AICeVrei",
        tags: `ai-import, ${category.toLowerCase()}, bestseller, transport-inclus`,
        status: "active",
        variants: [{
          price: sell.toFixed(2),
          compare_at_price: old > sell ? old.toFixed(2) : null,
          sku: `ACV-${product.id.slice(0, 20)}`,
          requires_shipping: true,
          inventory_management: null,
          cost: product.priceRON.toFixed(2),
        }],
        images: [{ src: product.image }],
      },
    };

    const token = await getToken();
    const res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2026-04/products.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      // Rate limited
      if (res.status === 429) {
        console.log("    ⏳ Rate limited, waiting 2s...");
        await sleep(2000);
        return pushToShopify(product, category); // retry
      }
      console.log(`    ❌ Shopify ${res.status}: ${err.slice(0, 80)}`);
      return false;
    }

    return true;
  } catch (e: any) {
    console.log(`    ❌ Shopify error: ${e.message}`);
    return false;
  }
}


async function main() {
  if (!API_KEY) { console.error("❌ RAPIDAPI_KEY not set!"); process.exit(1); }
  if (!SHOPIFY_STORE || !SHOPIFY_CLIENT_ID) { console.error("❌ SHOPIFY_STORE or SHOPIFY_CLIENT_ID not set!"); process.exit(1); }

  // Get token upfront
  await getToken();

  console.log("🚀 AICeVrei Product Importer");
  console.log(`📦 Target: 1000+ products across ${CATEGORIES.length} categories`);
  console.log(`🏪 Shopify: ${SHOPIFY_STORE}\n`);

  let totalImported = 0;
  let totalSkipped = 0;
  const seenIds = new Set<string>();

  for (const cat of CATEGORIES) {
    console.log(`\n━━━ ${cat.name} ━━━`);

    for (const query of cat.queries) {
      // Fetch 3 pages per query (≈60 products each)
      for (let page = 1; page <= 3; page++) {
        console.log(`  🔍 "${query}" page ${page}...`);
        const products = await aeSearch(query, page);
        console.log(`  📦 ${products.length} quality products found`);

        for (const p of products) {
          if (seenIds.has(p.id)) { totalSkipped++; continue; }
          seenIds.add(p.id);

          const ok = await pushToShopify(p, cat.name);
          if (ok) {
            totalImported++;
            if (totalImported % 10 === 0) {
              console.log(`  ✅ ${totalImported} imported (${totalSkipped} skipped dupes)`);
            }
          }
          await sleep(SHOPIFY_DELAY);
        }
        await sleep(AE_DELAY);
      }
    }
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`✅ DONE! ${totalImported} products imported to Shopify`);
  console.log(`⏭️  ${totalSkipped} duplicates skipped`);
  console.log(`📊 ${seenIds.size} unique products processed`);
}

main().catch(console.error);
