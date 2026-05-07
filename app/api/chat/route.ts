/**
 * Chat API v3 — PostgreSQL-first with AI category awareness
 * 
 * Flow: User message → AI extracts intent + query + category → PostgreSQL search → Bundle
 * NO MORE SHOPIFY API for product search — 108k products from PostgreSQL
 */

import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/ai/orchestrator";
import { searchProducts, getCategories, type ProductFilters } from "@/lib/db/product-queries";
import { buildSalesSuggestion, inferBundleQueries, pickBundleProducts, rankProducts } from "@/lib/sales/bundle-engine";
import { updateShoppingSession } from "@/lib/sales/shopping-session";

type ProductModel = any;

// ─── Category mapping for Romanian queries ────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  // Romanian → DB category
  "barbati": "Men's Clothing",
  "barbat": "Men's Clothing",
  "masculin": "Men's Clothing",
  "men": "Men's Clothing",
  "man": "Men's Clothing",
  "femei": "Women's Clothing",
  "femeie": "Women's Clothing",
  "dama": "Women's Clothing",
  "dame": "Women's Clothing",
  "women": "Women's Clothing",
  "woman": "Women's Clothing",
  "copii": "Toys, Kids & Babies",
  "copil": "Toys, Kids & Babies",
  "bebe": "Toys, Kids & Babies",
  "bebelus": "Toys, Kids & Babies",
  "kids": "Toys, Kids & Babies",
  "bijuterii": "Jewelry & Watches",
  "bijuterie": "Jewelry & Watches",
  "ceas": "Jewelry & Watches",
  "ceasuri": "Jewelry & Watches",
  "jewelry": "Jewelry & Watches",
  "casa": "Home, Garden & Furniture",
  "bucatarie": "Home, Garden & Furniture",
  "gradina": "Home, Garden & Furniture",
  "home": "Home, Garden & Furniture",
  "genti": "Bags & Shoes",
  "geanta": "Bags & Shoes",
  "pantofi": "Bags & Shoes",
  "incaltaminte": "Bags & Shoes",
  "shoes": "Bags & Shoes",
  "bags": "Bags & Shoes",
  "sport": "Sports & Outdoors",
  "fitness": "Sports & Outdoors",
  "outdoor": "Sports & Outdoors",
  "animal": "Pet Supplies",
  "pisica": "Pet Supplies",
  "caine": "Pet Supplies",
  "pet": "Pet Supplies",
  "beauty": "Health, Beauty & Hair",
  "skincare": "Health, Beauty & Hair",
  "makeup": "Health, Beauty & Hair",
  "cosmetice": "Health, Beauty & Hair",
  "frumusete": "Health, Beauty & Hair",
  "electronice": "Consumer Electronics",
  "electronic": "Consumer Electronics",
  "gadget": "Consumer Electronics",
  "telefon": "Phones & Accessories",
  "husa": "Phones & Accessories",
  "auto": "Automobiles & Motorcycles",
  "masina": "Automobiles & Motorcycles",
  "moto": "Automobiles & Motorcycles",
};

function detectCategory(query: string): string | undefined {
  const words = query.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/);
  
  for (const word of words) {
    if (CATEGORY_MAP[word]) return CATEGORY_MAP[word];
  }
  
  // Multi-word patterns
  const normalized = words.join(" ");
  if (normalized.includes("haine barbat") || normalized.includes("haine de barbat")) return "Men's Clothing";
  if (normalized.includes("haine femei") || normalized.includes("haine de dama")) return "Women's Clothing";
  if (normalized.includes("haine copii") || normalized.includes("haine de copii")) return "Toys, Kids & Babies";
  
  return undefined;
}

// ─── Search PostgreSQL ────────────────────────────────────────────
async function searchPG(query: string, limit = 16, opts: { maxPrice?: number; category?: string; sort?: string } = {}): Promise<ProductModel[]> {
  const filters: ProductFilters = {
    search: query || undefined,
    category: opts.category || detectCategory(query),
    maxPrice: opts.maxPrice,
    sort: (opts.sort as any) || "popular",
    limit,
    offset: 0,
  };
  
  const result = await searchProducts(filters);
  return result.products;
}

