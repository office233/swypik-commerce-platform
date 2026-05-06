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
  variants?: {
    id?: number | string;
    price?: string;
    compare_at_price?: string | null;
    sku?: string;
  }[];
  status?: string;
};

function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 300);
}

function extractBenefits(html: string): string[] {
  const benefits: string[] = [];
  const liMatches = html.match(/<li[^>]*>(.*?)<\/li>/gi) || [];

  for (const li of liMatches.slice(0, 4)) {
    const text = li.replace(/<[^>]*>/g, "").trim();
    if (text.length > 5 && text.length < 100) benefits.push(text);
  }

  if (benefits.length === 0) {
    benefits.push("Produs disponibil direct din magazin");
    benefits.push("Preț și stoc gestionate în Shopify");
    benefits.push("Checkout securizat prin Shopify");
  }

  return benefits;
}

function transformProduct(p: ShopifyProduct) {
  const variant = p.variants?.[0] || {};
  const price = Number.parseFloat(variant.price || "0");
  const compareAt = Number.parseFloat(variant.compare_at_price || "0");
  const oldPrice = compareAt > price ? compareAt : Math.round(price * 1.35);
  const discountPercent = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;

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
    rating: 4.8,
    orders: 0,
    deliveryDays: 3,
    images: (p.images || []).map((img) => img.src).filter(Boolean),
    category: p.product_type || "General",
    gradient: "from-violet-500 to-cyan-400",
    qualityScore: 9,
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

  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify ${res.status}: ${err.slice(0, 200)}`);
  }

  return res.json();
}

async function searchShopifyProducts(query: string, limit = 50) {
  const data = await shopifyGET(
    `products.json?limit=${limit}&status=active&fields=id,title,body_html,product_type,vendor,tags,handle,images,variants,status`
  );

  const q = query.toLowerCase().trim();
  const terms = q.split(/\s+/).filter(Boolean);

  return (data.products || [])
    .filter((p: ShopifyProduct) => p.status === "active")
    .map(transformProduct)
    .filter((p: ReturnType<typeof transformProduct>) => {
      const haystack = `${p.title} ${p.description} ${p.category} ${p.vendor} ${p.sku}`.toLowerCase();
      return terms.length === 0 || terms.some((term) => haystack.includes(term));
    })
    .sort((a: ReturnType<typeof transformProduct>, b: ReturnType<typeof transformProduct>) => {
      if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
      return a.price - b.price;
    })
    .slice(0, 20);
}

export async function POST(req: Request) {
  try {
    const { message, sessionId, directCjQuery, chatHistory = [] } = await req.json();
    const userMessage = String(message || "").trim();

    if (!userMessage) {
      return NextResponse.json({ error: "Mesajul nu poate fi gol" }, { status: 400 });
    }

    const directQuery = String(directCjQuery || "").trim();

    if (directQuery) {
      const products = await searchShopifyProducts(directQuery);

      return NextResponse.json({
        intent: "search_product",
        reply: products.length > 0
          ? `Am găsit ${products.length} produse în magazin pentru tine. 🎯`
          : "Nu am găsit produse în Shopify pentru această categorie. Încearcă altă căutare.",
        products,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    const aiResult = await orchestrate(userMessage, chatHistory);

    if (aiResult.intent === "search_product" || aiResult.intent === "find_cheaper") {
      const query = aiResult.searchQuery || userMessage;
      const products = await searchShopifyProducts(query);

      return NextResponse.json({
        intent: aiResult.intent,
        reply: products.length > 0
          ? `Am găsit ${products.length} produse în magazin care se potrivesc. Le-am luat direct din Shopify.`
          : "Nu am găsit produse relevante în Shopify. Încearcă o căutare mai specifică.",
        products,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    return NextResponse.json({
      intent: aiResult.intent,
      reply: aiResult.reply,
      products: [],
      sessionId: sessionId || crypto.randomUUID(),
    });
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      { error: "Nu am putut căuta produsele în Shopify. Încearcă din nou." },
      { status: 500 }
    );
  }
}
