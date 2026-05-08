/**
 * OTAPI AI-Curated Bulk Import
 * "Temu + ChatGPT + produse curate"
 * 
 * NOT importing everything — only quality, viral, profitable products
 * 
 * Usage: npx tsx scripts/otapi-bulk-import.ts [--dry-run] [--category "keyword"]
 */

// Load .env.local for script context
import { config } from "dotenv";
config({ path: ".env.local" });

import { otapiSearch } from "../lib/suppliers/otapi-supplier";
import { calculatePricing, estimateShipping } from "../lib/pricing";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const API_VERSION = "2026-04";
const DRY_RUN = process.argv.includes("--dry-run");

// ─── RUNDA 2 MEGA — Categorii noi + restul din Runda 1 ──────────────
// ~60 categorii × 3-5 pagini = ~200 calls = ~10.000 produse
// Skip: Huse, Căști, Smartwatch, AccAuto, Încărcătoare, Baterii,
//       Gaming, Rochii, Genți, Ochelari, Tricouri, Sneakers (DONE)
const CURATED_CATEGORIES = [
  // ── REMAINING FROM ROUND 1 (not imported yet) ──
  { keyword: "jewelry necklace earrings women", tag: "Bijuterii", pages: 5 },
  { keyword: "hair accessories clips bands", tag: "Accesorii Păr", pages: 3 },
  { keyword: "skincare face serum cream", tag: "Skincare", pages: 5 },
  { keyword: "makeup brush set cosmetic", tag: "Machiaj", pages: 3 },
  { keyword: "nail art gel polish sticker", tag: "Unghii", pages: 3 },
  { keyword: "LED light strip home decoration", tag: "Lumini LED", pages: 5 },
  { keyword: "kitchen organizer storage", tag: "Organizare Bucătărie", pages: 3 },
  { keyword: "bathroom accessories holder", tag: "Accesorii Baie", pages: 3 },
  { keyword: "toys educational children puzzle", tag: "Jucării Copii", pages: 3 },
  { keyword: "pet dog cat accessories collar", tag: "Accesorii Animale", pages: 3 },
  { keyword: "yoga mat fitness resistance band", tag: "Fitness", pages: 3 },
  { keyword: "water bottle sport gym", tag: "Sport", pages: 3 },
  { keyword: "gift creative gadget funny", tag: "Cadouri Creative", pages: 3 },

  // ── HAINE & FASHION NOU ──
  { keyword: "women blouse top elegant summer", tag: "Bluze Femei", pages: 5 },
  { keyword: "jeans pants men slim fit", tag: "Pantaloni Bărbați", pages: 3 },
  { keyword: "women skirt mini midi long", tag: "Fuste", pages: 3 },
  { keyword: "hoodie sweatshirt unisex oversized", tag: "Hanorace", pages: 5 },
  { keyword: "jacket coat women spring autumn", tag: "Jachete Femei", pages: 3 },
  { keyword: "men jacket bomber casual", tag: "Jachete Bărbați", pages: 3 },
  { keyword: "underwear women bra set lingerie", tag: "Lenjerie", pages: 3 },
  { keyword: "socks men women cotton funny", tag: "Șosete", pages: 3 },
  { keyword: "scarf shawl women winter silk", tag: "Eșarfe", pages: 3 },
  { keyword: "hat cap baseball bucket sun", tag: "Pălării & Șepci", pages: 3 },
  { keyword: "belt leather men women fashion", tag: "Curele", pages: 2 },
  { keyword: "wallet purse leather men women", tag: "Portofele", pages: 3 },
  { keyword: "backpack school travel laptop", tag: "Rucsacuri", pages: 3 },

  // ── TECH NOU ──
  { keyword: "phone screen protector tempered glass", tag: "Folii Protecție", pages: 3 },
  { keyword: "laptop stand holder desk", tag: "Accesorii Laptop", pages: 2 },
  { keyword: "webcam microphone streaming", tag: "Streaming", pages: 2 },
  { keyword: "mini projector portable home", tag: "Proiectoare", pages: 2 },
  { keyword: "ring light selfie LED", tag: "Ring Light", pages: 2 },
  { keyword: "car camera dashcam recorder", tag: "Camera Auto", pages: 2 },
  { keyword: "bluetooth speaker portable waterproof", tag: "Boxe Bluetooth", pages: 3 },
  { keyword: "VR glasses virtual reality headset", tag: "VR & AR", pages: 2 },
  { keyword: "drone camera mini quadcopter", tag: "Drone", pages: 2 },
  { keyword: "electric toothbrush sonic", tag: "Îngrijire Dentară", pages: 2 },

  // ── CASĂ & BUCĂTĂRIE NOU ──
  { keyword: "coffee cup mug ceramic creative", tag: "Căni & Pahare", pages: 3 },
  { keyword: "wall art poster print canvas", tag: "Tablouri & Artă", pages: 3 },
  { keyword: "curtain blackout modern bedroom", tag: "Perdele", pages: 2 },
  { keyword: "pillow cushion cover decorative", tag: "Perne Decorative", pages: 3 },
  { keyword: "rug carpet floor mat home", tag: "Covoare", pages: 2 },
  { keyword: "desk lamp study reading LED", tag: "Lămpi Birou", pages: 2 },
  { keyword: "plant pot flower vase ceramic", tag: "Ghivece & Vaze", pages: 2 },
  { keyword: "tool set home repair hardware", tag: "Scule & Unelte", pages: 2 },
  { keyword: "storage box container organizer", tag: "Cutii Organizare", pages: 2 },

  // ── BEAUTY & SĂNĂTATE NOU ──
  { keyword: "hair dryer straightener curler", tag: "Coafură", pages: 3 },
  { keyword: "perfume fragrance eau de toilette", tag: "Parfumuri", pages: 3 },
  { keyword: "massage gun fascia muscle", tag: "Masaj", pages: 2 },
  { keyword: "face mask sheet skincare", tag: "Măști Faciale", pages: 2 },
  { keyword: "essential oil diffuser aromatherapy", tag: "Aromaterapie", pages: 2 },

  // ── SPORT & OUTDOOR NOU ──
  { keyword: "camping tent outdoor hiking", tag: "Camping", pages: 2 },
  { keyword: "bicycle accessories light lock", tag: "Ciclism", pages: 2 },
  { keyword: "fishing lure rod reel tackle", tag: "Pescuit", pages: 2 },
  { keyword: "swimming goggles swimsuit", tag: "Înot", pages: 2 },

  // ── AUTO & MOTO NOU ──
  { keyword: "car seat cover leather universal", tag: "Huse Scaun Auto", pages: 2 },
  { keyword: "car interior accessories LED light", tag: "Interior Auto", pages: 2 },

  // ── COPII NOU ──
  { keyword: "baby clothes newborn infant", tag: "Haine Bebeluși", pages: 3 },
  { keyword: "children shoes boys girls sport", tag: "Pantofi Copii", pages: 2 },
];

