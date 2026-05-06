/**
 * Chat API — Main endpoint
 * Supports: AI chat search + directCjQuery for categories (bypasses AI)
 * Now uses AliExpress DataHub (via RapidAPI) as primary supplier
 */

import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/ai/orchestrator";
import { rewriteProduct } from "@/lib/ai/rewriter";
import { safetyCheck } from "@/lib/ai/safety-filter";
import { calculatePricing } from "@/lib/pricing";
import { aliexpressSearch } from "@/lib/suppliers/aliexpress-supplier";
import { cjSearch } from "@/lib/suppliers/cj-supplier";
import { mockSearch } from "@/lib/suppliers/mock-supplier";
import type { SupplierProduct } from "@/lib/types";
import { ensureProductInShopify } from "@/lib/shopify/product-sync";

export async function POST(req: Request) {
  try {
    const { message, sessionId, directCjQuery, chatHistory = [] } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "Mesajul nu poate fi gol" }, { status: 400 });
    }

    // DIRECT CATEGORY SEARCH — bypass AI orchestrator entirely
    if (directCjQuery) {
      console.log(`[Chat] DIRECT category search: "${directCjQuery}"`);

      let products = await searchAllSuppliers(directCjQuery);

      if (products.length === 0) {
        console.log("[Chat] All suppliers empty → mock fallback");
        products = mockSearch(message);
      }

      const processed = await processProducts(products);

      return NextResponse.json({
        intent: "search_product",
        reply: processed.length > 0
          ? `Am găsit ${processed.length} produse pentru tine! 🎯`
          : "Nu am găsit produse în această categorie. Încearcă altă căutare!",
        products: processed,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    // AI ORCHESTRATOR — for free-text messages
    const aiResult = await orchestrate(message, chatHistory);

    if (aiResult.intent === "search_product" || aiResult.intent === "find_cheaper") {
      const enQuery = aiResult.searchQuery || message;
      console.log(`[Chat] AI search: "${message}" → "${enQuery}"`);

      let products = await searchAllSuppliers(enQuery);

      // Bundle: fetch complementary products if AI suggested them
      if (aiResult.bundleQuery && products.length > 0) {
        console.log(`[Chat] Bundle query: "${aiResult.bundleQuery}"`);
        // Wait 1.1s for CJ rate limit
        await new Promise(r => setTimeout(r, 1100));
        const bundleProducts = await searchAllSuppliers(aiResult.bundleQuery);
        // Add first 3 bundle products tagged as bundles
        const bundles = bundleProducts.slice(0, 3).map(p => ({ ...p, isBundle: true }));
        products = [...products, ...bundles];
      }

      if (products.length === 0) {
        products = mockSearch(message);
      }

      const processed = await processProducts(products);

      return NextResponse.json({
        intent: aiResult.intent,
        reply: processed.length > 0
          ? aiResult.reply || `Am găsit ${processed.length} produse! 🎯`
          : "Nu am găsit produse relevante. Reformulează!",
        products: processed,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    // Other intents
    return NextResponse.json({
      intent: aiResult.intent,
      reply: aiResult.reply,
      products: [],
      sessionId: sessionId || crypto.randomUUID(),
    });
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      { error: "Ceva nu a mers bine. Încearcă din nou!" },
      { status: 500 }
    );
  }
}

/**
 * Search all suppliers — CJ Dropshipping first (primary), AliExpress as fallback
 */
async function searchAllSuppliers(query: string): Promise<SupplierProduct[]> {
  // CJ Dropshipping — PRIMARY (free API, fulfillment built-in)
  // Note: CJ has 1 req/sec rate limit, so we search sequentially
  if (process.env.CJ_API_KEY) {
    const p1 = await cjSearch(query, 1, 50);
    if (p1.length > 0) {
      console.log(`[Suppliers] CJ: ${p1.length} results`);
      return p1;
    }
  }

  // Fallback to AliExpress (rate limited, no fulfillment)
  if (process.env.RAPIDAPI_KEY) {
    const aeProducts = await aliexpressSearch(query, 1, 40);
    if (aeProducts.length > 0) {
      console.log(`[Suppliers] AliExpress fallback: ${aeProducts.length} results`);
      return aeProducts;
    }
  }

  return [];
}

async function processProducts(products: SupplierProduct[]) {
  const results = [];

  for (const product of products.slice(0, 60)) {
    const safety = safetyCheck(product);
    if (!safety.passed) continue;

    // AI rewrite — only for first 6 products (speed), rest use title as-is
    let rewrite;
    if (results.length < 6) {
      try {
        rewrite = await rewriteProduct({
          title: product.title,
          description: product.description,
          price: product.price,
          rating: product.rating,
          orders: product.orders,
          category: product.category,
          deliveryDays: product.deliveryDays,
        });
      } catch {
        rewrite = null;
      }
    }
    if (!rewrite) {
      rewrite = {
        aiTitle: product.title,
        aiDescription: product.description,
        benefits: [],
        dealLabel: product.rating >= 4.5 ? "Top Rated" : "Nou",
        whyBuy: "",
        warnings: [`Livrare ~${product.deliveryDays} zile`],
      };
    }

    const pricing = calculatePricing(product.price, product.shipping, product.category);

    results.push({
      id: product.sourceProductId,
      source: product.source,
      sourceUrl: product.sourceUrl,
      originalTitle: product.title,
      originalDescription: product.description,
      title: rewrite.aiTitle || product.title,
      description: rewrite.aiDescription || product.description,
      benefits: rewrite.benefits || [],
      dealLabel: rewrite.dealLabel || "Nou",
      whyBuy: rewrite.whyBuy || "",
      warnings: rewrite.warnings || [],
      price: pricing.sellPrice,
      oldPrice: pricing.oldPrice,
      discountPercent: pricing.discountPercent,
      marginPercent: pricing.marginPercent,
      rating: product.rating,
      orders: product.orders,
      deliveryDays: product.deliveryDays,
      images: product.images,
      category: product.category,
      variants: product.variants,
      qualityScore: safety.score,
      gradient: getGradient(product.category),
    });
  }

  const sorted = results.sort((a, b) => b.qualityScore - a.qualityScore);

  // Auto-sync top 6 products to Shopify (with AI descriptions + markup prices)
  // These are customer-ready: Romanian titles, persuasive descriptions, profit margin included
  (async () => {
    for (const p of sorted.slice(0, 6)) {
      try {
        // Build rich HTML description for Shopify storefront
        const htmlDesc = buildShopifyDescription(p);
        
        await ensureProductInShopify({
          id: p.id,
          title: p.title, // AI-rewritten Romanian title
          description: htmlDesc, // Rich HTML with benefits, whyBuy, warnings
          price: p.price, // SELL price (with markup/adaos)
          oldPrice: p.oldPrice, // "Was" price for discount display
          category: p.category || "general",
          images: p.images || [],
        });
        await new Promise(r => setTimeout(r, 600)); // Shopify: max 2 req/sec
      } catch (e: any) {
        console.log(`[Shopify Sync] Skip: ${e.message?.slice(0, 60)}`);
      }
    }
  })();

  return sorted;
}

/**
 * Build rich HTML product description for Shopify storefront
 * Includes: AI description, benefits, whyBuy, delivery info, warnings
 */
function buildShopifyDescription(product: any): string {
  const parts: string[] = [];
  
  // Main description
  if (product.description) {
    parts.push(`<p>${product.description}</p>`);
  }
  
  // Benefits
  if (product.benefits?.length > 0) {
    parts.push(`<h3>De ce să alegi acest produs?</h3>`);
    parts.push(`<ul>${product.benefits.map((b: string) => `<li>${b}</li>`).join("")}</ul>`);
  }
  
  // Why buy
  if (product.whyBuy) {
    parts.push(`<p><strong>💎 ${product.whyBuy}</strong></p>`);
  }
  
  // Delivery info
  parts.push(`<p>🚚 <strong>Livrare:</strong> ${product.deliveryDays || 14} zile lucrătoare în România</p>`);
  parts.push(`<p>🔄 <strong>Retur:</strong> 14 zile garanție de returnare</p>`);
  
  // Discount badge
  if (product.discountPercent > 0) {
    parts.push(`<p>🏷️ <strong>Economisești ${product.discountPercent}%</strong> față de prețul de retail!</p>`);
  }
  
  // Warnings
  if (product.warnings?.length > 0) {
    parts.push(`<p><em>${product.warnings.join(" | ")}</em></p>`);
  }
  
  return parts.join("\n");
}

function getGradient(category: string): string {
  const cat = (category || "").toLowerCase();
  const map: Record<string, string> = {
    tech: "from-violet-500 to-cyan-400",
    auto: "from-amber-400 to-rose-500",
    casa: "from-fuchsia-500 to-blue-500",
    beauty: "from-pink-400 to-purple-500",
    fitness: "from-emerald-400 to-teal-500",
    fashion: "from-rose-400 to-orange-400",
    gadgets: "from-indigo-500 to-purple-400",
    home: "from-fuchsia-500 to-blue-500",
    electronics: "from-violet-500 to-cyan-400",
  };
  for (const [key, value] of Object.entries(map)) {
    if (cat.includes(key)) return value;
  }
  return "from-violet-500 to-cyan-400";
}
