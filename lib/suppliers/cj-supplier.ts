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
    if (json.code !== 200 || !json.data?.content) {
      console.error("[CJ] Error:", json.message, "code:", json.code);
      return [];
    }

    console.log(`[CJ] Found ${json.data.totalRecords} total results`);

    // listV2 structure: data.content = [{ productList: [...] }, ...]
    const allItems: any[] = [];
    for (const group of json.data.content) {
      if (group.productList && Array.isArray(group.productList)) {
        allItems.push(...group.productList);
      }
    }

    const products = allItems
      .map((item: any) => {
        // sellPrice can be "1.15 -- 1.19" or "5.99"
        const priceStr = item.sellPrice || item.nowPrice || "0";
        const usdPrice = parseFloat(String(priceStr).split("--")[0].trim());
        if (usdPrice <= 0) return null;
        const ronCost = Math.round(usdPrice * USD_TO_RON);

        // bigImage is the main image in listV2
        const images: string[] = [];
        if (item.bigImage && typeof item.bigImage === "string" && item.bigImage.startsWith("http")) {
          images.push(item.bigImage);
        }
        images.push(...extractImages(item).filter((i: string) => !images.includes(i)));
        if (images.length === 0) return null;

        const pid = item.id || item.pid || item.productId || "";

        return {
          source: "cj" as const,
          sourceProductId: pid,
          sourceUrl: `https://cjdropshipping.com/product/${pid}`,
          title: item.nameEn || item.productNameEn || item.productName || "",
          description: item.nameEn || item.productNameEn || "",
          price: ronCost,
          shipping: 0,
          currency: "RON",
          rating: item.productRating || 0,
          orders: item.listedNum || item.orders || 0,
          deliveryDays: 14,
          images,
          category: item.categoryName || "",
          variants: [{
            sourceVariantId: item.sku || `v-${pid}`,
            title: "Standard",
            options: { variant: "Standard" },
            price: ronCost,
            stockStatus: "in_stock" as const,
          }],
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && (p as any).title?.length > 0) as SupplierProduct[];

    console.log(`[CJ] ✅ ${products.length} products for "${keyword}"`);
    return products;
  } catch (error: any) {
    console.error("[CJ] Error:", error.message);
    return [];
  }
}
