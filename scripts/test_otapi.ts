/**
 * OTAPI Product Analysis — Real prices, shipping, margins
 * Compares 1688 vs AliExpress prices
 */

const OTAPI_KEY = "9decf2ab-160c-4c0e-bd68-27e5aaed12a1";
const OTAPI_BASE = "http://otapi.net/service-json";
const EUR_TO_RON = 4.97; // BNR rate

type ProductAnalysis = {
  title: string;
  id: string;
  images: string[];
  priceEUR: number;
  priceRON: number;
  weightKg: number;
  shippingEstRON: number;
  totalCostRON: number;
  sellPriceRON: number;
  oldPriceRON: number;
  profitRON: number;
  marginPercent: number;
  salesLast30: number;
  rating: number;
};

async function otapiSearch(keyword: string, pageSize = 10): Promise<any[]> {
  const xml = `<SearchItemsParameters><ItemTitle>${keyword}</ItemTitle></SearchItemsParameters>`;
  const params = new URLSearchParams({
    instanceKey: OTAPI_KEY,
    language: "ro",
    signature: "",
    timestamp: "",
    sessionId: "",
    blockList: "",
    framePosition: "0",
    frameSize: String(pageSize),
  });
  
  const url = `${OTAPI_BASE}/BatchSearchItemsFrame?${params.toString()}&xmlParameters=${encodeURIComponent(xml)}`;
  
  const res = await fetch(url);
  const json = await res.json();
  
  if (json.ErrorCode !== "Ok") {
    console.error(`❌ ${json.ErrorCode}: ${json.ErrorDescription}`);
    return [];
  }
  
  return json.Result?.Items?.Items?.Content || [];
}

function analyzeProduct(item: any): ProductAnalysis | null {
  const title = item.Title || "?";
  const id = item.Id || "?";
  
  // Price
  const priceEUR = item.Price?.OriginalPrice || 0;
  if (priceEUR <= 0) return null;
  const priceRON = Math.round(priceEUR * EUR_TO_RON * 100) / 100;
  
  // Weight & Shipping
  const weightKg = item.PhysicalParameters?.Weight || 0.3;
  // Shipping estimate: ePacket ~$3/kg min $1.5, convert to RON
  const shippingUSD = Math.max(1.5, weightKg * 5);
  const shippingEstRON = Math.round(shippingUSD * 4.55 * 100) / 100;
  
  // Total cost
  const totalCostRON = Math.round((priceRON + shippingEstRON) * 100) / 100;
  
  // Sell price (markup x2-x3 + psychological pricing)
  let markup: number;
  if (totalCostRON < 30) markup = 2.5;
  else if (totalCostRON < 60) markup = 2.0;
  else if (totalCostRON < 120) markup = 1.7;
  else markup = 1.5;
  
  const rawSell = totalCostRON * markup;
  const sellPriceRON = Math.ceil(rawSell / 10) * 10 - 1; // X9 pricing
  const oldPriceRON = Math.ceil(sellPriceRON * 1.3 / 10) * 10 - 1;
  
  const profitRON = Math.round((sellPriceRON - totalCostRON) * 100) / 100;
  const marginPercent = Math.round((profitRON / sellPriceRON) * 100);
  
  // Images
  const images = (item.Pictures || [])
    .map((p: any) => p.Medium?.Url || p.Small?.Url || "")
    .filter((u: string) => u.length > 0)
    .slice(0, 3);
  
  // Sales & Rating
  const salesLast30 = parseInt(
    (item.FeaturedValues || []).find((f: any) => f.Name === "SalesInLast30Days")?.Value || "0"
  );
  const rating = parseFloat(
    (item.FeaturedValues || []).find((f: any) => f.Name === "rating")?.Value || "0"
  );
  
  return {
    title, id, images, priceEUR, priceRON, weightKg,
    shippingEstRON, totalCostRON, sellPriceRON, oldPriceRON,
    profitRON, marginPercent, salesLast30, rating,
  };
}

