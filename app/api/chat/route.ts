/**
 * Chat API v3 — PostgreSQL-first with AI category awareness
 * 
 * REFACTORED: Logic extracted into:
 *   - lib/chat/category-detect.ts (CATEGORY_MAP, detectCategory)
 *   - lib/chat/search-pg.ts (searchPG, searchWithFallback, fetchBundles)
 * 
 * Flow: User message → AI extracts intent + query + category → PostgreSQL search → Bundle
 * NO MORE SHOPIFY API for product search — 108k products from PostgreSQL
 */

import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/ai/orchestrator";
import { updateShoppingSession } from "@/lib/sales/shopping-session";
import { detectCategory, looksLikeShopping } from "@/lib/chat/category-detect";
import { searchPG, searchWithFallback, fetchBundles, buildBundleSuggestionText, uniqueProducts } from "@/lib/chat/search-pg";
import { inferBundleQueries, buildSalesSuggestion } from "@/lib/sales/bundle-engine";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

export const runtime = "edge";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { message, sessionId, directCjQuery, chatHistory = [], productContext = [], shoppingSession: incomingSession = {} } = await req.json();
    const userMessage = String(message || "").trim();
    if (!userMessage) return NextResponse.json({ error: "Mesajul nu poate fi gol" }, { status: 400 });

    // Distributed rate limit
    const ip = getClientIP(req);
    const { success: allowed } = await rateLimit("chat", ip);
    if (!allowed) {
      return NextResponse.json({ error: "Prea multe mesaje. Încearcă din nou în câteva secunde." }, { status: 429 });
    }

    const baseSession = updateShoppingSession(incomingSession, userMessage);
    const directQuery = String(directCjQuery || "").trim();

    // ─── Direct query (from search bar) ────────────────────────────
    if (directQuery) {
      const category = detectCategory(directQuery);
      const products = await searchPG(directQuery, 20, { maxPrice: baseSession.budget, category });

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

    // ─── AI orchestration ─────────────────────────────────────────
    const aiResult = await orchestrate(userMessage, chatHistory, productContext, baseSession);
    const shoppingSession = updateShoppingSession(baseSession, userMessage, aiResult.intent);

    // Compare intent — no new search needed
    if (aiResult.intent === "compare_products") {
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

    // ─── Search intents ──────────────────────────────────────────
    if (aiResult.intent === "search_product" || aiResult.intent === "find_cheaper" || aiResult.intent === "refine_search") {
      const query = aiResult.searchQuery || userMessage;
      const category = aiResult.category || detectCategory(query) || detectCategory(userMessage);
      const explicitMax = userMessage.match(/(?:sub|maxim|pana la)\s*(\d{2,5})/i)?.[1];
      const maxPrice = aiResult.maxPrice || (explicitMax ? Number(explicitMax) : undefined) || (shoppingSession.priceSensitivity === "high" ? shoppingSession.budget : undefined);

      const excludeIds = aiResult.intent === "refine_search"
        ? (aiResult.excludeIds || productContext.map((p: any) => String(p.id)))
        : undefined;

      // Safe-filter excludeIds
      const safeExcludeIds = excludeIds
        ?.map(Number)
        .filter(Number.isInteger)
        .filter((n: number) => n > 0)
        .slice(0, 100)
        .map(String);

      const { products, replyPrefix } = await searchWithFallback(query, {
        maxPrice,
        category,
        sort: aiResult.sort,
        excludeIds: safeExcludeIds,
        userMessage,
      });

      const bundleProducts = await fetchBundles(products, query, aiResult.bundleQueries || [], { maxPrice, category });
      const suggestion = buildBundleSuggestionText(products, bundleProducts);

      return NextResponse.json({
        intent: aiResult.intent,
        reply: `${replyPrefix}${aiResult.reply}${suggestion}`,
        products,
        bundleProducts,
        shoppingSession,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    // ─── Non-search intents — check if it still looks like shopping ──
    if (looksLikeShopping(userMessage) && aiResult.intent !== "checkout" && aiResult.intent !== "track_order") {
      const query = aiResult.searchQuery || userMessage;
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

    // ─── Pure chat (no products) ──────────────────────────────────
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
      { error: "A apărut o eroare. Încearcă din nou." },
      { status: 500 }
    );
  }
}
