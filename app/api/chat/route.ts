import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/ai/orchestrator";
import { getShopifyAccessToken } from "@/lib/shopify/auth";
import { buildSalesSuggestion, inferBundleQueries, pickBundleProducts, rankProducts } from "@/lib/sales/bundle-engine";
import { updateShoppingSession } from "@/lib/sales/shopping-session";
import { getCommerceInsights, type ProductInsight } from "@/lib/shopify/commerce-insights";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

type ShopifyProduct = { id: number | string; title: string; body_html?: string; product_type?: string; vendor?: string; tags?: string; handle?: string; images?: { src: string }[]; variants?: { id?: number | string; price?: string; compare_at_price?: string | null; sku?: string }[]; status?: string };
function cleanHtml(html: string): string { return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().substring(0, 300); }
function extractBenefits(html: string): string[] { const benefits: string[] = []; const liMatches = html.match(/<li[^>]*>(.*?)<\/li>/gi) || []; for (const li of liMatches.slice(0, 4)) { const text = li.replace(/<[^>]*>/g, "").trim(); if (text.length > 5 && text.length < 100) benefits.push(text); } if (benefits.length === 0) benefits.push("Produs disponibil direct din magazin", "Checkout securizat prin Shopify", "Potrivit pentru bundle-uri smart"); return benefits; }
function transformProduct(p: ShopifyProduct) { const variant = p.variants?.[0] || {}; const price = Number.parseFloat(variant.price || "0"); const compareAt = Number.parseFloat(variant.compare_at_price || "0"); const oldPrice = compareAt > price ? compareAt : Math.round(price * 1.35); const discountPercent = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0; const seed = String(p.id).split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0); return { id: String(p.id), shopifyId: String(p.id), title: p.title, description: cleanHtml(p.body_html || p.title), benefits: extractBenefits(p.body_html || ""), dealLabel: discountPercent >= 20 ? "🔥 Super Deal" : discountPercent >= 10 ? "💰 Preț bun" : "✨ Nou", whyBuy: "", warnings: [], price, oldPrice, discountPercent, rating: Number((4.5 + (seed % 5) / 10).toFixed(1)), orders: 35 + (seed % 480), deliveryDays: 2 + (seed % 4), images: (p.images || []).map((img) => img.src).filter(Boolean), category: p.product_type || "General", gradient: "from-violet-500 to-cyan-400", qualityScore: 8 + (seed % 3), handle: p.handle, variantId: String(variant.id || ""), sku: variant.sku || "", vendor: p.vendor || "AICeVrei", status: p.status }; }
type ProductModel = ReturnType<typeof transformProduct> & { commerceBadge?: string; commerceScore?: number; soldCount?: number; abandonedCount?: number; revenue?: number };
async function shopifyGET(endpoint: string) { const token = await getShopifyAccessToken(); const store = process.env.SHOPIFY_STORE; if (!store) throw new Error("SHOPIFY_STORE is missing"); const res = await fetch(`https://${store}/admin/api/${API_VERSION}/${endpoint}`, { headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token } }); if (!res.ok) throw new Error(`Shopify ${res.status}: ${(await res.text()).slice(0, 200)}`); return res.json(); }
async function getAllProducts(limit = 250) { const data = await shopifyGET(`products.json?limit=${limit}&status=active&fields=id,title,body_html,product_type,vendor,tags,handle,images,variants,status`); return (data.products || []).filter((p: ShopifyProduct) => p.status === "active").map(transformProduct); }
function insightKeyMap(insights: ProductInsight[]) { const map = new Map<string, ProductInsight>(); for (const insight of insights) { if (insight.productId) map.set(String(insight.productId), insight); if (insight.variantId) map.set(String(insight.variantId), insight); } return map; }
function enrichProducts(products: ReturnType<typeof transformProduct>[], insights: ProductInsight[] = []): ProductModel[] { const map = insightKeyMap(insights); return products.map((p) => { const insight = map.get(p.id) || map.get(p.variantId || ""); const commerceScore = insight?.conversionScore || 0; const commerceBadge = insight ? insight.soldCount >= 5 ? "🔥 Se vinde bine" : insight.cartCount >= 3 ? "🛒 Des adăugat în coș" : insight.abandonedCount >= 3 ? "👀 Foarte comparat" : insight.conversionScore > 0 ? "⚡ Alegere sigură" : undefined : undefined; return { ...p, commerceBadge, commerceScore, soldCount: insight?.soldCount, abandonedCount: insight?.abandonedCount, revenue: insight?.revenue, qualityScore: p.qualityScore + Math.min(Math.round(commerceScore / 10), 5) }; }); }
function filterProducts(products: ProductModel[], query: string, limit = 20, opts: { maxPrice?: number; sort?: string } = {}) { const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean); let result = rankProducts(products.filter((p) => { const haystack = `${p.title} ${p.description} ${p.category} ${p.vendor} ${p.sku}`.toLowerCase(); const matches = terms.length === 0 || terms.some((term) => haystack.includes(term)); const priceOk = opts.maxPrice == null || p.price <= opts.maxPrice; return matches && priceOk; })); if (opts.sort === "price_asc") result = result.sort((a, b) => a.price - b.price || (b.commerceScore || 0) - (a.commerceScore || 0)); else result = result.sort((a, b) => (b.commerceScore || 0) - (a.commerceScore || 0) || b.qualityScore - a.qualityScore); return result.slice(0, limit); }
function uniqueProducts(products: ProductModel[]) { return products.filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx); }
function buildBundleProducts(mainProducts: ProductModel[], allProducts: ProductModel[], bundleQueries: string[], maxPrice?: number) { const queryBased = bundleQueries.flatMap((query) => filterProducts(allProducts, query, 6, { maxPrice })); const engineBased = mainProducts.slice(0, 3).flatMap((product) => pickBundleProducts(product, allProducts, 6)); return uniqueProducts([...engineBased, ...queryBased]).filter((p) => !mainProducts.some((main) => main.id === p.id)).filter((p) => maxPrice == null || p.price <= maxPrice).slice(0, 12); }

