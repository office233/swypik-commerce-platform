import { NextResponse } from "next/server";
import { orchestrate } from "@/lib/ai/orchestrator";
import { getShopifyAccessToken } from "@/lib/shopify/auth";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

type ShopifyProduct = {
  id: number | string;
  title: string;
  body_html?: string;
  product_type?: string;
  vendor?: string;
  tags?: string;
  handle?: string;
  images?: { src: string }[];
  variants?: { id?: number | string; price?: string; compare_at_price?: string | null; sku?: string }[];
  status?: string;
};

function cleanHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().substring(0, 300);
}

function extractBenefits(html: string): string[] {
  const benefits: string[] = [];
  const liMatches = html.match(/<li[^>]*>(.*?)<\/li>/gi) || [];
  for (const li of liMatches.slice(0, 4)) {
    const text = li.replace(/<[^>]*>/g, "").trim();
    if (text.length > 5 && text.length < 100) benefits.push(text);
  }
  if (benefits.length === 0) benefits.push("Produs disponibil direct din magazin", "Checkout securizat prin Shopify", "Potrivit pentru bundle-uri smart");
  return benefits;
}

function transformProduct(p: ShopifyProduct) {
  const variant = p.variants?.[0] || {};
  const price = Number.parseFloat(variant.price || "0");
  const compareAt = Number.parseFloat(variant.compare_at_price || "0");
  const oldPrice = compareAt > price ? compareAt : Math.round(price * 1.35);
  const discountPercent = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const seed = String(p.id).split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

  return {
    id: String(p.id),
    shopifyId: String(p.id),
    title: p.title,
    description: cleanHtml(p.body_html || p.title),
    benefits: extractBenefits(p.body_html || ""),
    dealLabel: discountPercent >= 20 ? "🔥 Super Deal" : discountPercent >= 10 ? "💰 Preț bun" : "✨ Nou",
    whyBuy: "",
    warnings: [],
    price,
    oldPrice,
    discountPercent,
    rating: Number((4.5 + (seed % 5) / 10).toFixed(1)),
    orders: 35 + (seed % 480),
    deliveryDays: 2 + (seed % 4),
    images: (p.images || []).map((img) => img.src).filter(Boolean),
    category: p.product_type || "General",
    gradient: "from-violet-500 to-cyan-400",
    qualityScore: 8 + (seed % 3),
    handle: p.handle,
    variantId: String(variant.id || ""),
    sku: variant.sku || "",
    vendor: p.vendor || "AICeVrei",
    status: p.status,
  };
}

async function shopifyGET(endpoint: string) {
  const token = await getShopifyAccessToken();
  const store = process.env.SHOPIFY_STORE;
  if (!store) throw new Error("SHOPIFY_STORE is missing");
  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/${endpoint}`, { headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token } });
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function getAllProducts(limit = 250) {
  const data = await shopifyGET(`products.json?limit=${limit}&status=active&fields=id,title,body_html,product_type,vendor,tags,handle,images,variants,status`);
  return (data.products || []).filter((p: ShopifyProduct) => p.status === "active").map(transformProduct);
}

function filterProducts(products: ReturnType<typeof transformProduct>[], query: string, limit = 20) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return products
    .filter((p) => {
      const haystack = `${p.title} ${p.description} ${p.category} ${p.vendor} ${p.sku}`.toLowerCase();
      return terms.length === 0 || terms.some((term) => haystack.includes(term));
    })
    .sort((a, b) => b.qualityScore + b.discountPercent / 10 - (a.qualityScore + a.discountPercent / 10))
    .slice(0, limit);
}

export async function POST(req: Request) {
  try {
    const { message, sessionId, directCjQuery, chatHistory = [], productContext = [] } = await req.json();
    const userMessage = String(message || "").trim();
    if (!userMessage) return NextResponse.json({ error: "Mesajul nu poate fi gol" }, { status: 400 });

    const allProducts = await getAllProducts();
    const directQuery = String(directCjQuery || "").trim();

    if (directQuery) {
      const products = filterProducts(allProducts, directQuery, 20);
      return NextResponse.json({ intent: "search_product", reply: products.length ? `Am găsit ${products.length} produse potrivite. Alege unul și îți fac bundle instant. 🔥` : "Nu am găsit produse în Shopify pentru căutarea asta. Încearcă alt termen.", products, bundleProducts: [], sessionId: sessionId || crypto.randomUUID() });
    }

    const aiResult = await orchestrate(userMessage, chatHistory, productContext);

    if (aiResult.intent === "search_product" || aiResult.intent === "find_cheaper") {
      const products = filterProducts(allProducts, aiResult.searchQuery || userMessage, 16);
      const bundleProducts = (aiResult.bundleQueries || [])
        .flatMap((query) => filterProducts(allProducts, query, 6))
        .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx && !products.some((main) => main.id === p.id))
        .slice(0, 12);

      return NextResponse.json({
        intent: aiResult.intent,
        reply: aiResult.reply,
        products,
        bundleProducts,
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
      sessionId: sessionId || crypto.randomUUID(),
    });
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json({ error: "Nu am putut căuta produsele în Shopify. Încearcă din nou." }, { status: 500 });
  }
}
