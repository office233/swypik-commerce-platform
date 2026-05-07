/**
 * Products API v2 — Serves products from PostgreSQL (109k+)
 * Zero Shopify rate limits for browsing
 * Supports: search, category filter, price filter, sorting, pagination
 */

import { NextResponse } from "next/server";
import { searchProducts, getCategories, type ProductFilters } from "@/lib/db/product-queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // Categories endpoint
    if (url.searchParams.get("categories") === "true") {
      const categories = await getCategories();
      return NextResponse.json({ categories });
    }

    const filters: ProductFilters = {
      search: url.searchParams.get("search") || url.searchParams.get("q") || undefined,
      category: url.searchParams.get("category") || undefined,
      minPrice: url.searchParams.get("minPrice") ? Number(url.searchParams.get("minPrice")) : undefined,
      maxPrice: url.searchParams.get("maxPrice") ? Number(url.searchParams.get("maxPrice")) : undefined,
      sort: (url.searchParams.get("sort") as any) || undefined,
      mode: (url.searchParams.get("mode") as any) || "default",
      limit: Math.min(parseInt(url.searchParams.get("limit") || "50"), 200),
      offset: parseInt(url.searchParams.get("offset") || "0"),
    };

    const result = await searchProducts(filters);

    return NextResponse.json({
      products: result.products,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      nextPage: result.offset + result.limit < result.total
        ? `?offset=${result.offset + result.limit}&limit=${result.limit}` : null,
    });
  } catch (error: any) {
    console.error("[Products API v2]", error.message);
    return NextResponse.json(
      { error: error.message, products: [], total: 0 },
      { status: 500 }
    );
  }
}
