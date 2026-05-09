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
  // ─── Women's Clothing (81,936) ───
  "femei": "Women's Clothing", "femeie": "Women's Clothing", "dama": "Women's Clothing",
  "dame": "Women's Clothing", "women": "Women's Clothing", "woman": "Women's Clothing",
  "rochie": "Women's Clothing", "rochii": "Women's Clothing", "fusta": "Women's Clothing",
  "bluza": "Women's Clothing", "bluze": "Women's Clothing",
  // ─── Men's Clothing (4,643) ───
  "barbati": "Men's Clothing", "barbat": "Men's Clothing", "masculin": "Men's Clothing",
  "men": "Men's Clothing", "man": "Men's Clothing",
  // ─── Shared clothing terms (no category forced — let search handle) ───
  // "haine", "imbracaminte", "tricou", "camasa", "pantaloni" — too generic
  // ─── Home, Garden & Furniture (5,285) ───
  "casa": "Home, Garden & Furniture", "acasa": "Home, Garden & Furniture",
  "mobilier": "Home, Garden & Furniture", "mobila": "Home, Garden & Furniture",
  "bucatarie": "Home, Garden & Furniture", "gradina": "Home, Garden & Furniture",
  "home": "Home, Garden & Furniture", "garden": "Home, Garden & Furniture",
  "decoratiuni": "Home, Garden & Furniture", "decor": "Home, Garden & Furniture",
  "depozitare": "Home, Garden & Furniture", "perna": "Home, Garden & Furniture",
  "perdea": "Home, Garden & Furniture", "perdele": "Home, Garden & Furniture",
  "prosoape": "Home, Garden & Furniture", "lenjerie": "Home, Garden & Furniture",
  "cana": "Home, Garden & Furniture", "pahare": "Home, Garden & Furniture",
  "vaza": "Home, Garden & Furniture", "covor": "Home, Garden & Furniture",
  "organizator": "Home, Garden & Furniture",
  // ─── Jewelry & Watches (3,634) ───
  "bijuterii": "Jewelry & Watches", "bijuterie": "Jewelry & Watches",
  "ceas": "Jewelry & Watches", "ceasuri": "Jewelry & Watches",
  "jewelry": "Jewelry & Watches", "colier": "Jewelry & Watches",
  "bratara": "Jewelry & Watches", "cercei": "Jewelry & Watches",
  "inel": "Jewelry & Watches", "inele": "Jewelry & Watches",
  "pandantiv": "Jewelry & Watches", "lantisor": "Jewelry & Watches",
  "brosa": "Jewelry & Watches", "watch": "Jewelry & Watches",
  "nunta": "Jewelry & Watches", "logodna": "Jewelry & Watches",
  // ─── Bags & Shoes (2,033) ───
  "genti": "Bags & Shoes", "geanta": "Bags & Shoes",
  "pantofi": "Bags & Shoes", "incaltaminte": "Bags & Shoes",
  "shoes": "Bags & Shoes", "bags": "Bags & Shoes",
  "ghiozdan": "Bags & Shoes", "rucsac": "Bags & Shoes",
  "portofel": "Bags & Shoes", "sandale": "Bags & Shoes",
  "adidasi": "Bags & Shoes", "cizme": "Bags & Shoes",
  "botine": "Bags & Shoes", "papuci": "Bags & Shoes",
  "sneakers": "Bags & Shoes",
  // ─── Pet Supplies (1,882) ───
  "animal": "Pet Supplies", "animale": "Pet Supplies",
  "pisica": "Pet Supplies", "pisici": "Pet Supplies",
  "caine": "Pet Supplies", "caini": "Pet Supplies",
  "pet": "Pet Supplies", "pets": "Pet Supplies",
  "lesa": "Pet Supplies", "zgarda": "Pet Supplies",
  "acvariu": "Pet Supplies", "hamster": "Pet Supplies",
  // ─── Health, Beauty & Hair (1,724) ───
  "beauty": "Health, Beauty & Hair", "frumusete": "Health, Beauty & Hair",
  "skincare": "Health, Beauty & Hair", "makeup": "Health, Beauty & Hair",
  "cosmetice": "Health, Beauty & Hair", "machiaj": "Health, Beauty & Hair",
  "crema": "Health, Beauty & Hair", "serum": "Health, Beauty & Hair",
  "sampon": "Health, Beauty & Hair", "balsam": "Health, Beauty & Hair",
  "peruca": "Health, Beauty & Hair", "peruci": "Health, Beauty & Hair",
  "unghii": "Health, Beauty & Hair", "manichiura": "Health, Beauty & Hair",
  "epilator": "Health, Beauty & Hair", "parfum": "Health, Beauty & Hair",
  "gene": "Health, Beauty & Hair",
  // ─── Toys, Kids & Babies (1,667) ───
  "copii": "Toys, Kids & Babies", "copil": "Toys, Kids & Babies",
  "bebe": "Toys, Kids & Babies", "bebelus": "Toys, Kids & Babies",
  "kids": "Toys, Kids & Babies", "jucarie": "Toys, Kids & Babies",
  "jucarii": "Toys, Kids & Babies", "toys": "Toys, Kids & Babies",
  "fetite": "Toys, Kids & Babies", "baieti": "Toys, Kids & Babies",
  "baby": "Toys, Kids & Babies", "carucior": "Toys, Kids & Babies",
  "biberon": "Toys, Kids & Babies",
  // ─── Sports & Outdoors (1,419) ───
  "sport": "Sports & Outdoors", "fitness": "Sports & Outdoors",
  "outdoor": "Sports & Outdoors", "sala": "Sports & Outdoors",
  "yoga": "Sports & Outdoors", "ciclism": "Sports & Outdoors",
  "bicicleta": "Sports & Outdoors", "pescuit": "Sports & Outdoors",
  "inot": "Sports & Outdoors", "camping": "Sports & Outdoors",
  "alergare": "Sports & Outdoors", "running": "Sports & Outdoors",
  "gym": "Sports & Outdoors", "fotbal": "Sports & Outdoors",
  // ─── Automobiles & Motorcycles (1,040) ───
  "auto": "Automobiles & Motorcycles", "masina": "Automobiles & Motorcycles",
  "moto": "Automobiles & Motorcycles", "motocicleta": "Automobiles & Motorcycles",
  "automobil": "Automobiles & Motorcycles", "car": "Automobiles & Motorcycles",
  "piese": "Automobiles & Motorcycles", "accesorii_auto": "Automobiles & Motorcycles",
  // ─── Home Improvement (951) ───
  "scule": "Home Improvement", "unelte": "Home Improvement",
  "tools": "Home Improvement", "iluminat": "Home Improvement",
  "lampa": "Home Improvement", "lampi": "Home Improvement",
  "bec": "Home Improvement", "led": "Home Improvement",
  "renovare": "Home Improvement", "bricolaj": "Home Improvement",
  // ─── Consumer Electronics (933) ───
  "electronice": "Consumer Electronics", "electronic": "Consumer Electronics",
  "gadget": "Consumer Electronics", "gadgeturi": "Consumer Electronics",
  "camera": "Consumer Electronics", "boxa": "Consumer Electronics",
  "boxe": "Consumer Electronics", "drone": "Consumer Electronics",
  "smart": "Consumer Electronics", "bluetooth": "Consumer Electronics",
  "casti": "Consumer Electronics", "headphones": "Consumer Electronics",
  // ─── Phones & Accessories (890) ───
  "telefon": "Phones & Accessories", "telefoane": "Phones & Accessories",
  "husa": "Phones & Accessories", "husă": "Phones & Accessories",
  "huse": "Phones & Accessories", "folie": "Phones & Accessories",
  "incarcator": "Phones & Accessories", "cablu": "Phones & Accessories",
  "phone": "Phones & Accessories", "iphone": "Phones & Accessories",
  "samsung": "Phones & Accessories",
  // ─── Computer & Office (274) ───
  "laptop": "Computer & Office", "computer": "Computer & Office",
  "tastatura": "Computer & Office", "mouse": "Computer & Office",
  "birou": "Computer & Office", "imprimanta": "Computer & Office",
  "usb": "Computer & Office", "ssd": "Computer & Office",
  "monitor": "Computer & Office",
  "gaming": "Computer & Office", "setup": "Computer & Office",
  "pc": "Computer & Office", "calculator": "Computer & Office",
  "consola": "Consumer Electronics", "controller": "Consumer Electronics",
};

