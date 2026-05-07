/**
 * Products API v2 — Hybrid: PostgreSQL (local/cloud) with Shopify fallback
 * 
 * Priority: PostgreSQL (108k+ products) → Shopify fallback (if DB unavailable)
 * Zero Shopify rate limits when using PostgreSQL
 */

import { NextResponse } from "next/server";
import { getShopifyAccessToken } from "@/lib/shopify/auth";

export const dynamic = "force-dynamic";

// ─── Shopify Fallback ──────────────────────────────────────────────
async function shopifyFallback(search: string, limit: number, mode: string) {
  const token = await getShopifyAccessToken();
  const store = process.env.SHOPIFY_STORE!;
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-04";

  const endpoint = `products.json?limit=${Math.min(limit, 250)}&status=active&fields=id,title,body_html,product_type,vendor,tags,handle,images,variants,status`;
  const res = await fetch(`https://${store}/admin/api/${apiVersion}/${endpoint}`, {
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
  });

  if (!res.ok) {
    // If Shopify also fails, return empty
    return { products: [], total: 0, source: "shopify-error" };
  }

  const data = await res.json();
  let products = (data.products || [])
    .filter((p: any) => p.status === "active" && p.images?.length > 0)
    .map((p: any) => {
      const v = p.variants?.[0] || {};
      const price = parseFloat(v.price || "0");
      const compareAt = parseFloat(v.compare_at_price || "0");
      const oldPrice = compareAt > price ? compareAt : Math.round(price * 1.4);
      const discount = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
      return {
        id: String(p.id), pgId: null, title: p.title,
        description: (p.body_html || "").replace(/<[^>]*>/g, " ").trim().substring(0, 200),
        benefits: ["Livrare rapidă", "Checkout securizat", "Produs verificat"],
        price, oldPrice, discountPercent: discount,
        rating: 4.5, orders: 50 + (parseInt(String(p.id).slice(-3)) % 350),
        deliveryDays: 3, viewers: 12, cartAdds: 8,
        images: (p.images || []).map((img: any) => img.src),
        category: p.product_type || "General", vendor: p.vendor || "AICeVrei",
        tags: p.tags || "", gradient: "from-orange-500 to-pink-500",
        qualityScore: 8, variantId: String(v.id || ""),
        socialProofLabel: "Produs popular", commerceBadge: "⚡ Disponibil",
        dealLabel: discount >= 20 ? "🔥 Super Deal" : "✨ Nou",
      };
    });

  // Basic search filter
  if (search) {
    const q = search.toLowerCase();
    products = products.filter((p: any) =>
      p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.tags.toLowerCase().includes(q)
    );
  }

  return { products: products.slice(0, limit), total: products.length, source: "shopify" };
}

// ─── PostgreSQL (primary) ──────────────────────────────────────────
async function postgresQuery(filters: any) {
  // Dynamic import to avoid build errors when pg is not available
  const { searchProducts, getCategories } = await import("@/lib/db/product-queries");

  if (filters.categories) {
    return { categories: await getCategories() };
  }

  const result = await searchProducts(filters);
  return { ...result, source: "postgresql" };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("search") || url.searchParams.get("q") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    const mode = url.searchParams.get("mode") || "default";
    const isCategories = url.searchParams.get("categories") === "true";

    // ─── Romanian → English search translation ──────────────────────
    const RO_TO_EN: Record<string, string> = {
      rochii: "dress", rochie: "dress", fuste: "skirt", fusta: "skirt",
      bluze: "blouse", bluza: "blouse", pantaloni: "pants", tricou: "t-shirt",
      tricouri: "t-shirt", camasa: "shirt", camasi: "shirt", jacheta: "jacket",
      geaca: "jacket", palton: "coat", barbati: "men", barbat: "men",
      femei: "women", femeie: "women", copii: "kids children", bebelusi: "baby",
      bijuterii: "jewelry necklace ring", colier: "necklace", inel: "ring",
      bratara: "bracelet", cercei: "earring", ceas: "watch", ceasuri: "watch",
      pantofi: "shoes", incaltaminte: "shoes", adidasi: "sneakers",
      sandale: "sandals", cizme: "boots", geanta: "bag", genti: "bag",
      rucsac: "backpack", portofel: "wallet", casa: "home garden furniture",
      bucatarie: "kitchen", baie: "bathroom", dormitor: "bedroom",
      gradina: "garden", mobila: "furniture", decor: "decoration",
      electronice: "electronics bluetooth smart", telefon: "phone case",
      casti: "headphones earbuds", laptop: "laptop computer", tableta: "tablet",
      animale: "pet dog cat", caine: "dog", pisica: "cat",
      beauty: "makeup beauty cosmetic", machiaj: "makeup", parfum: "perfume",
      skincare: "skincare cream serum", sport: "sports fitness yoga",
      fitness: "fitness gym workout", auto: "car motorcycle accessories",
      masina: "car accessories", scule: "tools hardware",
      jucarii: "toys", cadou: "gift", ieftin: "cheap affordable",
    };

    let translatedSearch = search;
    if (search) {
      const words = search.toLowerCase().split(/\s+/);
      const translated = words.map(w => RO_TO_EN[w] || w);
      translatedSearch = translated.join(" ");
    }

    const filters = {
      search: translatedSearch || undefined,
      category: url.searchParams.get("category") || undefined,
      minPrice: url.searchParams.get("minPrice") ? Number(url.searchParams.get("minPrice")) : undefined,
      maxPrice: url.searchParams.get("maxPrice") ? Number(url.searchParams.get("maxPrice")) : undefined,
      sort: url.searchParams.get("sort") || undefined,
      mode, limit,
      offset: parseInt(url.searchParams.get("offset") || "0"),
      categories: isCategories,
    };

    // Try PostgreSQL first
    if (process.env.DATABASE_URL) {
      try {
        const result = await postgresQuery(filters);
        if (isCategories) return NextResponse.json(result);
        return NextResponse.json({
          products: result.products,
          total: result.total,
          offset: result.offset || 0,
          limit: result.limit || limit,
          source: result.source,
          nextPage: (result.offset || 0) + (result.limit || limit) < result.total
            ? `?offset=${(result.offset || 0) + (result.limit || limit)}&limit=${result.limit || limit}` : null,
        });
      } catch (dbError: any) {
        console.warn("[Products API] PostgreSQL failed, falling back to Shopify:", dbError.message);
      }
    }

    // Fallback to Shopify
    console.log("[Products API] Using Shopify fallback");
    const result = await shopifyFallback(search, limit, mode);
    return NextResponse.json({
      products: result.products,
      total: result.total,
      source: result.source,
      offset: 0,
      limit,
      nextPage: null,
    });
  } catch (error: any) {
    console.error("[Products API v2]", error.message);
    return NextResponse.json(
      { error: error.message, products: [], total: 0 },
      { status: 500 }
    );
  }
}
