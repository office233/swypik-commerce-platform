import { NextResponse } from "next/server";
import { getShopifyAccessToken } from "@/lib/shopify/auth";
import { buildSuggestions } from "@/lib/shopify/product-search";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 3 * 60 * 1000;

async function shopifyGET(endpoint: string, token: string) {
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

function transformProduct(p: any) {
  const variant = p.variants?.[0] || {};
  return {
    id: String(p.id),
    title: p.title,
    description: String(p.body_html || "").replace(/<[^>]*>/g, " "),
    price: Number(variant.price || 0),
    category: p.product_type || "General",
    vendor: p.vendor || "AICeVrei",
    sku: variant.sku || "",
    tags: p.tags || "",
    handle: p.handle,
    images: (p.images || []).map((img: any) => img.src).filter(Boolean),
    variantId: String(variant.id || ""),
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = String(url.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 8), 12);

    if (q.length < 2) return NextResponse.json({ ok: true, suggestions: [] });

    const cacheKey = `suggest_${q}_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return NextResponse.json(cached.data);

    const token = await getShopifyAccessToken();
    const data = await shopifyGET("products.json?limit=250&status=active&fields=id,title,body_html,product_type,vendor,tags,handle,images,variants,status", token);
    const products = (data.products || []).filter((p: any) => p.status === "active").map(transformProduct);
    const suggestions = buildSuggestions(products, q, limit);

    const result = { ok: true, q, suggestions };
    cache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Search Suggest]", error.message);
    return NextResponse.json({ ok: false, error: error.message, suggestions: [] }, { status: 500 });
  }
}