function detectCategory(query: string): string | undefined {
  const normalized = query.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = normalized.split(/\s+/);
  
  // Check single words
  for (const word of words) {
    if (CATEGORY_MAP[word]) return CATEGORY_MAP[word];
  }
  
  // Multi-word patterns
  if (normalized.includes("haine barbat") || normalized.includes("haine de barbat") || normalized.includes("pentru barbati") || normalized.includes("pentru el")) return "Men's Clothing";
  if (normalized.includes("haine femei") || normalized.includes("haine de dama") || normalized.includes("pentru femei") || normalized.includes("pentru ea")) return "Women's Clothing";
  if (normalized.includes("haine copii") || normalized.includes("haine de copii") || normalized.includes("pentru copii")) return "Toys, Kids & Babies";
  if (normalized.includes("accesorii auto") || normalized.includes("piese auto")) return "Automobiles & Motorcycles";
  if (normalized.includes("accesorii telefon") || normalized.includes("husa telefon")) return "Phones & Accessories";
  if (normalized.includes("produse casa") || normalized.includes("pentru casa") || normalized.includes("de casa")) return "Home, Garden & Furniture";
  if (normalized.includes("ingrijire par") || normalized.includes("ingrijire piele")) return "Health, Beauty & Hair";
  
  return undefined;
}

