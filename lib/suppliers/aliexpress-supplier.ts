/**
 * AliExpress DataHub Supplier (via RapidAPI)
 * Replaces CJ Dropshipping with real AliExpress products
 * Includes: search, product details, shipping to Romania
 */

import { SupplierProduct } from "../types";

const API_HOST = process.env.RAPIDAPI_HOST || "aliexpress-datahub.p.rapidapi.com";
const API_KEY = process.env.RAPIDAPI_KEY || "";
const EUR_TO_RON = 4.97;

function headers() {
  return {
    "x-rapidapi-key": API_KEY,
    "x-rapidapi-host": API_HOST,
  };
}

/**
 * Search AliExpress products by keyword
 * Uses item_search_4 (best results, 50+ items)
 */
export async function aliexpressSearch(
  keyword: string,
  page = 1,
  size = 20
): Promise<SupplierProduct[]> {
  if (!API_KEY) {
    console.error("[AliExpress] RAPIDAPI_KEY not configured");
    return [];
  }

  try {
    const url = `https://${API_HOST}/item_search_4?q=${encodeURIComponent(keyword)}&page=${page}&sort=orders&region=RO&locale=en_US&currency=EUR`;

    console.log(`[AliExpress] Searching: "${keyword}" (page ${page})`);

    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      console.error(`[AliExpress] Search HTTP ${res.status}`);
      return [];
    }

    const json = await res.json();

    if (json.result?.status?.code !== 200 || !json.result?.resultList) {
      console.error("[AliExpress] Search error:", json.result?.status?.msg || "no results");
      return [];
    }

    const items = json.result.resultList.slice(0, size);
    const products: SupplierProduct[] = [];

    for (const entry of items) {
      const item = entry.item || entry;
      const product = parseSearchItem(item);
      if (product) products.push(product);
    }

    console.log(`[AliExpress] ✅ ${products.length} products for "${keyword}"`);
    return products;
  } catch (error: any) {
    console.error("[AliExpress] Search error:", error.message);
    return [];
  }
}

/**
 * Get full product details + shipping to Romania
 * Uses item_detail_2 which includes delivery info
 */
export async function aliexpressProductDetail(
  itemId: string
): Promise<SupplierProduct | null> {
  if (!API_KEY) return null;

  try {
    const url = `https://${API_HOST}/item_detail_2?itemId=${itemId}&country=RO&currency=EUR&region=RO&locale=ro_RO`;

    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return null;

    const json = await res.json();
    if (json.result?.status?.code !== 200) return null;

    const r = json.result;
    const item = r.item || {};

    // Extract images
    const images: string[] = [];
    if (item.images && Array.isArray(item.images)) {
      for (const img of item.images) {
        const url = img.startsWith("//") ? `https:${img}` : img;
        if (url.startsWith("http")) images.push(url);
      }
    }

    // Extract price
    const skuDef = item.sku?.def || {};
    const price = skuDef.promotionPrice || skuDef.price || 0;
    const priceNum = typeof price === "string" ? parseFloat(price.split(" - ")[0]) : price;

    // Extract shipping info
    let shippingCost = 0;
    let deliveryDays = 20;
    const delivery = r.delivery;
    if (delivery?.shippingList && delivery.shippingList.length > 0) {
      const cheapest = delivery.shippingList[0];
      shippingCost = parseFloat(cheapest.shippingFee || "0");
      const timeStr = cheapest.shippingTime || "15-25";
      const maxDays = parseInt(timeStr.split("-").pop() || "20");
      deliveryDays = maxDays;
    }

    // If no shipping to RO, skip this product
    if (delivery?.shippingToCode && delivery.shippingToCode !== "RO") {
      console.log(`[AliExpress] ⚠️ Product ${itemId} doesn't ship to RO`);
      return null;
    }

    const ronPrice = Math.round(priceNum * EUR_TO_RON);
    const ronShipping = Math.round(shippingCost * EUR_TO_RON);

    // Extract SKU variants
    const variants = (item.sku?.skuList || []).slice(0, 6).map((sku: any) => ({
      sourceVariantId: sku.skuId || `sku-${Math.random().toString(36).slice(2)}`,
      title: sku.skuVal?.actSkuCalPrice ? `${sku.skuVal.actSkuCalPrice} EUR` : "Standard",
      options: { variant: sku.propPath || "Standard" },
      price: Math.round((sku.skuVal?.skuAmount?.value || priceNum) * EUR_TO_RON),
      stockStatus: "in_stock" as const,
    }));

    return {
      source: "aliexpress",
      sourceProductId: itemId,
      sourceUrl: `https://www.aliexpress.com/item/${itemId}.html`,
      title: item.title || "",
      description: item.title || "",
      price: ronPrice,
      shipping: ronShipping,
      currency: "RON",
      rating: item.averageStarRate || parseFloat(item.tradeInfo?.starRate || "4.5"),
      orders: item.sales || parseInt(item.tradeInfo?.tradeCount || "0"),
      deliveryDays,
      images: images.slice(0, 6),
      category: "",
      variants: variants.length > 0 ? variants : [{
        sourceVariantId: `v-${itemId}`,
        title: "Standard",
        options: { variant: "Standard" },
        price: ronPrice,
        stockStatus: "in_stock" as const,
      }],
    };
  } catch (error: any) {
    console.error(`[AliExpress] Detail error for ${itemId}:`, error.message);
    return null;
  }
}