// ─── Shopify OAuth Token ─────────────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getShopifyToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const res = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    throw new Error(`Shopify OAuth failed: ${res.status} — ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + 23 * 3600000 };
  console.log("[Shopify] ✅ OAuth token obtained");
  return cachedToken.token;
}

// ─── Shopify Push ────────────────────────────────────────────────────
async function shopifyREST(endpoint: string, method = "GET", body?: any) {
  if (!SHOPIFY_STORE || !SHOPIFY_CLIENT_ID) {
    throw new Error("Missing SHOPIFY_STORE or SHOPIFY_CLIENT_ID in .env.local");
  }

  const token = await getShopifyToken();

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

async function pushToShopify(product: {
  title: string;
  description: string;
  price: number;
  oldPrice: number;
  cost: number;
  shipping: number;
  images: string[];
  category: string;
  otapiId: string;
  weight: number;
  salesMonth: number;
  rating: number;
}): Promise<string | null> {
  const imageObjects = product.images
    .filter(url => url && url.startsWith("http"))
    .slice(0, 5)
    .map(src => ({ src }));

  // Rich HTML description
  const bodyHtml = `
    <div class="product-description">
      <p>${product.description}</p>
      <ul>
        <li>✅ Transport GRATUIT inclus în preț</li>
        <li>📦 Livrare în 15-20 zile lucrătoare</li>
        <li>🔄 Garanție 30 zile retur</li>
        <li>⭐ Rating: ${product.rating}/5 (${product.salesMonth}+ vândute/lună)</li>
      </ul>
    </div>
  `.trim();

  const payload = {
    product: {
      title: product.title,
      body_html: bodyHtml,
      product_type: product.category,
      vendor: "AICeVrei",
      tags: `otapi, ${product.category}, transport-inclus, ai-curated, 1688`,
      status: "active",
      variants: [{
        price: product.price.toFixed(2),
        compare_at_price: product.oldPrice > product.price ? product.oldPrice.toFixed(2) : null,
        sku: product.otapiId,
        requires_shipping: true,
        inventory_management: null,
        cost: product.cost.toFixed(2),
        weight: product.weight,
        weight_unit: "kg",
      }],
      images: imageObjects,
      metafields: [
        {
          namespace: "otapi",
          key: "source_id",
          value: product.otapiId,
          type: "single_line_text_field",
        },
        {
          namespace: "otapi",
          key: "shipping_estimate",
          value: product.shipping.toFixed(2),
          type: "number_decimal",
        },
      ],
    },
  };

  try {
    const json = await shopifyREST("products.json", "POST", payload);
    return json.product?.id ? String(json.product.id) : null;
  } catch (err: any) {
    console.error(`  ❌ Shopify push failed: ${err.message}`);
    return null;
  }
}

// ─── Main Import Logic ──────────────────────────────────────────────
async function main() {
  console.log("═".repeat(70));
  console.log("🚀 AICeVrei — AI-Curated 1688 Import");
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no Shopify push)" : "LIVE IMPORT"}`);
  console.log("═".repeat(70));

  // Check for single category mode
  const catArg = process.argv.findIndex(a => a === "--category");
  const categories = catArg >= 0 && process.argv[catArg + 1]
    ? [{ keyword: process.argv[catArg + 1], tag: process.argv[catArg + 1], pages: 1 }]
    : CURATED_CATEGORIES;

  let totalImported = 0;
  let totalFiltered = 0;
  let totalCalls = 0;
  const importMap: Record<string, string> = {};

  for (const cat of categories) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`📂 ${cat.tag} — "${cat.keyword}" (${cat.pages} pages)`);
    console.log(`${"─".repeat(70)}`);

    for (let page = 0; page < cat.pages; page++) {
      const { products, totalCount, callsUsed } = await otapiSearch(cat.keyword, page, 50);
      totalCalls += callsUsed;

      console.log(`\n  Page ${page + 1}: ${products.length} quality products (from ${totalCount} total)`);

      for (const product of products) {
        const weightKg = 0.3; // default, real weight comes from search
        const shippingRON = estimateShipping(weightKg, "otapi");
        const pricing = calculatePricing(product.price, shippingRON);

        console.log(`\n  📦 ${product.title.slice(0, 55)}`);
        console.log(`     💰 Cost: ${product.price.toFixed(0)} lei + 🚚 ${shippingRON} lei = ${(product.price + shippingRON).toFixed(0)} lei`);
        console.log(`     🏷️  Sell: ${pricing.sellPrice} lei (was ${pricing.oldPrice} lei) | 💵 Profit: ${pricing.margin.toFixed(0)} lei (${pricing.marginPercent}%)`);
        console.log(`     📈 ${product.orders} vândute/lună | ⭐ ${product.rating}/5 | 🖼️  ${product.images.length} poze`);

        if (DRY_RUN) {
          totalImported++;
          continue;
        }

        // Push to Shopify (with 500ms delay to respect rate limits)
        const shopifyId = await pushToShopify({
          title: product.title,
          description: product.description,
          price: pricing.sellPrice,
          oldPrice: pricing.oldPrice,
          cost: product.price + shippingRON,
          shipping: shippingRON,
          images: product.images,
          category: cat.tag,
          otapiId: product.sourceProductId,
          weight: weightKg,
          salesMonth: product.orders,
          rating: product.rating,
        });

        if (shopifyId) {
          totalImported++;
          importMap[product.sourceProductId] = shopifyId;
          console.log(`     ✅ Shopify ID: ${shopifyId}`);
        } else {
          totalFiltered++;
        }

        await new Promise(r => setTimeout(r, 600)); // rate limit protection
      }
    }
  }

  // Summary
  console.log(`\n\n${"═".repeat(70)}`);
  console.log("📊 IMPORT SUMMARY");
  console.log(`${"═".repeat(70)}`);
  console.log(`  ✅ Imported: ${totalImported} products`);
  console.log(`  ❌ Filtered/Failed: ${totalFiltered}`);
  console.log(`  📞 OTAPI calls used: ${totalCalls}`);
  console.log(`  💰 OTAPI cost: $${(totalCalls * 0.012).toFixed(2)}`);
  console.log(`  📊 Calls remaining: ~${285 - totalCalls}`);

  if (!DRY_RUN && Object.keys(importMap).length > 0) {
    // Save import mapping
    const fs = await import("fs");
    const mapFile = "scripts/otapi-import-map.json";
    const existing = fs.existsSync(mapFile) 
      ? JSON.parse(fs.readFileSync(mapFile, "utf-8")) 
      : {};
    const merged = { ...existing, ...importMap };
    fs.writeFileSync(mapFile, JSON.stringify(merged, null, 2));
    console.log(`  💾 Mapping saved: ${mapFile} (${Object.keys(merged).length} total)`);
  }
}

main().catch(console.error);