export async function POST(req: Request) {
  try {
    const { message, sessionId, directCjQuery, chatHistory = [], productContext = [], shoppingSession: incomingSession = {} } = await req.json();
    const userMessage = String(message || "").trim();
    if (!userMessage) return NextResponse.json({ error: "Mesajul nu poate fi gol" }, { status: 400 });
    const [rawProducts, commerceInsights] = await Promise.all([getAllProducts(), getCommerceInsights().catch(() => null)]);
    const allProducts = enrichProducts(rawProducts, commerceInsights?.productInsights || []);
    const directQuery = String(directCjQuery || "").trim();
    const baseSession = updateShoppingSession(incomingSession, userMessage);

    if (directQuery) {
      const products = filterProducts(allProducts, directQuery, 20, { maxPrice: baseSession.budget });
      const bundleProducts = buildBundleProducts(products, allProducts, inferBundleQueries(directQuery), baseSession.priceSensitivity === "high" ? baseSession.budget : undefined);
      const suggestion = products[0] ? ` ${buildSalesSuggestion(products[0], bundleProducts.slice(0, 2))}` : "";
      return NextResponse.json({ intent: "search_product", reply: products.length ? `Am găsit ${products.length} produse potrivite. Alege unul și îți fac bundle instant. 🔥${suggestion}` : "Nu am găsit produse în Shopify pentru căutarea asta. Încearcă alt termen.", products, bundleProducts, shoppingSession: baseSession, sessionId: sessionId || crypto.randomUUID() });
    }

    const aiResult = await orchestrate(userMessage, chatHistory, productContext, baseSession);
    const shoppingSession = updateShoppingSession(baseSession, userMessage, aiResult.intent);

    if (aiResult.intent === "search_product" || aiResult.intent === "find_cheaper") {
      const query = aiResult.searchQuery || userMessage;
      const maxPrice = aiResult.maxPrice || (shoppingSession.priceSensitivity === "high" ? shoppingSession.budget : undefined);
      const products = filterProducts(allProducts, query, 16, { maxPrice, sort: aiResult.sort });
      const bundleQueries = [...(aiResult.bundleQueries || []), ...inferBundleQueries(query)];
      const bundleProducts = buildBundleProducts(products, allProducts, bundleQueries, maxPrice);
      const suggestion = products[0] ? `\n\n${buildSalesSuggestion(products[0], bundleProducts.slice(0, 2))}` : "";
      return NextResponse.json({ intent: aiResult.intent, reply: `${aiResult.reply}${suggestion}`, products, bundleProducts, shoppingSession, insightSummary: commerceInsights?.totals, sessionId: sessionId || crypto.randomUUID() });
    }

    return NextResponse.json({ intent: aiResult.intent, reply: aiResult.reply, products: [], bundleProducts: [], productId: aiResult.productId, productTitle: aiResult.productTitle, shoppingSession, insightSummary: commerceInsights?.totals, sessionId: sessionId || crypto.randomUUID() });
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json({ error: "Nu am putut căuta produsele în Shopify. Încearcă din nou." }, { status: 500 });
  }
}
