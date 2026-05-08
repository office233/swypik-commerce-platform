/**
 * OTAPI → PostgreSQL RAPID PULL
 * 
 * Tragem TOATE produsele din OTAPI direct în PostgreSQL
 * FĂRĂ Shopify push — ultra rapid (1 call = 50 produse în DB în <3 sec)
 * 
 * Usage: npx tsx scripts/otapi-pull-to-db.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "pg";

const OTAPI_KEY = process.env.OTAPI_KEY || "9decf2ab-160c-4c0e-bd68-27e5aaed12a1";
const OTAPI_JSON = "https://otapi.net/service-json";
const EUR_TO_RON = 4.97;

// ─── PostgreSQL ──────────────────────────────────────────────────────
const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "aicevrei_products",
  user: "postgres",
  password: "postgres", // default
});

// ─── MEGA Category List — EVERYTHING ─────────────────────────────────
const ALL_CATEGORIES = [
  // FASHION
  { keyword: "women dress summer", tag: "Rochii", pages: 5 },
  { keyword: "women blouse top elegant", tag: "Bluze Femei", pages: 5 },
  { keyword: "women skirt mini midi", tag: "Fuste", pages: 3 },
  { keyword: "hoodie sweatshirt oversized", tag: "Hanorace", pages: 5 },
  { keyword: "jeans pants men slim", tag: "Pantaloni Bărbați", pages: 3 },
  { keyword: "men t-shirt summer casual", tag: "Tricouri Bărbați", pages: 5 },
  { keyword: "jacket coat women spring", tag: "Jachete Femei", pages: 3 },
  { keyword: "men jacket bomber casual", tag: "Jachete Bărbați", pages: 3 },
  { keyword: "women swimsuit bikini", tag: "Costume de Baie", pages: 3 },
  { keyword: "pajamas sleepwear women", tag: "Pijamale", pages: 3 },
  { keyword: "sportswear tracksuit set", tag: "Ținute Sport", pages: 3 },
  { keyword: "underwear women bra lingerie", tag: "Lenjerie", pages: 3 },
  { keyword: "socks men women cotton", tag: "Șosete", pages: 2 },
  { keyword: "leggings yoga pants women", tag: "Colanți", pages: 3 },

  // ACCESORII
  { keyword: "women bag handbag crossbody", tag: "Genți", pages: 5 },
  { keyword: "backpack school travel laptop", tag: "Rucsacuri", pages: 3 },
  { keyword: "wallet purse leather", tag: "Portofele", pages: 3 },
  { keyword: "sunglasses fashion UV", tag: "Ochelari de Soare", pages: 3 },
  { keyword: "hat cap baseball bucket", tag: "Pălării & Șepci", pages: 3 },
  { keyword: "scarf shawl women winter", tag: "Eșarfe", pages: 3 },
  { keyword: "belt leather men women", tag: "Curele", pages: 2 },
  { keyword: "watch men women fashion", tag: "Ceasuri", pages: 5 },

  // BIJUTERII
  { keyword: "jewelry necklace women gold", tag: "Coliere", pages: 5 },
  { keyword: "earrings women fashion stud", tag: "Cercei", pages: 5 },
  { keyword: "ring women men fashion band", tag: "Inele", pages: 3 },
  { keyword: "bracelet women men bangle", tag: "Brățări", pages: 3 },
  { keyword: "hair accessories clips bands", tag: "Accesorii Păr", pages: 3 },

  // TECH & GADGETS
  { keyword: "phone case iphone samsung", tag: "Huse Telefon", pages: 5 },
  { keyword: "wireless earbuds bluetooth", tag: "Căști Wireless", pages: 5 },
  { keyword: "smart watch fitness tracker", tag: "Smartwatch", pages: 5 },
  { keyword: "bluetooth speaker portable", tag: "Boxe Bluetooth", pages: 3 },
  { keyword: "power bank portable battery", tag: "Baterii Externe", pages: 3 },
  { keyword: "USB cable charger fast", tag: "Încărcătoare", pages: 3 },
  { keyword: "phone screen protector glass", tag: "Folii Protecție", pages: 3 },
  { keyword: "gaming mouse keyboard RGB", tag: "Gaming", pages: 3 },
  { keyword: "LED strip light RGB home", tag: "Lumini LED", pages: 5 },
  { keyword: "car phone holder mount", tag: "Accesorii Auto", pages: 3 },
  { keyword: "mini projector portable", tag: "Proiectoare", pages: 2 },
  { keyword: "drone camera mini", tag: "Drone", pages: 2 },
  { keyword: "dashcam car camera recorder", tag: "Camera Auto", pages: 2 },
  { keyword: "ring light selfie LED", tag: "Ring Light", pages: 2 },
  { keyword: "webcam microphone streaming", tag: "Streaming", pages: 2 },
  { keyword: "laptop stand holder desk", tag: "Accesorii Laptop", pages: 2 },

  // ÎNCĂLȚĂMINTE  
  { keyword: "sneakers running shoes sport", tag: "Sneakers", pages: 5 },
  { keyword: "sandals women summer flat", tag: "Sandale", pages: 3 },
  { keyword: "slippers home indoor soft", tag: "Papuci", pages: 2 },
  { keyword: "boots women ankle winter", tag: "Ghete", pages: 3 },

  // BEAUTY & SKINCARE
  { keyword: "skincare face serum cream", tag: "Skincare", pages: 5 },
  { keyword: "makeup brush set cosmetic", tag: "Machiaj", pages: 3 },
  { keyword: "nail art gel polish", tag: "Unghii", pages: 3 },
  { keyword: "hair dryer straightener", tag: "Coafură", pages: 3 },
  { keyword: "perfume fragrance men women", tag: "Parfumuri", pages: 3 },
  { keyword: "face mask sheet skincare", tag: "Măști Faciale", pages: 2 },
  { keyword: "electric toothbrush sonic", tag: "Îngrijire Dentară", pages: 2 },
  { keyword: "massage gun fascia muscle", tag: "Masaj", pages: 2 },
  { keyword: "essential oil diffuser", tag: "Aromaterapie", pages: 2 },

  // CASĂ & DECOR
  { keyword: "kitchen organizer storage", tag: "Organizare Bucătărie", pages: 3 },
  { keyword: "bathroom accessories holder", tag: "Accesorii Baie", pages: 3 },
  { keyword: "coffee cup mug ceramic", tag: "Căni & Pahare", pages: 3 },
  { keyword: "wall art poster canvas", tag: "Tablouri", pages: 3 },
  { keyword: "pillow cushion cover deco", tag: "Perne Decorative", pages: 3 },
  { keyword: "rug carpet floor mat", tag: "Covoare", pages: 2 },
  { keyword: "desk lamp study LED", tag: "Lămpi Birou", pages: 2 },
  { keyword: "plant pot flower vase", tag: "Ghivece & Vaze", pages: 2 },
  { keyword: "curtain blackout modern", tag: "Perdele", pages: 2 },
  { keyword: "storage box organizer", tag: "Cutii Organizare", pages: 2 },
  { keyword: "bedding set duvet cover", tag: "Lenjerie de Pat", pages: 3 },
  { keyword: "towel bath beach microfiber", tag: "Prosoape", pages: 2 },
  { keyword: "tool set home repair", tag: "Scule & Unelte", pages: 2 },

  // SPORT & OUTDOOR
  { keyword: "yoga mat fitness resistance", tag: "Fitness", pages: 3 },
  { keyword: "water bottle sport gym", tag: "Sport", pages: 2 },
  { keyword: "camping tent outdoor hiking", tag: "Camping", pages: 2 },
  { keyword: "bicycle accessories light", tag: "Ciclism", pages: 2 },
  { keyword: "fishing lure rod reel", tag: "Pescuit", pages: 2 },
  { keyword: "swimming goggles swimsuit", tag: "Înot", pages: 2 },

  // AUTO & MOTO
  { keyword: "car seat cover leather", tag: "Huse Scaun Auto", pages: 2 },
  { keyword: "car interior accessories LED", tag: "Interior Auto", pages: 2 },

  // COPII
  { keyword: "toys educational children", tag: "Jucării Copii", pages: 3 },
  { keyword: "baby clothes newborn infant", tag: "Haine Bebeluși", pages: 3 },
  { keyword: "children shoes boys girls", tag: "Pantofi Copii", pages: 2 },

  // ANIMALE
  { keyword: "pet dog cat accessories", tag: "Accesorii Animale", pages: 3 },
  { keyword: "pet clothes dog outfit", tag: "Haine Animale", pages: 2 },

  // CADOURI & MISC
  { keyword: "gift creative gadget funny", tag: "Cadouri Creative", pages: 3 },
  { keyword: "sticker decal laptop phone", tag: "Stickere", pages: 2 },
  { keyword: "keychain pendant charm cute", tag: "Brelocuri", pages: 2 },
];

// ─── Shipping estimate ──────────────────────────────────────────────
function estimateShipping(weightKg: number): number {
  if (weightKg <= 0.1) return 7;
  if (weightKg <= 0.3) return 10;
  if (weightKg <= 0.5) return 14;
  if (weightKg <= 1.0) return 20;
  if (weightKg <= 2.0) return 30;
  return 45;
}

// ─── Competitive pricing ────────────────────────────────────────────
function calcPrice(costRON: number, shippingRON: number) {
  const total = costRON + shippingRON;
  let markup = total < 15 ? 1.35 : total < 30 ? 1.30 : total < 60 ? 1.28 : total < 120 ? 1.25 : 1.22;
  const raw = total * markup;
  const points = [19,29,39,49,59,69,79,89,99,119,129,149,169,199,249,299,349,399,499,599,699,899,999];
  let sell = points.find(p => p >= raw) || Math.ceil(raw / 50) * 50 - 1;
  if (sell <= total) sell = Math.ceil(total * 1.22 / 10) * 10 - 1;
  const old = Math.ceil(sell * (1.6 + Math.random() * 0.3) / 10) * 10 - 1;
  const margin = Math.round(((sell - total) / sell) * 100);
  return { sell, old, margin };
}

// ─── Quality score ──────────────────────────────────────────────────
function qualityScore(item: any): number {
  let score = 50;
  const sales = parseInt((item.FeaturedValues || []).find((f: any) => f.Name === "SalesInLast30Days")?.Value || "0");
  if (sales > 1000) score += 25; else if (sales > 100) score += 15; else if (sales > 10) score += 5; else score -= 10;
  const rating = parseFloat((item.FeaturedValues || []).find((f: any) => f.Name === "rating")?.Value || "0");
  if (rating >= 4.5) score += 15; else if (rating >= 4.0) score += 5; else if (rating > 0 && rating < 3.5) score -= 15;
  const imgs = (item.Pictures || []).length;
  if (imgs >= 5) score += 10; else if (imgs < 2) score -= 20;
  if ((item.Price?.OriginalPrice || 0) < 0.3) score -= 20;
  return Math.max(0, Math.min(100, score));
}

// ─── XML escape ─────────────────────────────────────────────────────
function esc(s: string) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// ─── PULL one page from OTAPI ───────────────────────────────────────
async function pullPage(keyword: string, category: string, page: number): Promise<number> {
  const xml = `<SearchItemsParameters><ItemTitle>${esc(keyword)}</ItemTitle></SearchItemsParameters>`;
  const params = new URLSearchParams({
    instanceKey: OTAPI_KEY, language: "ro", signature: "", timestamp: "",
    sessionId: "", blockList: "",
    framePosition: String(page * 50), frameSize: "50",
  });
  const url = `${OTAPI_JSON}/BatchSearchItemsFrame?${params}&xmlParameters=${encodeURIComponent(xml)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const json = await res.json();
    if (json.ErrorCode !== "Ok") return 0;

    const items = json.Result?.Items?.Items?.Content || [];
    let inserted = 0;

    for (const item of items) {
      const title = (item.Title || "").replace(/\(Trading transfrontalier\),?\s*/gi, "").replace(/\(comerț transfrontalier\),?\s*/gi, "").trim();
      if (!title || title.length < 5) continue;

      const id = item.Id || "";
      const priceEUR = item.Price?.OriginalPrice || 0;
      if (priceEUR <= 0.1) continue;

      const priceRON = Math.round(priceEUR * EUR_TO_RON * 100) / 100;
      const weightKg = item.PhysicalParameters?.Weight || 0.3;
      if (weightKg > 3) continue;

      const score = qualityScore(item);
      if (score < 35) continue;

      const images = (item.Pictures || [])
        .map((p: any) => p.Large?.Url || p.Medium?.Url || p.Small?.Url || "")
        .filter((u: string) => u.length > 10)
        .slice(0, 6);
      if (images.length === 0) continue;

      const shippingRON = estimateShipping(weightKg);
      const pricing = calcPrice(priceRON, shippingRON);
      const sales = parseInt((item.FeaturedValues || []).find((f: any) => f.Name === "SalesInLast30Days")?.Value || "0");
      const rating = parseFloat((item.FeaturedValues || []).find((f: any) => f.Name === "rating")?.Value || "4.5");

      try {
        await pool.query(`
          INSERT INTO products (otapi_id, title, original_title, category, price_eur, price_ron, shipping_ron,
            sell_price, old_price, margin_percent, weight_kg, rating, sales_month, quality_score,
            images, image_count, source_url, vendor_name)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          ON CONFLICT (otapi_id) DO UPDATE SET updated_at = NOW()
        `, [id, title, item.OriginalTitle || "", category, priceEUR, priceRON, shippingRON,
            pricing.sell, pricing.old, pricing.margin, weightKg,
            Math.min(5, rating), sales, score,
            images, images.length,
            `https://detail.1688.com/offer/${id.replace("abb-","")}.html`,
            item.VendorName || ""]);
        inserted++;
      } catch (e: any) {
        // skip duplicate
      }
    }
    return inserted;
  } catch (e: any) {
    console.error(`  ⚠️ Timeout/error: ${e.message}`);
    return 0;
  }
}