async function main() {
  console.log("🔍 OTAPI Product Analysis — Prețuri reale 1688 vs AliExpress\n");
  console.log("=".repeat(80));
  
  const categories = [
    { keyword: "women dress summer", label: "👗 Rochii" },
    { keyword: "phone case iphone", label: "📱 Huse telefon" },
    { keyword: "wireless earbuds", label: "🎧 Căști wireless" },
    { keyword: "face cream skincare", label: "🧴 Skincare" },
    { keyword: "jewelry necklace", label: "💎 Bijuterii" },
  ];
  
  let totalCalls = 0;
  const allProducts: ProductAnalysis[] = [];
  
  for (const cat of categories) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`${cat.label} — search: "${cat.keyword}"`);
    console.log(`${"─".repeat(80)}`);
    
    const items = await otapiSearch(cat.keyword, 5);
    totalCalls++;
    
    if (items.length === 0) {
      console.log("  ❌ No results");
      continue;
    }
    
    for (const item of items) {
      const p = analyzeProduct(item);
      if (!p) continue;
      allProducts.push(p);
      
      console.log(`\n  📦 ${p.title.slice(0, 70)}`);
      console.log(`  🖼️  ${p.images[0] || "no image"}`);
      console.log(`  ─────────────────────────────────────────`);
      console.log(`  💰 Preț fabrică 1688:  ${p.priceEUR.toFixed(2)} EUR = ${p.priceRON.toFixed(2)} RON`);
      console.log(`  🚚 Shipping estimat:   ${p.shippingEstRON.toFixed(2)} RON (~${p.weightKg.toFixed(2)} kg)`);
      console.log(`  📊 COST TOTAL:         ${p.totalCostRON.toFixed(2)} RON`);
      console.log(`  🏷️  PREȚ VÂNZARE:      ${p.sellPriceRON} RON (redus de la ${p.oldPriceRON} RON)`);
      console.log(`  💵 PROFIT NET:         ${p.profitRON} RON (${p.marginPercent}% marjă)`);
      console.log(`  📈 Vânzări/lună:       ${p.salesLast30}`);
      console.log(`  ⭐ Rating:             ${p.rating}/5`);
      console.log(`  🆔 ID:                 ${p.id}`);
    }
  }
  
  // Summary table
  console.log(`\n\n${"═".repeat(80)}`);
  console.log("📊 REZUMAT — TOATE PRODUSELE ANALIZATE");
  console.log(`${"═".repeat(80)}`);
  console.log(`\n${"Produs".padEnd(40)} | ${"Cost".padStart(8)} | ${"Sell".padStart(8)} | ${"Profit".padStart(8)} | ${"Marjă".padStart(6)}`);
  console.log(`${"-".repeat(40)}-+-${"-".repeat(8)}-+-${"-".repeat(8)}-+-${"-".repeat(8)}-+-${"-".repeat(6)}`);
  
  for (const p of allProducts) {
    const name = p.title.slice(0, 38).padEnd(40);
    console.log(`${name} | ${(p.totalCostRON + " lei").padStart(8)} | ${(p.sellPriceRON + " lei").padStart(8)} | ${(p.profitRON + " lei").padStart(8)} | ${(p.marginPercent + "%").padStart(6)}`);
  }
  
  const avgMargin = allProducts.length > 0 
    ? Math.round(allProducts.reduce((s, p) => s + p.marginPercent, 0) / allProducts.length)
    : 0;
  const avgProfit = allProducts.length > 0
    ? Math.round(allProducts.reduce((s, p) => s + p.profitRON, 0) / allProducts.length)
    : 0;
  
  console.log(`\n  Marjă medie: ${avgMargin}%`);
  console.log(`  Profit mediu/produs: ${avgProfit} lei`);
  console.log(`  Total produse: ${allProducts.length}`);
  console.log(`  API calls folosite: ${totalCalls}`);
  console.log(`  Calls rămase: ~${300 - 10 - totalCalls}`);
}

main().catch(console.error);