/**
 * Parse a search result item into SupplierProduct
 */
function parseSearchItem(item: any): SupplierProduct | null {
  try {
    const itemId = String(item.itemId || "");
    if (!itemId) return null;

    // Price in EUR (promotionPrice takes priority, price can be null)
    const skuDef = item.sku?.def || {};
    const rawPrice = skuDef.promotionPrice ?? skuDef.price ?? 0;
    const priceNum = typeof rawPrice === "string" ? parseFloat(rawPrice.split(" - ")[0]) : (rawPrice || 0);
    if (priceNum <= 0) return null;

    const ronPrice = Math.round(priceNum * EUR_TO_RON);

    // QUALITY FILTER: skip garbage products
    if (priceNum < 2) return null;   // too cheap = junk
    if (priceNum > 50) return null;  // too expensive for impulse buy
    const rating = item.averageStarRate || 0;
    if (rating > 0 && rating < 4.0) return null;  // bad rated
    const images: string[] = [];
    const imgField = item.image;
    if (imgField) {
      let rawUrl = "";
      if (typeof imgField === "string") {
        rawUrl = imgField;
      } else if (imgField.imgUrl) {
        rawUrl = imgField.imgUrl;
      }
      if (rawUrl) {
        const imgUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
        if (imgUrl.startsWith("http")) images.push(imgUrl);
      }
    }
    if (images.length === 0) return null;

    // Rating (already extracted above)

    // Sales — can be number or string like "1000+ sold"
    const salesRaw = item.sales ?? item.trade?.tradeDesc ?? 0;
    const orders = typeof salesRaw === "number" ? salesRaw : parseInt(String(salesRaw).replace(/[^0-9]/g, "")) || 0;

    return {
      source: "aliexpress",
      sourceProductId: itemId,
      sourceUrl: `https://www.aliexpress.com/item/${itemId}.html`,
      title: item.title || "",
      description: item.title || "",
      price: ronPrice,
      shipping: 0, // Will be fetched on detail
      currency: "RON",
      rating,
      orders,
      deliveryDays: 18, // Default, refined on detail view
      images,
      category: "",
      variants: [{
        sourceVariantId: `v-${itemId}`,
        title: "Standard",
        options: { variant: "Standard" },
        price: ronPrice,
        stockStatus: "in_stock" as const,
      }],
    };
  } catch {
    return null;
  }
}