// ─── MAIN ───────────────────────────────────────────────────────────
async function main() {
  console.log("═".repeat(70));
  console.log("🚀 OTAPI → PostgreSQL RAPID PULL");
  console.log(`   ${ALL_CATEGORIES.length} categories, ~${ALL_CATEGORIES.reduce((s,c) => s + c.pages, 0)} calls`);
  console.log("═".repeat(70));

  let totalProducts = 0;
  let totalCalls = 0;

  for (const cat of ALL_CATEGORIES) {
    console.log(`\n📂 ${cat.tag} — "${cat.keyword}" (${cat.pages} pages)`);

    for (let page = 0; page < cat.pages; page++) {
      totalCalls++;
      const inserted = await pullPage(cat.keyword, cat.tag, page);
      totalProducts += inserted;
      process.stdout.write(`  p${page + 1}: +${inserted} (total: ${totalProducts}, calls: ${totalCalls})  `);
    }
    console.log("");
  }

  // Final count
  const { rows } = await pool.query("SELECT COUNT(*) as cnt FROM products");
  
  console.log(`\n${"═".repeat(70)}`);
  console.log("📊 PULL COMPLETE");
  console.log(`${"═".repeat(70)}`);
  console.log(`  📦 Products in DB: ${rows[0].cnt}`);
  console.log(`  📞 OTAPI calls: ${totalCalls}`);
  console.log(`  💰 Cost: $${(totalCalls * 0.012).toFixed(2)}`);

  // Category breakdown
  const { rows: cats } = await pool.query("SELECT category, COUNT(*) as cnt FROM products GROUP BY category ORDER BY cnt DESC");
  console.log("\n  📂 Per category:");
  for (const c of cats) {
    console.log(`     ${c.category}: ${c.cnt} products`);
  }

  await pool.end();
}

main().catch(console.error);
