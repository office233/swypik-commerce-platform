/**
 * CJ Dropshipping API Client v2
 * Uses listV2 endpoint (Elasticsearch-powered) with proper filters
 * - countryCode for shipping availability
 * - price range filters
 * - trending/new product flags
 */

import { SupplierProduct } from "../types";

const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const USD_TO_RON = 4.55;

let cachedToken: { token: string; expires: number } | null = null;

async function getCJToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) {
    return cachedToken.token;
  }

  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new Error("CJ_API_KEY not configured");

  const res = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });

  const json = await res.json();
  if (!json.result || json.code !== 200) throw new Error(`CJ auth: ${json.message}`);

  cachedToken = {
    token: json.data?.accessToken || json.data,
    expires: Date.now() + 23 * 60 * 60 * 1000,
  };

  console.log("[CJ] ✅ Token OK");
  return cachedToken.token;
}

/**
 * Extract ALL images from CJ's productImage field
 */
function extractImages(item: any): string[] {
  const images: string[] = [];

  if (item.productImage) {
    const pi = item.productImage;
    if (typeof pi === "string") {
      if (pi.startsWith("[")) {
        try {
          const arr = JSON.parse(pi);
          if (Array.isArray(arr)) {
            for (const url of arr) {
              if (typeof url === "string" && url.startsWith("http")) images.push(url);
            }
          }
        } catch {
          if (pi.startsWith("http")) images.push(pi);
        }
      } else if (pi.startsWith("http")) {
        images.push(pi);
      }
    }
  }

  if (item.productImageSet) {
    const pis = item.productImageSet;
    if (Array.isArray(pis)) {
      for (const url of pis) {
        if (typeof url === "string" && url.startsWith("http") && !images.includes(url)) {
          images.push(url);
        }
      }
    } else if (typeof pis === "string" && pis.includes(",")) {
      for (const url of pis.split(",")) {
        const trimmed = url.trim();
        if (trimmed.startsWith("http") && !images.includes(trimmed)) {
          images.push(trimmed);
        }
      }
    }
  }

  return images.slice(0, 6);
}

/**
 * Search CJ products using listV2 (Elasticsearch)
 * Supports: keyword, price range, trending, country filtering
 */
export async function cjSearch(
  keyword: string,
  page = 1,
  size = 20,
  options: {
    minPrice?: number;
    maxPrice?: number;
    trending?: boolean;
  } = {}
): Promise<SupplierProduct[]> {
  try {
    const token = await getCJToken();

    const url = new URL(`${CJ_BASE}/product/listV2`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(Math.min(size, 100)));
    url.searchParams.set("keyWord", keyword);
    
    // Price filters (in USD)
    if (options.minPrice !== undefined) url.searchParams.set("startSellPrice", String(options.minPrice));
    if (options.maxPrice !== undefined) url.searchParams.set("endSellPrice", String(options.maxPrice));
    
    // Trending products
    if (options.trending) url.searchParams.set("productFlag", "0");

    console.log(`[CJ] Searching: "${keyword}" (page ${page}, size ${size})`);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "CJ-Access-Token": token },
    });

    if (!res.ok) {
      console.error(`[CJ] HTTP ${res.status}`);
      return [];
    }

    const json = await res.json();
    if (json.code !== 200 || !json.data?.list) {
      console.error("[CJ] Error:", json.message);
      return [];
    }

    const products = json.data.list
      .map((item: any) => {
        const variants = item.variants || [];
        const prices = variants
          .map((v: any) => parseFloat(v.variantSellPrice || v.variantPrice || "0"))
          .filter((p: number) => p > 0);
        const usdPrice = prices.length > 0 ? Math.min(...prices) : parseFloat(item.sellPrice || "0");
        const ronCost = Math.round(usdPrice * USD_TO_RON);

        const images = extractImages(item);

        if (images.length === 0 || ronCost <= 0) return null;

        return {
          source: "cj" as const,
          sourceProductId: item.pid || item.productId || "",
          sourceUrl: `https://cjdropshipping.com/product/${item.pid || item.productId}`,
          title: item.productNameEn || item.productName || "",
          description: item.description || item.productNameEn || "",
          price: ronCost,
          shipping: 0,
          currency: "RON",
          rating: item.productRating || 0,
          orders: item.orders || 0,
          deliveryDays: 14,
          images,
          category: item.categoryName || "",
          variants: variants.length > 0
            ? variants.slice(0, 6).map((v: any) => ({
                sourceVariantId: v.vid || `v-${Math.random().toString(36).slice(2)}`,
                title: v.variantName || v.variantNameEn || "Standard",
                options: { variant: v.variantName || "Standard" },
                price: Math.round(parseFloat(v.variantSellPrice || v.variantPrice || String(usdPrice)) * USD_TO_RON),
                stockStatus: "in_stock" as const,
              }))
            : [{
                sourceVariantId: `v-${item.pid || item.productId}`,
                title: "Standard",
                options: { variant: "Standard" },
                price: ronCost,
                stockStatus: "in_stock" as const,
              }],
        };
      })
      .filter((p: any): p is SupplierProduct => p !== null && p.title.length > 0);

    console.log(`[CJ] ✅ ${products.length} products for "${keyword}"`);
    return products;
  } catch (error: any) {
    console.error("[CJ] Error:", error.message);
    return [];
  }
}
