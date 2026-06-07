/**
 * PostgreSQL search wrapper for chat context
 * Encapsulates the search + unique + bundle logic used by /api/chat
 */

import { searchProducts, type ProductFilters } from "@/lib/db/product-queries";
import { inferBundleQueries, buildSalesSuggestion, type BundleProduct } from "@/lib/sales/bundle-engine";
import { detectCategory } from "./category-detect";

type ProductModel = BundleProduct;

export async function searchPG(
  query: string,
  limit = 16,
  opts: { maxPrice?: number; category?: string; sort?: string; excludeIds?: string[] } = {},
): Promise<ProductModel[]> {
  const filters: ProductFilters = {
    search: query || undefined,
    category: opts.category || detectCategory(query),
    maxPrice: opts.maxPrice,
    sort: (opts.sort as any) || "popular",
    limit,
    offset: 0,
    excludeIds: opts.excludeIds,
  };

  const result = await searchProducts(filters);
  return result.products;
}

export function uniqueProducts(products: ProductModel[]) {
  return products.filter(
    (p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx,
  );
}

/**
 * Search with progressive fallback:
 * 1. Query + category + maxPrice
 * 2. Category only (no query)
 * 3. Drop maxPrice
 * 4. Drop category
 */
export async function searchWithFallback(
  query: string,
  opts: {
    maxPrice?: number;
    category?: string;
    sort?: string;
    excludeIds?: string[];
    userMessage?: string;
  },
): Promise<{ products: ProductModel[]; replyPrefix: string }> {
  const { maxPrice, category, sort, excludeIds } = opts;
  let replyPrefix = "";

  let products = await searchPG(query, 16, { maxPrice, category, sort, excludeIds });

  // Fallback 1: if excludeIds exhausted results
  if (products.length === 0 && excludeIds && excludeIds.length > 0 && category) {
    products = await searchPG("", 16, { maxPrice, category, sort, excludeIds });
  }
  // Fallback 2: drop maxPrice
  if (products.length === 0 && maxPrice) {
    products = await searchPG("", 16, { category, sort, excludeIds });
  }
  // Fallback 3: drop category, search globally
  if (products.length === 0 && category) {
    products = await searchPG(query, 16, { maxPrice, sort });
    if (products.length > 0) {
      replyPrefix = `⚠️ Nu avem încă produse în categoria "${category}", dar îți arăt ce am găsit relevant:\n\n`;
    }
  }
  // Still nothing
  if (products.length === 0 && category) {
    replyPrefix = `⚠️ Momentan nu avem produse în categoria „${category}". Adăugăm noi produse zilnic! Între timp, poți căuta în categoriile disponibile (rochii, haine femei, accesorii).\n\n`;
  }

  return { products, replyPrefix };
}

/**
 * Fetch bundle (complementary) products for a set of main products
 */
export async function fetchBundles(
  products: ProductModel[],
  query: string,
  aiQueries: string[],
  opts: { maxPrice?: number; category?: string } = {},
): Promise<ProductModel[]> {
  if (products.length === 0) return [];

  const bundleQueries = [...aiQueries, ...inferBundleQueries(query)];
  const bundleCategory = products.length > 0 ? opts.category : undefined;

  const bundleResults = await Promise.all(
    bundleQueries.slice(0, 2).map((bq) => searchPG(bq, 6, { maxPrice: opts.maxPrice, category: bundleCategory })),
  );

  return uniqueProducts(bundleResults.flat())
    .filter((p) => !products.some((main) => main.id === p.id))
    .slice(0, 12);
}

/**
 * Build a bundle suggestion string
 */
export function buildBundleSuggestionText(products: ProductModel[], bundleProducts: ProductModel[]): string {
  if (!products[0]) return "";
  return `\n\n${buildSalesSuggestion(products[0], bundleProducts.slice(0, 2))}`;
}
