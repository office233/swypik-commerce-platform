/**
 * Product Queries — PostgreSQL-first product catalog
 * 109,000+ products with real-time pricing (cost + shipping + VAT + markup)
 */

import { dbQuery } from "@/lib/db";

const USD_TO_RON = 4.55;
const VAT_RATE = 0.19;

// ─── Shipping rates cache ──────────────────────────────────────────
let shippingCache: Record<string, number> | null = null;

async function getShippingRates(): Promise<Record<string, number>> {
  if (shippingCache) return shippingCache;
  const { rows } = await dbQuery(
    "SELECT weight_band, COALESCE(cheapest_total_usd, cheapest_shipping_usd, '10') as rate FROM shipping_rates WHERE country_code = 'RO'"
  );
  shippingCache = { "0-50": 8.0 };
  for (const r of rows) shippingCache[r.weight_band] = parseFloat(r.rate);
  return shippingCache;
}

// ─── Pricing — MARKUP DIFERENȚIAT ──────────────────────────────────
// Sub $3 cost:  2.0x → protecție retururi (min 8-10 RON profit)
// $3-50 cost:   1.5x → competitiv cu eMAG
// $50+ cost:    1.3x → atrage clienți pe produse mari
function calculatePrice(costUsd: number, shippingUsd: number) {
  const totalUsd = costUsd + shippingUsd;
  const totalRon = totalUsd * USD_TO_RON * (1 + VAT_RATE);

  // Differentiated markup based on product cost USD
  let markup: number;
  if (costUsd < 3) markup = 2.0;        // cheap items: 2x
  else if (costUsd < 50) markup = 1.5;  // mid items: 1.5x
  else markup = 1.3;                     // expensive: 1.3x

  const rawPrice = totalRon * markup;

  const pricePoints = [14, 19, 24, 29, 39, 49, 59, 69, 79, 89, 99, 119, 129, 149, 169, 189, 199,
    219, 249, 269, 299, 349, 399, 449, 499, 599, 699, 799, 899, 999];
  let sellPrice = pricePoints.find(p => p >= rawPrice) || Math.ceil(rawPrice / 100) * 100 - 1;

  // Safety: never sell below cost + 20%
  const minPrice = Math.ceil(totalRon * 1.2);
  if (sellPrice < minPrice) {
    sellPrice = pricePoints.find(p => p >= totalRon * 1.3) || Math.ceil(totalRon * 1.3 / 10) * 10 - 1;
  }

  const retailMul = 1.6 + (hashCode(String(costUsd)) % 30) / 100;
  const oldPrice = Math.ceil(sellPrice * retailMul / 10) * 10 - 1;
  const discountPercent = oldPrice > sellPrice ? Math.round(((oldPrice - sellPrice) / oldPrice) * 100) : 0;

  return { sellPrice, oldPrice, discountPercent, totalCostRon: Math.round(totalRon) };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ─── Social proof (deterministic from product id) ──────────────────
function buildSocial(id: number, price: number, discount: number) {
  const seed = hashCode(`prod_${id}`);
  const orders = 38 + (seed % 380) + (price < 80 ? 90 : price < 180 ? 50 : 15) + (discount >= 20 ? 80 : 0);
  const rating = Math.min(5, Math.max(4.3, 4.45 + ((seed % 45) / 100)));
  const deliveryDays = 2 + (seed % 4);
  const viewers = 7 + (seed % 25);
  const cartAdds = Math.max(3, Math.round(orders * 0.14));
  return { rating: Number(rating.toFixed(1)), orders, deliveryDays, viewers, cartAdds };
}

// ─── Transform DB row → frontend ChatProduct ──────────────────────
function transformProduct(row: any, shipping: Record<string, number>) {
  const shippingUsd = shipping[row.weight_band] || shipping["200-500"] || 10;
  const pricing = calculatePrice(Number(row.cost_usd), shippingUsd);
  const social = buildSocial(row.id, pricing.sellPrice, pricing.discountPercent);

  return {
    id: String(row.id),
    pgId: row.id,
    cjPid: row.cj_pid,
    shopifyId: row.shopify_id ? String(row.shopify_id) : null,
    variantId: row.shopify_variant_id ? String(row.shopify_variant_id) : null,
    title: row.title_ro || row.title,
    titleEn: row.title,
    description: row.description || row.title_ro || row.title,
    benefits: ["Livrare rapidă în România", "Checkout securizat", "Produs verificat CJ"],
    price: pricing.sellPrice,
    oldPrice: pricing.oldPrice,
    discountPercent: pricing.discountPercent,
    costUsd: Number(row.cost_usd),
    ...social,
    images: row.main_image ? [row.main_image, ...(row.images || []).slice(0, 4)] : [],
    category: row.category || "General",
    vendor: "AICeVrei",
    tags: row.category || "",
    weightBand: row.weight_band,
    gradient: "from-orange-500 to-pink-500",
    qualityScore: Math.min(10, Math.max(7, Math.round(social.rating * 2))),
    socialProofLabel: social.orders > 300 ? `${social.orders}+ comenzi recente` : `${social.cartAdds} adăugări în coș`,
    commerceBadge: social.orders > 300 ? "🔥 Se vinde bine" : social.cartAdds > 20 ? "🛒 Hot în coș" : "⚡ Nou",
    dealLabel: pricing.discountPercent >= 20 ? "🔥 Super Deal" : pricing.discountPercent >= 10 ? "💰 Preț bun" : "✨ Nou",
  };
}

// ─── Search Products ──────────────────────────────────────────────
export type ProductFilters = {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "price_asc" | "price_desc" | "popular" | "newest" | "discount";
  mode?: "trending" | "feed" | "deals" | "default";
  limit?: number;
  offset?: number;
};

export async function searchProducts(filters: ProductFilters = {}) {
  const shipping = await getShippingRates();
  const { search, category, minPrice, maxPrice, sort, mode, limit = 50, offset = 0 } = filters;

  let where = ["main_image IS NOT NULL", "cost_usd > 0.5", "cost_usd < 500"];
  const params: any[] = [];
  let paramIdx = 1;

  if (search) {
    // Split multi-word queries into individual terms for better matching
    const terms = search.trim().split(/\s+/).filter(t => t.length >= 2);
    if (terms.length === 1) {
      where.push(`(title ILIKE $${paramIdx} OR category ILIKE $${paramIdx})`);
      params.push(`%${terms[0]}%`);
      paramIdx++;
    } else if (terms.length > 1) {
      // Each term must match in title OR category (AND between terms)
      const termClauses = terms.map(term => {
        const clause = `(title ILIKE $${paramIdx} OR category ILIKE $${paramIdx})`;
        params.push(`%${term}%`);
        paramIdx++;
        return clause;
      });
      where.push(`(${termClauses.join(" AND ")})`);
    }
  }

  if (category) {
    where.push(`category ILIKE $${paramIdx}`);
    params.push(`${category}%`);
    paramIdx++;
  }

  // Price filtering is done post-query since price is calculated
  let orderBy = "listed_count DESC, total_stock DESC";
  if (sort === "price_asc" || sort === "price_desc") orderBy = `cost_usd ${sort === "price_asc" ? "ASC" : "DESC"}`;
  if (sort === "newest") orderBy = "created_at DESC";
  if (sort === "popular" || mode === "trending") orderBy = "listed_count DESC, total_stock DESC";
  if (mode === "deals") orderBy = "cost_usd ASC";

  const sql = `SELECT id, cj_pid, cj_sku, title, title_ro, description, category, cost_usd, weight_band, 
    main_image, images, image_count, total_stock, listed_count, shopify_id, shopify_variant_id,
    pushed_to_shopify, created_at
    FROM products WHERE ${where.join(" AND ")} ORDER BY ${orderBy} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  params.push(Math.min(limit, 200), offset);

  const { rows } = await dbQuery(sql, params);
  let products = rows.map((r: any) => transformProduct(r, shipping));

  // Post-query price filtering
  if (minPrice != null) products = products.filter((p: any) => p.price >= minPrice);
  if (maxPrice != null) products = products.filter((p: any) => p.price <= maxPrice);

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM products WHERE ${where.join(" AND ")}`;
  const { rows: countRows } = await dbQuery(countSql, params.slice(0, -2));
  const total = parseInt(countRows[0]?.total || "0");

  return { products, total, offset, limit };
}

// ─── Get single product ─────────────────────────────────────────
export async function getProductById(pgId: number) {
  const shipping = await getShippingRates();
  const { rows } = await dbQuery(
    `SELECT * FROM products WHERE id = $1`, [pgId]
  );
  if (rows.length === 0) return null;
  return transformProduct(rows[0], shipping);
}

// ─── Get categories with counts ──────────────────────────────────
export async function getCategories() {
  const { rows } = await dbQuery(`
    SELECT SPLIT_PART(category, ' > ', 1) as name, COUNT(*) as count
    FROM products WHERE main_image IS NOT NULL AND cost_usd > 0.5
    GROUP BY SPLIT_PART(category, ' > ', 1)
    ORDER BY count DESC
  `);
  return rows.map((r: any) => ({ name: r.name, count: parseInt(r.count) }));
}

// ─── Get full category hierarchy ─────────────────────────────────
export type CategoryNode = {
  name: string;
  count: number;
  children: { name: string; count: number; children: { name: string; count: number }[] }[];
};

export async function getCategoryHierarchy(): Promise<CategoryNode[]> {
  const { rows } = await dbQuery(`
    SELECT category, COUNT(*) as cnt
    FROM products WHERE main_image IS NOT NULL AND cost_usd > 0.5
    GROUP BY category ORDER BY cnt DESC
  `);

  const tree = new Map<string, Map<string, Map<string, number>>>();
  const topCounts = new Map<string, number>();
  const midCounts = new Map<string, number>();

  for (const r of rows) {
    const parts = (r.category || "").split(" > ");
    const top = parts[0] || "Other";
    const mid = parts[1] || "General";
    const sub = parts[2] || "General";
    const cnt = parseInt(r.cnt);

    if (!tree.has(top)) tree.set(top, new Map());
    if (!tree.get(top)!.has(mid)) tree.get(top)!.set(mid, new Map());
    tree.get(top)!.get(mid)!.set(sub, (tree.get(top)!.get(mid)!.get(sub) || 0) + cnt);

    topCounts.set(top, (topCounts.get(top) || 0) + cnt);
    midCounts.set(`${top}>${mid}`, (midCounts.get(`${top}>${mid}`) || 0) + cnt);
  }

  const result: CategoryNode[] = [];
  for (const [topName, midMap] of [...tree.entries()].sort((a, b) =>
    (topCounts.get(b[0]) || 0) - (topCounts.get(a[0]) || 0)
  )) {
    const children = [...midMap.entries()]
      .sort((a, b) => {
        const aTotal = [...a[1].values()].reduce((s, v) => s + v, 0);
        const bTotal = [...b[1].values()].reduce((s, v) => s + v, 0);
        return bTotal - aTotal;
      })
      .map(([midName, subMap]) => ({
        name: midName,
        count: midCounts.get(`${topName}>${midName}`) || 0,
        children: [...subMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([subName, cnt]) => ({ name: subName, count: cnt })),
      }));

    result.push({ name: topName, count: topCounts.get(topName) || 0, children });
  }

  return result;
}