// ─── Search PostgreSQL ────────────────────────────────────────────
async function searchPG(query: string, limit = 16, opts: { maxPrice?: number; category?: string; sort?: string; excludeIds?: string[] } = {}): Promise<ProductModel[]> {
  const filters: ProductFilters = {
    search: query || undefined,
    category: opts.category || detectCategory(query),
    maxPrice: opts.maxPrice,
    sort: (opts.sort as any) || "popular",
    limit,
    offset: 0,
    excludeIds: opts.excludeIds,
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

    if (aiResult.intent === "compare_products") {
      // Return comparison text without searching for new products
      return NextResponse.json({
        intent: "compare_products",
        reply: aiResult.reply,
        products: [],
        bundleProducts: [],
        productId: aiResult.productId,
        productTitle: aiResult.productTitle,
        shoppingSession,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    if (aiResult.intent === "search_product" || aiResult.intent === "find_cheaper" || aiResult.intent === "refine_search") {
      const query = aiResult.searchQuery || userMessage;
      // Priority: AI-returned category (from DB list) > hardcoded detectCategory > none
      const category = aiResult.category || detectCategory(query) || detectCategory(userMessage);
      // Extract maxPrice from initial queries like "sub 4000 lei" even when intent is search_product
      const explicitMax = userMessage.match(/(?:sub|maxim|pana la)\s*(\d{2,5})/i)?.[1];
      const maxPrice = aiResult.maxPrice || (explicitMax ? Number(explicitMax) : undefined) || (shoppingSession.priceSensitivity === "high" ? shoppingSession.budget : undefined);
      
      // For refine_search: exclude products user already saw
      const excludeIds = aiResult.intent === "refine_search" ? (aiResult.excludeIds || productContext.map((p: any) => String(p.id))) : undefined;
      let products = await searchPG(query, 16, { maxPrice, category, sort: aiResult.sort, excludeIds });
      let replyPrefix = "";
      
      // Fallback: if query is too strict and excludeIds exhausted results, broaden search
      if (products.length === 0 && excludeIds && excludeIds.length > 0 && category) {
        products = await searchPG("", 16, { maxPrice, category, sort: aiResult.sort, excludeIds });
      }
      // Fallback 2: if still empty, drop maxPrice constraint
      if (products.length === 0 && maxPrice) {
        products = await searchPG("", 16, { category, sort: aiResult.sort, excludeIds });
      }
      // Fallback 3: if category has 0 products, drop category and search globally
      if (products.length === 0 && category) {
        products = await searchPG(query, 16, { maxPrice, sort: aiResult.sort });
        if (products.length > 0) {
          replyPrefix = `⚠️ Nu avem încă produse în categoria "${category}", dar îți arăt ce am găsit relevant:\n\n`;
        }
      }
      
      // Bundle products (only search bundles if we have main products)
      const bundleQueries = products.length > 0 ? [...(aiResult.bundleQueries || []), ...inferBundleQueries(query)] : [];
      // If main category had no products, search bundles WITHOUT category filter
      const bundleCategory = products.length > 0 ? category : undefined;
      const bundleResults = await Promise.all(
        bundleQueries.slice(0, 2).map(bq => searchPG(bq, 6, { maxPrice, category: bundleCategory }))
      );
      const bundleProducts = uniqueProducts(bundleResults.flat())
        .filter(p => !products.some((main: any) => main.id === p.id))
        .slice(0, 12);

      // If STILL no products, give clear message with available categories
      if (products.length === 0 && category) {
        replyPrefix = `⚠️ Momentan nu avem produse în categoria „${category}". Adăugăm noi produse zilnic! Între timp, poți căuta în categoriile disponibile (rochii, haine femei, accesorii).\n\n`;
      }

      const suggestion = products[0] ? `\n\n${buildSalesSuggestion(products[0], bundleProducts.slice(0, 2))}` : "";

      return NextResponse.json({
        intent: aiResult.intent,
        reply: `${replyPrefix}${aiResult.reply}${suggestion}`,
        products,
        bundleProducts,
        shoppingSession,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    // Non-search intents — but check if we should still search
    const shoppingWords = ["haine", "rochie", "rochii", "pantofi", "ceas", "geanta", "bijuterii", "cadou", "vreau", "caut", "arat", "recomand", "aveti", "pret", "setup", "gaming", "monitor", "tastatura", "mouse", "laptop", "kit", "apartament", "copii", "jucarii", "animale", "caine", "pisica", "sport", "fitness", "auto", "cosmetice", "telefon", "husa", "birou", "scule", "electronice"];
    const looksLikeShopping = shoppingWords.some(w => userMessage.toLowerCase().includes(w));
    
    if (looksLikeShopping && aiResult.intent !== "checkout" && aiResult.intent !== "track_order") {
      // Fallback: search with the user message directly
      const query = aiResult.searchQuery || userMessage;
      // Use AI category first, then hardcoded fallback
      const category = aiResult.category || detectCategory(query) || detectCategory(userMessage);
      const explicitMax = userMessage.match(/(?:sub|maxim|pana la)\s*(\d{2,5})/i)?.[1];
      const maxPrice = aiResult.maxPrice || (explicitMax ? Number(explicitMax) : undefined);
      const products = await searchPG(query, 16, { category, maxPrice });
      
      return NextResponse.json({
        intent: aiResult.intent || "search_product",
        reply: aiResult.reply || "Iată ce am găsit pentru tine! 🔥",
        products,
        bundleProducts: [],
        productId: aiResult.productId,
        productTitle: aiResult.productTitle,
        shoppingSession,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

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
