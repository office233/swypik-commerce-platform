/**
 * CJ Dropshipping API Client
 * Real products — fetches detail endpoint for multiple images
 */

import { SupplierProduct } from "../types";

const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const USD_TO_RON = 4.6;

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
  if (!json.result || json.code !== 200) {
    throw new Error(`CJ auth error: ${json.message}`);
  }

  cachedToken = {
    token: json.data?.accessToken || json.data,
    expires: Date.now() + 23 * 60 * 60 * 1000,
  };

  console.log("[CJ] ✅ Token obtained");
  return cachedToken.token;
}

/**
 * Fetch product detail to get ALL images (list endpoint only gives 1)
 */
async function fetchProductImages(pid: string, token: string): Promise<string[]> {
  try {
    const res = await fetch(`${CJ_BASE}/product/query?pid=${pid}`, {
      method: "GET",
      headers: { "CJ-Access-Token": token },
    });

    if (!res.ok) return [];

    const json = await res.json();
    if (json.code !== 200 || !json.data) return [];

    const images: string[] = [];
    const data = json.data;

    // productImage can be a JSON array string or a URL
    if (data.productImage) {
      try {
        const parsed = JSON.parse(data.productImage);
        if (Array.isArray(parsed)) {
          images.push(...parsed.filter((u: string) => u?.startsWith("http")));
        }
      } catch {
        if (data.productImage.startsWith("http")) {
          images.push(data.productImage);
        }
      }
    }

    // productImageSet is usually an array
    if (Array.isArray(data.productImageSet)) {
      for (const img of data.productImageSet) {
        if (img && typeof img === "string" && img.startsWith("http") && !images.includes(img)) {
          images.push(img);
        }
      }
    }

    return images.slice(0, 6);
  } catch {
    return [];
  }
}

/**
 * Search CJ products + fetch extra images for top results
 */
export async function cjSearch(keyword: string, page = 1, size = 20): Promise<SupplierProduct[]> {
  try {
    const token = await getCJToken();

    const url = new URL(`${CJ_BASE}/product/list`);
    url.searchParams.set("pageNum", String(page));
    url.searchParams.set("pageSize", String(size));
    url.searchParams.set("productNameEn", keyword);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "CJ-Access-Token": token },
    });

    if (!res.ok) return [];

    const json = await res.json();
    if (json.code !== 200 || !json.data?.list) {
      console.error("[CJ] API error:", json.message);
      return [];
    }

    // Map basic products
    const products = mapProducts(json.data.list);

    // Fetch extra images for top 8 products (parallel, saves API calls)
    const top8 = products.slice(0, 8);
    const imagePromises = top8.map(async (p) => {
      const extraImages = await fetchProductImages(p.sourceProductId, token);
      if (extraImages.length > 1) {
        p.images = extraImages;
      }
      return p;
    });

    await Promise.all(imagePromises);

    console.log(`[CJ] ✅ ${products.length} products for "${keyword}" (${top8.length} with extra images)`);
    return products;
  } catch (error: any) {
    console.error("[CJ] Error:", error.message);
    return [];
  }
}

function mapProducts(items: any[]): SupplierProduct[] {
  return items
    .map((item: any) => {
      const variants = item.variants || [];
      const prices = variants
        .map((v: any) => parseFloat(v.variantSellPrice || v.variantPrice || "0"))
        .filter((p: number) => p > 0);
      const usdPrice = prices.length > 0 ? Math.min(...prices) : parseFloat(item.sellPrice || "0");
      const ronCost = Math.round(usdPrice * USD_TO_RON);

      // Basic image from list endpoint
      const images: string[] = [];
      if (item.productImage && item.productImage.startsWith("http")) {
        images.push(item.productImage);
      }

      if (images.length === 0 || ronCost <= 0) return null;

      const categoryName = item.categoryName || item.category || "";

      return {
        source: "cj" as const,
        sourceProductId: item.pid || item.productId || "",
        sourceUrl: `https://cjdropshipping.com/product/${item.pid || item.productId}`,
        title: item.productNameEn || item.productName || "",
        description: item.description || item.productNameEn || "",
        price: ronCost,
        shipping: 0,
        currency: "RON",
        rating: 0,
        orders: 0,
        deliveryDays: 14,
        images,
        category: categoryName,
        variants: variants.slice(0, 6).map((v: any) => ({
          sourceVariantId: v.vid || `v-${Math.random().toString(36).slice(2)}`,
          title: v.variantName || v.variantNameEn || "Standard",
          options: { variant: v.variantName || "Standard" },
          price: Math.round(parseFloat(v.variantSellPrice || v.variantPrice || String(usdPrice)) * USD_TO_RON),
          stockStatus: "in_stock" as const,
        })),
      };
    })
    .filter((p): p is SupplierProduct => p !== null && p.title.length > 0);
}
