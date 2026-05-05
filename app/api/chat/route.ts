/**
 * Chat API — Main endpoint
 * AI translates to English → CJ API searches → AI rewrites to Romanian
 */

import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/ai/orchestrator";
import { rewriteProduct } from "@/lib/ai/rewriter";
import { safetyCheck } from "@/lib/ai/safety-filter";
import { calculatePricing } from "@/lib/pricing";
import { cjSearch } from "@/lib/suppliers/cj-supplier";
import { mockSearch } from "@/lib/suppliers/mock-supplier";
import type { SupplierProduct } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { message, sessionId, chatHistory = [] } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "Mesajul nu poate fi gol" }, { status: 400 });
    }

    // Step 1: AI Orchestrator — detects intent + translates searchQuery to English
    const aiResult = await orchestrate(message, chatHistory);

    // Step 2: If search intent, find products
    if (aiResult.intent === "search_product" || aiResult.intent === "find_cheaper") {
      // AI already translated to English for CJ API
      const enQuery = aiResult.searchQuery || message;
      console.log(`[Chat] User: "${message}" → CJ search: "${enQuery}"`);

      // Try CJ Dropshipping (real products)
      let supplierProducts: SupplierProduct[] = [];

      if (process.env.CJ_API_KEY) {
        supplierProducts = await cjSearch(enQuery, 1, 20);
        if (supplierProducts.length > 0) {
          console.log(`[Chat] ✅ CJ: ${supplierProducts.length} real products`);
        }
      }

      // Fallback to mock if CJ empty
      if (supplierProducts.length === 0) {
        console.log("[Chat] ⚠️ CJ empty → mock fallback");
        supplierProducts = mockSearch(message);
      }

      // Process: filter → rewrite → price
      const processedProducts = await processProducts(supplierProducts);

      return NextResponse.json({
        intent: aiResult.intent,
        reply: processedProducts.length > 0
          ? aiResult.reply || `Am găsit ${processedProducts.length} produse pentru tine! 🎯`
          : "Nu am găsit produse relevante. Încearcă altceva!",
        products: processedProducts,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    // Step 3: Other intents
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

async function processProducts(products: SupplierProduct[]) {
  const results = [];

  for (const product of products.slice(0, 8)) {
    const safety = safetyCheck(product);
    if (!safety.passed) {
      console.log(`[Filter] Blocked: ${product.title.slice(0, 40)} — ${safety.reason}`);
      continue;
    }

    // AI rewrite to Romanian
    const rewrite = await rewriteProduct({
      title: product.title,
      description: product.description,
      price: product.price,
      rating: product.rating,
      orders: product.orders,
      category: product.category,
      deliveryDays: product.deliveryDays,
    });

    // Calculate pricing with markup + TVA 21%
    const pricing = calculatePricing(product.price, product.shipping, product.category);

    results.push({
      id: product.sourceProductId,
      source: product.source,
      sourceUrl: product.sourceUrl,
      originalTitle: product.title,
      originalDescription: product.description,
      title: rewrite.aiTitle,
      description: rewrite.aiDescription,
      benefits: rewrite.benefits,
      dealLabel: rewrite.dealLabel,
      whyBuy: rewrite.whyBuy,
      warnings: rewrite.warnings,
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

  return results.sort((a, b) => b.qualityScore - a.qualityScore);
}

function getGradient(category: string): string {
  const cat = (category || "").toLowerCase();
  const gradients: Record<string, string> = {
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

  // Match partial category names
  for (const [key, value] of Object.entries(gradients)) {
    if (cat.includes(key)) return value;
  }
  return "from-violet-500 to-cyan-400";
}
