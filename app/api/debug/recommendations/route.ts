import { NextResponse } from "next/server";
import { getShopifyAccessToken } from "@/lib/shopify/auth";
import { recommendComplements, recommendProducts } from "@/lib/shopify/recommendation-rules";
import { getCommerceInsights, type ProductInsight } from "@/lib/shopify/commerce-insights";

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
    throw new Error(`Shopify ${res.status}: ${err.slice(0, 300)}`);
  }

  return res.json();
}

function cleanHtml(html = "") {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function transformProduct(p: ShopifyProduct) {
  const variant = p.variants?.[0] || {};
  const price = Number.parseFloat(variant.price || "0");
  const compareAt = Number.parseFloat(variant.compare_at_price || "0");
  const oldPrice = compareAt > price ? compareAt : price;
  const discountPercent = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;

  return {
    id: String(p.id),
    shopifyId: String(p.id),
    title: p.title,
    description: cleanHtml(p.body_html || ""),
    price,
    oldPrice,
    discountPercent,
    images: (p.images || []).map((img) => img.src).filter(Boolean),
    category: p.product_type || "General",
    vendor: p.vendor || "Swypik",
    tags: p.tags || "",
    handle: p.handle,
    variantId: String(variant.id || ""),
    sku: variant.sku || "",
    status: p.status,
  };
}

function insightKeyMap(insights: ProductInsight[]) {
  const map = new Map<string, ProductInsight>();
  for (const insight of insights) {
    if (insight.productId) map.set(String(insight.productId), insight);
    if (insight.variantId) map.set(String(insight.variantId), insight);
  }
  return map;
}

function enrichProducts(products: ReturnType<typeof transformProduct>[], insights: ProductInsight[] = []) {
  const map = insightKeyMap(insights);
  return products.map((p) => {
    const insight = map.get(p.id) || map.get(p.variantId || "");
    return {
      ...p,
      soldCount: insight?.soldCount || 0,
      abandonedCount: insight?.abandonedCount || 0,
      revenue: insight?.revenue || 0,
      commerceScore: insight?.conversionScore || 0,
      qualityScore: Math.min(10, 7 + Math.min(Math.round((insight?.conversionScore || 0) / 15), 3)),
      orders: insight?.soldCount || 0,
      deliveryDays: 3,
    };
  });
}

function analyzeCatalog(products: ReturnType<typeof transformProduct>[]) {
  const weakProducts = products.map((p) => {
    const issues: string[] = [];
    if (!p.images.length) issues.push("missing_images");
    if (!p.tags || p.tags.trim().length < 3) issues.push("missing_or_weak_tags");
    if (!p.category || p.category === "General") issues.push("missing_product_type");
    if (!p.description || p.description.length < 80) issues.push("weak_description");
    if (!p.variantId) issues.push("missing_variant_id");
    if (!Number.isFinite(p.price) || p.price <= 0) issues.push("bad_price");
    if (/product|produs|item|test/i.test(p.title) && p.title.length < 20) issues.push("weak_title");
    return { id: p.id, title: p.title, category: p.category, price: p.price, issues };
  }).filter((p) => p.issues.length > 0);

  return {
    totalProducts: products.length,
    weakProducts: weakProducts.slice(0, 80),
    issueCounts: weakProducts.reduce<Record<string, number>>((acc, p) => {
      for (const issue of p.issues) acc[issue] = (acc[issue] || 0) + 1;
      return acc;
    }, {}),
  };
}

export async function GET(req: Request) {
  // Block in production unless admin secret is provided
  const adminSecret = req.headers.get("x-admin-secret");
  const requiredSecret = process.env.ADMIN_DEBUG_SECRET;
  if (process.env.NODE_ENV === "production" && (!requiredSecret || adminSecret !== requiredSecret)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = new URL(req.url);
    const q = String(url.searchParams.get("q") || "").trim();
    const maxPrice = url.searchParams.get("maxPrice") ? Number(url.searchParams.get("maxPrice")) : undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") || 12), 30);

    if (!q) {
      return NextResponse.json({ ok: false, error: "Missing q parameter. Example: /api/debug/recommendations?q=rochie" }, { status: 400 });
    }

    const [shopifyData, commerceInsights] = await Promise.all([
      shopifyGET("products.json?limit=250&status=active&fields=id,title,body_html,product_type,vendor,tags,handle,images,variants,status"),
      getCommerceInsights().catch(() => null),
    ]);

    const rawProducts = (shopifyData.products || [])
      .filter((p: ShopifyProduct) => p.status === "active")
      .map(transformProduct);

    const products = enrichProducts(rawProducts, commerceInsights?.productInsights || []);
    const recommendations = recommendProducts(products, q, { maxPrice, limit, debug: true });
    const complements = recommendComplements(products, recommendations.products as any[], q, { maxPrice, limit: 10, debug: true });
    const catalog = analyzeCatalog(rawProducts);

    return NextResponse.json({
      ok: true,
      query: q,
      maxPrice: maxPrice || null,
      recommendationIntent: recommendations.intent,
      recommendations: recommendations.products,
      recommendationDebug: recommendations.debug,
      complements: complements.products,
      complementDebug: complements.debug,
      catalogHealth: catalog,
      insightSummary: commerceInsights?.totals || null,
      guidance: {
        ifResultsAreBad: [
          "Verifică product_type în Shopify pentru produsele greșite.",
          "Adaugă tags clare: fashion, beauty, cadou, rochie, geanta, tech etc.",
          "Descrierile sub 80 caractere sunt prea slabe pentru AI/recommendation ranking.",
          "Produsele fără imagini sunt penalizate puternic.",
          "Folosește tags de date reale dacă ai: rating:4.8, orders:120, delivery:3.",
        ],
      },
    });
  } catch (error: any) {
    console.error("[Recommendation Debug]", error);
    return NextResponse.json({ ok: false, error: "Eroare internă." }, { status: 500 });
  }
}
