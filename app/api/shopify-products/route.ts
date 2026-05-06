/**
 * Shopify Products API — Serves products directly from Shopify
 * Supports: all products, by collection, search, random feed
 */

import { NextResponse } from "next/server";
import { getShopifyAccessToken } from "@/lib/shopify/auth";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 3 * 60 * 1000;

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() });
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function seededRange(seed: number, min: number, max: number): number {
  return min + (seed % (max - min + 1));
}

function tagNumber(tags: string, name: string): number | null {
  const match = tags.match(new RegExp(`${name}:([0-9]+(?:\\.[0-9]+)?)`, "i"));
  return match ? Number(match[1]) : null;
}

function buildSocialProof(p: any, price: number, discount: number) {
  const tags = String(p.tags || "").toLowerCase();
  const seed = hashString(`${p.id}:${p.title}:${p.handle || ""}`);
  const isBestSeller = tags.includes("best-seller") || tags.includes("bestseller");
  const isTopRated = tags.includes("top-rated") || tags.includes("toprated");
  const isNew = tags.includes("new") || tags.includes("nou");

  const taggedRating = tagNumber(tags, "rating");
  const taggedOrders = tagNumber(tags, "orders");
  const taggedDelivery = tagNumber(tags, "delivery");

  const baseOrders = seededRange(seed, 38, 420);
  const priceBoost = price < 80 ? 90 : price < 180 ? 55 : 20;
  const discountBoost = discount >= 30 ? 90 : discount >= 15 ? 45 : 0;
  const bestSellerBoost = isBestSeller ? 350 : 0;
  const newPenalty = isNew ? -35 : 0;

  const orders = Math.max(12, Math.round(taggedOrders ?? (baseOrders + priceBoost + discountBoost + bestSellerBoost + newPenalty)));
  const ratingRaw = taggedRating ?? (4.45 + ((seed % 45) / 100) + (isTopRated ? 0.12 : 0));
  const rating = Math.min(5, Math.max(4.3, Number(ratingRaw.toFixed(1))));
  const deliveryDays = Math.round(taggedDelivery ?? seededRange(seed >> 3, 2, 5));
  const viewers = seededRange(seed >> 5, 7, 31) + (isBestSeller ? 8 : 0) + (discount >= 20 ? 5 : 0);
  const cartAdds = Math.max(3, Math.round(orders * (0.12 + ((seed % 8) / 100))));
  const likes = Math.max(18, Math.round(orders * (0.7 + ((seed % 35) / 100))));
  const commentCount = seededRange(seed >> 7, 4, 18);
  const qualityScore = Math.min(10, Math.max(7, Math.round(rating * 2 + (orders > 300 ? 1 : 0))));

  return {
    rating,
    orders,
    deliveryDays,
    viewers,
    cartAdds,
    likes,
    commentCount,
    qualityScore,
    socialProofLabel: orders > 300 ? `${orders}+ comenzi recente` : `${cartAdds} adăugări în coș recent`,
  };
}

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
    benefits.push("Produs selectat din magazin");
    benefits.push("Checkout securizat prin Shopify");
    benefits.push("Livrare rapidă în România");
  }

  return benefits;
}

function transformProduct(p: any) {
  const variant = p.variants?.[0] || {};
  const price = parseFloat(variant.price || "0");
  const compareAt = parseFloat(variant.compare_at_price || "0");
  const oldPrice = compareAt > price ? compareAt : Math.round(price * 1.35);
  const discount = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const social = buildSocialProof(p, price, discount);

  return {
    id: String(p.id),
    shopifyId: String(p.id),
    title: p.title,
    description: cleanHtml(p.body_html || p.title),
    benefits: extractBenefits(p.body_html || ""),
    dealLabel: discount >= 20 ? "🔥 Super Deal" : discount >= 10 ? "💰 Preț bun" : "✨ Nou",
    whyBuy: "",
    warnings: [],
    price,
    oldPrice,
    discountPercent: discount,
    rating: social.rating,
    orders: social.orders,
    deliveryDays: social.deliveryDays,
    viewers: social.viewers,
    cartAdds: social.cartAdds,
    likes: social.likes,
    commentCount: social.commentCount,
    socialProofLabel: social.socialProofLabel,
    images: (p.images || []).map((img: any) => img.src).filter(Boolean),
    category: p.product_type || "General",
    gradient: "from-violet-500 to-cyan-400",
    qualityScore: social.qualityScore,
    handle: p.handle,
    variantId: String(variant.id || ""),
    sku: variant.sku || "",
    vendor: p.vendor || "AICeVrei",
    status: p.status,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const collectionId = url.searchParams.get("collection");
    const search = url.searchParams.get("search");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 250);
    const page = url.searchParams.get("page_info") || "";
    const mode = url.searchParams.get("mode") || "default";

    const cacheKey = `products_${collectionId || "all"}_${search || ""}_${limit}_${page}_${mode}`;
    const cached = getCached(cacheKey);
    if (cached) return NextResponse.json(cached);

    const token = await getShopifyAccessToken();
    let endpoint = `products.json?limit=${limit}&status=active&fields=id,title,body_html,product_type,vendor,tags,handle,images,variants,status`;

    if (collectionId) endpoint += `&collection_id=${collectionId}`;
    if (page) endpoint = `products.json?limit=${limit}&page_info=${page}`;

    const data = await shopifyGET(endpoint, token);
    let products = (data.products || [])
      .filter((p: any) => p.status === "active")
      .map(transformProduct);

    if (search) {
      const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
      products = products.filter((p: any) => {
        const haystack = `${p.title} ${p.description} ${p.category} ${p.vendor} ${p.sku}`.toLowerCase();
        return terms.some((term) => haystack.includes(term));
      });
    }

    if (mode === "feed") {
      products = products.sort((a: any, b: any) => b.viewers + b.cartAdds - (a.viewers + a.cartAdds));
    } else if (mode === "trending") {
      products = products.sort((a: any, b: any) => b.qualityScore + b.orders / 100 - (a.qualityScore + a.orders / 100));
    } else {
      products = products.sort((a: any, b: any) => a.price - b.price);
    }

    const result = {
      products,
      total: products.length,
      nextPage: null,
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Products API]", error.message);
    return NextResponse.json(
      { error: "Failed to fetch products", products: [], total: 0 },
      { status: 500 }
    );
  }
}
