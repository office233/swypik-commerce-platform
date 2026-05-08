/**
 * Products API — Reads from ae_products + ae_categories (NeonDB)
 * No Shopify fallback — everything is in PostgreSQL now
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("search") || url.searchParams.get("q") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    const mode = url.searchParams.get("mode") || "default";
    const isCategories = url.searchParams.get("categories") === "true";
    const isHierarchy = url.searchParams.get("hierarchy") === "true";

    // Translate Romanian search terms
    let translatedSearch = search;
    if (search) {
      const words = search.toLowerCase().split(/\s+/);
      const translated = words.map(w => RO_TO_EN[w] || w);
      translatedSearch = translated.join(" ");
    }

    const { searchProducts, getCategories, getCategoryHierarchy } = await import("@/lib/db/product-queries");

    // Categories endpoints
    if (isHierarchy) {
      const hierarchy = await getCategoryHierarchy();
      return NextResponse.json({ hierarchy });
    }
    if (isCategories) {
      const categories = await getCategories();
      return NextResponse.json({ categories });
    }

    // Products search
    const filters = {
      search: translatedSearch || undefined,
      category: url.searchParams.get("category") || undefined,
      categoryId: url.searchParams.get("categoryId") ? Number(url.searchParams.get("categoryId")) : undefined,
      minPrice: url.searchParams.get("minPrice") ? Number(url.searchParams.get("minPrice")) : undefined,
      maxPrice: url.searchParams.get("maxPrice") ? Number(url.searchParams.get("maxPrice")) : undefined,
      sort: url.searchParams.get("sort") as any || undefined,
      mode: mode as any,
      limit,
      offset: parseInt(url.searchParams.get("offset") || "0"),
    };

    const result = await searchProducts(filters);

    return NextResponse.json({
      products: result.products,
      total: result.total,
      offset: result.offset || 0,
      limit: result.limit || limit,
      source: "postgresql",
      nextPage: (result.offset || 0) + (result.limit || limit) < result.total
        ? `?offset=${(result.offset || 0) + (result.limit || limit)}&limit=${result.limit || limit}` : null,
    });
  } catch (error: any) {
    console.error("[Products API]", error.message);
    return NextResponse.json(
      { error: error.message, products: [], total: 0, source: "error" },
      { status: 500 }
    );
  }
}
