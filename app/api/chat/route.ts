/**
 * Chat API — Main endpoint
 * Handles AI chat, product search, and cart operations
 */

import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/ai/orchestrator";
import { rewriteProduct } from "@/lib/ai/rewriter";
import { safetyCheck } from "@/lib/ai/safety-filter";
import { calculatePricing } from "@/lib/pricing";
import { mockSearch } from "@/lib/suppliers/mock-supplier";
import type { SupplierProduct } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { message, sessionId, chatHistory = [] } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "Mesajul nu poate fi gol" }, { status: 400 });
    }

    // Step 1: AI Orchestrator detects intent
    const aiResult = await orchestrate(message, chatHistory);

    // Step 2: If search intent, find and process products
    if (aiResult.intent === "search_product" || aiResult.intent === "find_cheaper") {
      const query = aiResult.searchQuery || message;

      // Search supplier
      const supplierProducts = mockSearch(query);

      // Filter, score, rewrite, and price products
      const processedProducts = await processProducts(supplierProducts);

      return NextResponse.json({
        intent: aiResult.intent,
        reply: processedProducts.length > 0
          ? `Am găsit ${processedProducts.length} produse bune pentru tine! 🎯`
          : "Nu am găsit produse care să treacă filtrul de calitate. Încearcă altceva!",
        products: processedProducts,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    // Step 3: Other intents — return AI reply only
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

  for (const product of products.slice(0, 6)) {
    // Safety check
    const safety = safetyCheck(product);
    if (!safety.passed) {
      console.log(`[Filter] Blocked: ${product.title} — ${safety.reason}`);
      continue;
    }

    // Rewrite with AI
    const rewrite = await rewriteProduct({
      title: product.title,
      description: product.description,
      price: product.price,
      rating: product.rating,
      orders: product.orders,
      category: product.category,
      deliveryDays: product.deliveryDays,
    });

    // Calculate pricing
    const pricing = calculatePricing(product.price, product.shipping, product.category);

    results.push({
      id: product.sourceProductId,
      source: product.source,
      sourceUrl: product.sourceUrl,
      // Original data
      originalTitle: product.title,
      originalDescription: product.description,
      // AI rewritten
      title: rewrite.aiTitle,
      description: rewrite.aiDescription,
      benefits: rewrite.benefits,
      dealLabel: rewrite.dealLabel,
      whyBuy: rewrite.whyBuy,
      warnings: rewrite.warnings,
      // Pricing
      price: pricing.sellPrice,
      oldPrice: pricing.oldPrice,
      discountPercent: pricing.discountPercent,
      marginPercent: pricing.marginPercent,
      // Product info
      rating: product.rating,
      orders: product.orders,
      deliveryDays: product.deliveryDays,
      images: product.images,
      category: product.category,
      variants: product.variants,
      // Quality
      qualityScore: safety.score,
      // Gradient for UI
      gradient: getGradient(product.category),
    });
  }

  return results.sort((a, b) => b.qualityScore - a.qualityScore);
}

function getGradient(category: string): string {
  const gradients: Record<string, string> = {
    tech: "from-violet-500 to-cyan-400",
    auto: "from-amber-400 to-rose-500",
    casa: "from-fuchsia-500 to-blue-500",
    beauty: "from-pink-400 to-purple-500",
    fitness: "from-emerald-400 to-teal-500",
    fashion: "from-rose-400 to-orange-400",
    gadgets: "from-indigo-500 to-purple-400",
  };
  return gradients[category] || "from-violet-500 to-cyan-400";
}
