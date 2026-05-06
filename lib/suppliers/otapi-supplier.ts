/**
 * OTAPI (OTCommerce) Supplier — 1688 Factory Direct
 * AI-Curated Marketplace Proxy for AICeVrei.ro
 * 
 * "Temu + ChatGPT + produse curate"
 */

import { SupplierProduct, ProductVariant } from "../types";

const OTAPI_KEY = process.env.OTAPI_KEY || "9decf2ab-160c-4c0e-bd68-27e5aaed12a1";
const OTAPI_JSON = "https://otapi.net/service-json";
const EUR_TO_RON = 4.97;

// ─── Shipping Estimates (ePacket China → Romania) ─────────────────────
function estimateShippingRON(weightKg: number): number {
  if (weightKg <= 0.1) return 7;    // ultra-light (husă, colier)
  if (weightKg <= 0.3) return 10;   // light (rochie ușoară, cremă)
  if (weightKg <= 0.5) return 14;   // medium
  if (weightKg <= 1.0) return 20;   // heavy-ish
  if (weightKg <= 2.0) return 30;   // heavy
  return 45;                         // 2kg+ 
}

// ─── Competitive Pricing (20-32% markup, transport inclus) ────────────
function calculateCompetitivePrice(costRON: number, shippingRON: number): {
  sellPrice: number;
  oldPrice: number;
  marginPercent: number;
} {
  const totalCost = costRON + shippingRON;

  // Ultra-competitive markup — beat AliExpress prices
  let markup: number;
  if (totalCost < 15) markup = 1.35;       // very cheap: 35%
  else if (totalCost < 30) markup = 1.30;  // cheap: 30%
  else if (totalCost < 60) markup = 1.28;  // medium: 28%
  else if (totalCost < 120) markup = 1.25; // expensive: 25%
  else markup = 1.22;                       // premium: 22%

  const rawPrice = totalCost * markup;

  // Psychological pricing: X9 (19, 29, 39, 49, 59, 79, 99...)
  let sellPrice: number;
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

  // Make sure we don't sell below cost
  if (sellPrice <= totalCost) {
    sellPrice = Math.ceil(totalCost * 1.25 / 10) * 10 - 1;
  }

  // "Was" price — typical Romanian retail (60-100% higher)
  const retailMultiplier = 1.6 + Math.random() * 0.4; // 1.6x - 2.0x
  const oldPrice = Math.ceil(sellPrice * retailMultiplier / 10) * 10 - 1;

  const marginPercent = Math.round(((sellPrice - totalCost) / sellPrice) * 100);

  return { sellPrice, oldPrice, marginPercent };
}

// ─── AI Quality Score — Filters junk, ranks quality ───────────────────
function calculateQualityScore(item: any): number {
  let score = 50; // baseline

  // Sales volume (huge signal)
  const sales = parseInt(
    (item.FeaturedValues || []).find((f: any) => f.Name === "SalesInLast30Days")?.Value || "0"
  );
  if (sales > 1000) score += 25;
  else if (sales > 300) score += 20;
  else if (sales > 100) score += 15;
  else if (sales > 30) score += 10;
  else if (sales > 5) score += 5;
  else score -= 10; // no sales = suspicious

  // Rating
  const rating = parseFloat(
    (item.FeaturedValues || []).find((f: any) => f.Name === "rating")?.Value || "0"
  );
  if (rating >= 4.8) score += 15;
  else if (rating >= 4.5) score += 10;
  else if (rating >= 4.0) score += 5;
  else if (rating > 0 && rating < 3.5) score -= 15;

  // Images count (more = more professional)
  const imageCount = (item.Pictures || []).length;
  if (imageCount >= 5) score += 10;
  else if (imageCount >= 3) score += 5;
  else if (imageCount < 2) score -= 20;

  // Price sanity — extremely cheap is often junk
  const price = item.Price?.OriginalPrice || 0;
  if (price < 0.3) score -= 20; // under 30 cents = junk
  if (price > 200) score -= 5;  // expensive for dropship

  // Weight sanity — very heavy = expensive shipping
  const weight = item.PhysicalParameters?.Weight || 0.3;
  if (weight > 2) score -= 15;  // too heavy
  if (weight > 5) score -= 30;  // way too heavy

  // Expired/inactive check
  const features = item.Features || [];
  if (features.includes("Expired")) score -= 30;

  return Math.max(0, Math.min(100, score));
}

