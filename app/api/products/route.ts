/**
 * Products API - storefront catalog reads from marketplace_products
 * with AliExpress source data used as enrichment where needed.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRate } from "@/lib/fx/convert";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

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
  fitness: "fitness", auto: "car motorcycle accessories",
  masina: "car accessories", scule: "tools hardware",
  jucarii: "toys", cadou: "gift", ieftin: "cheap affordable",
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get("swypik_locale")?.value;
    const locale = (url.searchParams.get("locale") || localeCookie || "ro").toLowerCase();
    const search = url.searchParams.get("search") || url.searchParams.get("q") || "";
    const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 200)) : 50;
    const mode = url.searchParams.get("mode") || "default";
    const isCategories = url.searchParams.get("categories") === "true";
    const isHierarchy = url.searchParams.get("hierarchy") === "true";

    let translatedSearch = search;
    if (search) {
      translatedSearch = search
        .toLowerCase()
        .split(/\s+/)
        .map((word) => RO_TO_EN[word] || word)
        .join(" ");
    }

    const { searchProducts, getCategories, getCategoryHierarchy } = await import("@/lib/db/product-queries");

    if (isHierarchy) {
      const hierarchy = await getCategoryHierarchy(locale);
      return NextResponse.json({ hierarchy });
    }

    if (isCategories) {
      // Legacy endpoint: 60s response, 1.88MB payload, 5750 deprecated categories.
      // No UI consumers (audit 2026-05-19). Short-circuit with 410 + tiny payload.
      return NextResponse.json(
        {
          categories: [],
          deprecated: true,
          gone: true,
          replacement: "/api/categories?hierarchy=true",
          message: "categories=true is gone. Use /api/categories?hierarchy=true.",
        },
        {
          status: 410,
          headers: {
            Deprecation: "true",
            Sunset: "Sat, 01 Aug 2026 00:00:00 GMT",
            Link: "</api/categories>; rel=successor-version",
            "Cache-Control": "public, max-age=3600",
          },
        },
      );
    }

    const rawOffset = parseInt(url.searchParams.get("offset") || "0", 10);
    const safeOffset = Number.isFinite(rawOffset) ? Math.max(0, Math.min(rawOffset, 100000)) : 0;
    const rawSeed = Number(url.searchParams.get("seed") || 0);
    const safeSeed = Number.isFinite(rawSeed) ? Math.max(0, Math.min(Math.trunc(rawSeed), 1000000)) : 0;
    const rawMinPrice = url.searchParams.get("minPrice") ? Number(url.searchParams.get("minPrice")) : undefined;
    const rawMaxPrice = url.searchParams.get("maxPrice") ? Number(url.searchParams.get("maxPrice")) : undefined;

    // Route category/categoryId into taxonomy slug filter when value looks like a taxonomy slug.
    const rawCategory = url.searchParams.get("category") || undefined;
    const rawCategoryId = url.searchParams.get("categoryId") || undefined;
    const rawTaxonomySlug = url.searchParams.get("taxonomy_node_slug") || url.searchParams.get("taxonomyNodeSlug") || url.searchParams.get("categorySlug") || undefined;
    const isTaxonomySlug = (v?: string) => !!v && /^[a-z][a-z0-9-]*$/.test(v) && !/^[0-9]+$/.test(v);
    const inferredTaxonomySlug = rawTaxonomySlug || (isTaxonomySlug(rawCategoryId) ? rawCategoryId : undefined) || (isTaxonomySlug(rawCategory) ? rawCategory : undefined);
    const passCategory = inferredTaxonomySlug && rawCategory && isTaxonomySlug(rawCategory) ? undefined : rawCategory;
    const passCategoryId = inferredTaxonomySlug && rawCategoryId && isTaxonomySlug(rawCategoryId) ? undefined : rawCategoryId;
    const result = await searchProducts({
      search: translatedSearch || undefined,
      category: passCategory,
      categoryId: passCategoryId,
      taxonomyNodeSlug: inferredTaxonomySlug,
      tag: url.searchParams.get("tag") || undefined,
      minPrice: rawMinPrice !== undefined && Number.isFinite(rawMinPrice) && rawMinPrice >= 0 ? rawMinPrice : undefined,
      maxPrice: rawMaxPrice !== undefined && Number.isFinite(rawMaxPrice) && rawMaxPrice >= 0 ? rawMaxPrice : undefined,
      sort: (url.searchParams.get("sort") as any) || undefined,
      mode: mode as any,
      limit,
      offset: safeOffset,
      seed: safeSeed,
      includeCount: url.searchParams.get("includeCount") === "1",
      locale,
    });

    const cacheSeconds = mode === "video" ? 300 : 60;

    // Currency conversion (aligned with /api/products/[id]): listing stores price in RON.
    const targetCurrency = (cookieStore.get("swypik_currency")?.value || "RON").toUpperCase();
    let fxRate = 1;
    if (targetCurrency !== "RON") {
      try {
        const eurPerRon = await getRate("RON", "EUR"); // EUR->RON
        if (targetCurrency === "EUR") {
          if (isFinite(eurPerRon) && eurPerRon > 0) fxRate = 1 / eurPerRon;
        } else {
          const eurPerTarget = await getRate(targetCurrency, "EUR");
          if (isFinite(eurPerRon) && eurPerRon > 0 && isFinite(eurPerTarget) && eurPerTarget > 0) {
            fxRate = eurPerTarget / eurPerRon;
          }
        }
      } catch (e) {
        logger.warn({ err: e }, "[Products API] fx convert failed");
      }
    }
    const convertPrice = (p: number | string | null | undefined): number | string | null | undefined => {
      const n = Number(p);
      if (!isFinite(n) || n <= 0) return p;
      return Math.round(n * fxRate * 100) / 100;
    };

    type ProductRow = {
      id: string | number;
      title: string;
      price: number;
      oldPrice?: number | null;
      image?: string | null;
      thumbnail?: string | null;
      images?: string[] | null;
      video?: string | null;
      hasVideo?: boolean;
      videoId?: string | null;
      videoThumbnail?: string | null;
      [key: string]: unknown;
    };

    // Minimal DTO for video mode (high-volume infinite scroll)
    const products = mode === "video"
      ? ((result.products || []) as ProductRow[]).map((p) => ({
          id: p.id,
          title: p.title,
          price: convertPrice(p.price),
          priceRon: p.price,
          oldPrice: p.oldPrice != null ? convertPrice(p.oldPrice) : null,
          thumbnail: p.image || p.thumbnail || (Array.isArray(p.images) ? p.images[0] : null),
          video: p.video || null,
          hasVideo: Boolean(p.hasVideo || p.video),
          videoId: p.videoId || null,
          videoThumbnail: p.videoThumbnail || null,
        }))
      : ((result.products || []) as ProductRow[]).map((p) => ({
          ...p,
          price: convertPrice(p.price),
          priceRon: p.price,
          oldPrice: p.oldPrice != null ? convertPrice(p.oldPrice) : (p.oldPrice ?? null),
        }));

    const nextOffset = (result.offset || 0) + (result.limit || limit);
    const hasMore = mode === "video"
      ? Boolean((result as { hasMore?: boolean }).hasMore)
      : nextOffset < result.total;

    return NextResponse.json(
      {
        products,
        currency: targetCurrency,
        total: result.total,
        offset: result.offset || 0,
        limit: result.limit || limit,
        hasMore,
        source: "postgresql",
        nextPage: hasMore
          ? `?offset=${nextOffset}&limit=${result.limit || limit}`
          : null,
      },
      {
        headers: {
          "Cache-Control": `public, max-age=${mode === "video" ? 60 : 30}, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`,
          "CDN-Cache-Control": `public, max-age=${cacheSeconds}`,
          "Vary": "Accept-Encoding",
        },
      },
    );
  } catch (error) {
    logger.error({ err: error }, "[Products API]");
    return NextResponse.json(
      { error: "A aparut o eroare la incarcarea produselor.", products: [], total: 0, source: "error" },
      { status: 500 },
    );
  }
}