function uniqueProducts(products: ProductModel[]) {
  return products.filter((p: any, idx: number, arr: any[]) => arr.findIndex((x: any) => x.id === p.id) === idx);
}

function buildBundleProducts(mainProducts: ProductModel[], query: string, bundleQueries: string[], maxPrice?: number): ProductModel[] {
  // For now, just fetch complementary products from different categories
  return []; // Will be populated by async calls below
}

export async function POST(req: Request) {
  try {
    const { message, sessionId, directCjQuery, chatHistory = [], productContext = [], shoppingSession: incomingSession = {} } = await req.json();
    const userMessage = String(message || "").trim();
    if (!userMessage) return NextResponse.json({ error: "Mesajul nu poate fi gol" }, { status: 400 });

    const baseSession = updateShoppingSession(incomingSession, userMessage);
    const directQuery = String(directCjQuery || "").trim();

    // Direct query (from search bar)
    if (directQuery) {
      const category = detectCategory(directQuery);
      const products = await searchPG(directQuery, 20, { maxPrice: baseSession.budget, category });
      
      // Bundle: complementary products
      const bundleQueries = inferBundleQueries(directQuery);
      const bundleResults = await Promise.all(
        bundleQueries.slice(0, 2).map(bq => searchPG(bq, 6, { maxPrice: baseSession.budget }))
      );
      const bundleProducts = uniqueProducts(bundleResults.flat())
        .filter(p => !products.some((main: any) => main.id === p.id))
        .slice(0, 12);

      const suggestion = products[0] ? ` ${buildSalesSuggestion(products[0], bundleProducts.slice(0, 2))}` : "";
      
      return NextResponse.json({
        intent: "search_product",
        reply: products.length
          ? `Am găsit ${products.length} produse potrivite din 108k+ catalog. Alege unul și îți fac bundle instant. 🔥${suggestion}`
          : "Nu am găsit produse relevante. Încearcă o categorie mai clară.",
        products,
        bundleProducts,
        shoppingSession: baseSession,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    // AI orchestration
    const aiResult = await orchestrate(userMessage, chatHistory, productContext, baseSession);
    const shoppingSession = updateShoppingSession(baseSession, userMessage, aiResult.intent);

    if (aiResult.intent === "search_product" || aiResult.intent === "find_cheaper") {
      const query = aiResult.searchQuery || userMessage;
      const category = detectCategory(query) || detectCategory(userMessage);
      const maxPrice = aiResult.maxPrice || (shoppingSession.priceSensitivity === "high" ? shoppingSession.budget : undefined);
      
      const products = await searchPG(query, 16, { maxPrice, category, sort: aiResult.sort });
      
      // Bundle products
      const bundleQueries = [...(aiResult.bundleQueries || []), ...inferBundleQueries(query)];
      const bundleResults = await Promise.all(
        bundleQueries.slice(0, 2).map(bq => searchPG(bq, 6, { maxPrice, category }))
      );
      const bundleProducts = uniqueProducts(bundleResults.flat())
        .filter(p => !products.some((main: any) => main.id === p.id))
        .slice(0, 12);

      const suggestion = products[0] ? `\n\n${buildSalesSuggestion(products[0], bundleProducts.slice(0, 2))}` : "";

      return NextResponse.json({
        intent: aiResult.intent,
        reply: `${aiResult.reply}${suggestion}`,
        products,
        bundleProducts,
        shoppingSession,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    // Non-search intents (add_to_cart, checkout, general_chat, etc.)
    return NextResponse.json({
      intent: aiResult.intent,
      reply: aiResult.reply,
      products: [],
      bundleProducts: [],
      productId: aiResult.productId,
      productTitle: aiResult.productTitle,
      shoppingSession,
      sessionId: sessionId || crypto.randomUUID(),
    });
  } catch (error: any) {
    console.error("[Chat API v3] Error:", error);
    return NextResponse.json(
      { error: error?.message || "A apărut o eroare. Încearcă din nou." },
      { status: 500 }
    );
  }
}