// ─── Parse OTAPI Item → SupplierProduct ───────────────────────────────
function parseOtapiItem(item: any): SupplierProduct | null {
  const title = item.Title || "";
  if (!title || title.length < 5) return null;

  const id = item.Id || "";
  if (!id) return null;

  // Price
  const priceEUR = item.Price?.OriginalPrice || 0;
  if (priceEUR <= 0.1) return null;
  const priceRON = Math.round(priceEUR * EUR_TO_RON * 100) / 100;

  // Weight & Shipping
  const weightKg = item.PhysicalParameters?.Weight || 0.3;
  if (weightKg > 3) return null; // skip very heavy items
  const shippingRON = estimateShippingRON(weightKg);

  // Quality check
  const qualityScore = calculateQualityScore(item);
  if (qualityScore < 40) return null; // AI scam filter

  // Images (must have at least 1)
  const images = (item.Pictures || [])
    .map((p: any) => p.Large?.Url || p.Medium?.Url || p.Small?.Url || "")
    .filter((u: string) => u.length > 10 && u.startsWith("http"))
    .slice(0, 6);
  if (images.length === 0) return null;

  // Pricing
  const pricing = calculateCompetitivePrice(priceRON, shippingRON);

  // Sales data
  const salesLast30 = parseInt(
    (item.FeaturedValues || []).find((f: any) => f.Name === "SalesInLast30Days")?.Value || "0"
  );
  const rating = parseFloat(
    (item.FeaturedValues || []).find((f: any) => f.Name === "rating")?.Value || "4.5"
  );

  // Clean title — remove "(Trading transfrontalier)" and junk prefixes
  const cleanTitle = title
    .replace(/\(Trading transfrontalier\),?\s*/gi, "")
    .replace(/\(comerț transfrontalier\),?\s*/gi, "")
    .replace(/^,\s*/, "")
    .trim();

  return {
    source: "otapi",
    sourceProductId: id,
    sourceUrl: `https://detail.1688.com/offer/${id.replace("abb-", "")}.html`,
    title: cleanTitle,
    description: cleanTitle, // AI rewriter will enhance this later
    price: priceRON,
    compareAtPrice: pricing.oldPrice,
    shipping: shippingRON,
    currency: "RON",
    rating: Math.min(5, rating || 4.5),
    orders: salesLast30,
    deliveryDays: 18,
    images,
    category: "",
    variants: [{
      sourceVariantId: `otapi-${id}`,
      title: "Standard",
      options: { variant: "Standard" },
      price: pricing.sellPrice,
      stockStatus: "in_stock" as const,
    }],
  };
}

// ─── SEARCH ───────────────────────────────────────────────────────────
export async function otapiSearch(
  keyword: string,
  page = 0,
  pageSize = 50,
): Promise<{ products: SupplierProduct[]; totalCount: number; callsUsed: number }> {
  try {
    const xml = `<SearchItemsParameters><ItemTitle>${escapeXml(keyword)}</ItemTitle></SearchItemsParameters>`;
    const params = new URLSearchParams({
      instanceKey: OTAPI_KEY,
      language: "ro",
      signature: "",
      timestamp: "",
      sessionId: "",
      blockList: "",
      framePosition: String(page * pageSize),
      frameSize: String(Math.min(pageSize, 50)),
    });

    const url = `${OTAPI_JSON}/BatchSearchItemsFrame?${params.toString()}&xmlParameters=${encodeURIComponent(xml)}`;

    console.log(`[OTAPI] 🔍 Searching: "${keyword}" (page ${page}, size ${pageSize})`);

    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const json = await res.json();

    if (json.ErrorCode !== "Ok") {
      console.error(`[OTAPI] ❌ ${json.ErrorCode}: ${json.ErrorDescription || ""}`);
      return { products: [], totalCount: 0, callsUsed: 1 };
    }

    const items = json.Result?.Items?.Items?.Content || [];
    const totalCount = json.Result?.Items?.Items?.TotalCount || 0;

    console.log(`[OTAPI] 📦 ${items.length} items received (${totalCount} total available)`);

    // Parse & filter with AI quality score
    const products = items
      .map(parseOtapiItem)
      .filter((p: SupplierProduct | null): p is SupplierProduct => p !== null)
      .sort((a: SupplierProduct, b: SupplierProduct) => b.orders - a.orders); // best sellers first

    console.log(`[OTAPI] ✅ ${products.length} quality products after AI filter (${items.length - products.length} filtered out)`);

    return { products, totalCount, callsUsed: 1 };
  } catch (error: any) {
    console.error("[OTAPI] Error:", error.message);
    return { products: [], totalCount: 0, callsUsed: 0 };
  }
}

// ─── CURATED SEARCH — AI-ranked, best products only ──────────────────
export async function otapiCuratedSearch(
  keyword: string,
  maxProducts = 20,
): Promise<SupplierProduct[]> {
  const { products } = await otapiSearch(keyword, 0, Math.min(maxProducts * 2, 50));

  // AI Curation: rank by composite score
  const scored = products.map(p => ({
    product: p,
    score:
      (p.orders > 1000 ? 30 : p.orders > 100 ? 20 : p.orders > 10 ? 10 : 0) +
      (p.rating >= 4.8 ? 20 : p.rating >= 4.5 ? 15 : p.rating >= 4.0 ? 10 : 0) +
      (p.images.length >= 4 ? 15 : p.images.length >= 2 ? 10 : 0) +
      (p.price > 10 && p.price < 200 ? 10 : 0) + // sweet spot pricing
      (p.shipping < 15 ? 10 : 0), // light = cheap shipping
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxProducts).map(s => s.product);
}

// ─── Helper: XML escape ──────────────────────────────────────────────
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
