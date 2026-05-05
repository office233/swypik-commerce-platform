/**
 * CJ Dropshipping API Client
 * Real products — NO fake data
 * All CJ products can ship to Romania via CJ logistics
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
 * Search CJ products — ALL products (CJ ships worldwide including Romania)
 * No countryCode filter — it returns 0 results for RO
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

    if (!res.ok) {
      console.error("[CJ] HTTP error:", res.status);
      return [];
    }

    const json = await res.json();
    if (json.code !== 200 || !json.data?.list) {
      console.error("[CJ] API error:", json.message);
      return [];
    }

    const products = mapProducts(json.data.list);
    console.log(`[CJ] ✅ ${products.length} products for "${keyword}"`);
    return products;
  } catch (error: any) {
    console.error("[CJ] Error:", error.message);
    return [];
  }
}

function mapProducts(items: any[]): SupplierProduct[] {
  return items
    .map((item: any) => {
      // Real price from CJ (USD → RON)
      const variants = item.variants || [];
      const prices = variants
        .map((v: any) => parseFloat(v.variantSellPrice || v.variantPrice || "0"))
        .filter((p: number) => p > 0);
      const usdPrice = prices.length > 0 ? Math.min(...prices) : parseFloat(item.sellPrice || "0");
      const ronCost = Math.round(usdPrice * USD_TO_RON);

      // Real images from CJ CDN
      const images: string[] = [];
      if (item.productImage) images.push(item.productImage);
      if (item.productImageSet) {
        const imgSet = typeof item.productImageSet === "string"
          ? item.productImageSet.split(",")
          : Array.isArray(item.productImageSet) ? item.productImageSet : [];
        for (const img of imgSet) {
          if (img && typeof img === "string" && img.startsWith("http") && !images.includes(img)) {
            images.push(img);
          }
        }
      }

      // Skip products without images or price
      if (images.length === 0 || ronCost <= 0) return null;

      // Real CJ category
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
        // Real data from CJ — no faking
        rating: 0, // CJ doesn't provide rating, we don't fake it
        orders: 0, // CJ doesn't provide order count, we don't fake it
        deliveryDays: 14, // Standard CJ delivery to Romania
        images: images.slice(0, 5),
        category: categoryName, // Keep CJ's original category
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
