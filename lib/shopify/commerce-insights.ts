import { getShopifyAccessToken } from "@/lib/shopify/auth";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

export type ProductInsight = {
  productId: string;
  variantId: string;
  title: string;
  soldCount: number;
  revenue: number;
  abandonedCount: number;
  cartCount: number;
  coPurchasedWith: string[];
  conversionScore: number;
};

type ShopifyLineItem = {
  product_id?: number | string | null;
  variant_id?: number | string | null;
  title?: string;
  quantity?: number;
  price?: string;
};

type ShopifyOrder = {
  id: number | string;
  total_price?: string;
  created_at?: string;
  line_items?: ShopifyLineItem[];
};

type ShopifyCheckout = {
  id: number | string;
  created_at?: string;
  line_items?: ShopifyLineItem[];
};

async function shopifyGET(endpoint: string) {
  const token = await getShopifyAccessToken();
  const store = process.env.SHOPIFY_STORE;

  if (!store) throw new Error("SHOPIFY_STORE is missing");

  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Shopify ${res.status}: ${text.slice(0, 300)}`);
  }

  return text ? JSON.parse(text) : {};
}

export async function getRecentOrders(limit = 250): Promise<ShopifyOrder[]> {
  const data = await shopifyGET(
    `orders.json?status=any&limit=${Math.min(limit, 250)}&fields=id,total_price,created_at,line_items`
  );
  return data.orders || [];
}

export async function getAbandonedCheckouts(limit = 250): Promise<ShopifyCheckout[]> {
  try {
    const data = await shopifyGET(
      `checkouts.json?limit=${Math.min(limit, 250)}&fields=id,created_at,line_items`
    );
    return data.checkouts || [];
  } catch (error) {
    console.warn("[Commerce Insights] Abandoned checkouts unavailable:", error);
    return [];
  }
}

function keyFor(line: ShopifyLineItem) {
  return String(line.variant_id || line.product_id || line.title || "unknown");
}

function productIdFor(line: ShopifyLineItem) {
  return String(line.product_id || line.variant_id || "unknown");
}

function insightFor(map: Map<string, ProductInsight>, line: ShopifyLineItem) {
  const key = keyFor(line);
  if (!map.has(key)) {
    map.set(key, {
      productId: productIdFor(line),
      variantId: String(line.variant_id || ""),
      title: line.title || "Produs Shopify",
      soldCount: 0,
      revenue: 0,
      abandonedCount: 0,
      cartCount: 0,
      coPurchasedWith: [],
      conversionScore: 0,
    });
  }
  return map.get(key)!;
}

export function buildProductInsights(orders: ShopifyOrder[], abandonedCheckouts: ShopifyCheckout[] = []) {
  const map = new Map<string, ProductInsight>();
  const pairCounts = new Map<string, number>();

  for (const order of orders) {
    const lines = order.line_items || [];
    const keys = lines.map(keyFor).filter(Boolean);

    for (const line of lines) {
      const qty = Number(line.quantity || 1);
      const price = Number(line.price || 0);
      const insight = insightFor(map, line);
      insight.soldCount += qty;
      insight.revenue += price * qty;
      insight.cartCount += qty;
    }

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const pairKey = [keys[i], keys[j]].sort().join("::");
        pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
      }
    }
  }

  for (const checkout of abandonedCheckouts) {
    for (const line of checkout.line_items || []) {
      const qty = Number(line.quantity || 1);
      const insight = insightFor(map, line);
      insight.abandonedCount += qty;
      insight.cartCount += qty;
    }
  }

  for (const [pairKey] of pairCounts) {
    const [a, b] = pairKey.split("::");
    const ia = map.get(a);
    const ib = map.get(b);
    if (ia && ib) {
      ia.coPurchasedWith.push(b);
      ib.coPurchasedWith.push(a);
    }
  }

  for (const insight of map.values()) {
    const soldWeight = insight.soldCount * 2;
    const revenueWeight = Math.min(insight.revenue / 100, 50);
    const bundleWeight = insight.coPurchasedWith.length * 3;
    const abandonedPenalty = insight.abandonedCount * 0.6;
    insight.conversionScore = Math.max(0, Math.round(soldWeight + revenueWeight + bundleWeight - abandonedPenalty));
    insight.revenue = Math.round(insight.revenue * 100) / 100;
    insight.coPurchasedWith = Array.from(new Set(insight.coPurchasedWith)).slice(0, 10);
  }

  return Array.from(map.values()).sort((a, b) => b.conversionScore - a.conversionScore);
}

export function buildBundlePairs(insights: ProductInsight[]) {
  const byVariant = new Map(insights.map((i) => [i.variantId || i.productId, i]));
  const pairs: { productId: string; title: string; withProductId: string; withTitle: string; score: number }[] = [];

  for (const insight of insights) {
    for (const relatedId of insight.coPurchasedWith) {
      const related = byVariant.get(relatedId);
      if (!related) continue;
      pairs.push({
        productId: insight.productId,
        title: insight.title,
        withProductId: related.productId,
        withTitle: related.title,
        score: insight.conversionScore + related.conversionScore,
      });
    }
  }

  return pairs
    .filter((pair, idx, arr) => arr.findIndex((p) => [p.productId, p.withProductId].sort().join("::") === [pair.productId, pair.withProductId].sort().join("::")) === idx)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}

export async function getCommerceInsights() {
  const [orders, abandonedCheckouts] = await Promise.all([
    getRecentOrders(),
    getAbandonedCheckouts(),
  ]);

  const productInsights = buildProductInsights(orders, abandonedCheckouts);
  const bestBundles = buildBundlePairs(productInsights);

  return {
    productInsights,
    bestBundles,
    topSoldProducts: [...productInsights].sort((a, b) => b.soldCount - a.soldCount).slice(0, 20),
    topRevenueProducts: [...productInsights].sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    topAbandonedProducts: [...productInsights].sort((a, b) => b.abandonedCount - a.abandonedCount).slice(0, 20),
    highIntentProducts: [...productInsights].sort((a, b) => b.cartCount - a.cartCount).slice(0, 20),
    productsToPush: productInsights.slice(0, 20),
    totals: {
      orders: orders.length,
      abandonedCheckouts: abandonedCheckouts.length,
      productsWithInsights: productInsights.length,
    },
  };
}
