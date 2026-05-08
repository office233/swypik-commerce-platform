/**
 * Product Queries — AliExpress direct, reads from ae_products + ae_categories
 * Pricing is PRE-CALCULATED in DB (price_ron, old_price_ron)
 */

import { dbQuery } from "@/lib/db";

// ─── Transform DB row → frontend ChatProduct ──────────────────────
function transformProduct(row: any) {
  const price = Number(row.price_ron) || 29;
  const oldPrice = Number(row.old_price_ron) || Math.round(price * 1.5);
  const discountPercent = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;

  // Deterministic social proof from product id
  const seed = Math.abs(hashCode(`ae_${row.ae_product_id}`));
  const orders = Number(row.orders_count) || (38 + (seed % 380));
  const rating = Number(row.rating) || Math.min(5, Math.max(4.3, 4.45 + ((seed % 45) / 100)));
  const deliveryDays = row.ship_days_min || (2 + (seed % 4));
  const viewers = 7 + (seed % 25);
  const cartAdds = Math.max(3, Math.round(orders * 0.14));

  // Build images array
  const images: string[] = [];
  if (row.main_image) images.push(row.main_image);
  if (row.images && Array.isArray(row.images)) {
    images.push(...row.images.filter((img: string) => img && img !== row.main_image).slice(0, 5));
  }

  return {
    id: String(row.id),
    pgId: row.id,
    aeProductId: String(row.ae_product_id),
    variantId: null,
    title: row.title_ro || row.title,
    titleEn: row.title,
    description: row.description ? row.description.replace(/<[^>]*>/g, " ").trim().substring(0, 200) : (row.title_ro || row.title),
    benefits: ["Livrare rapidă în România", "Checkout securizat", "Produs verificat"],
    price,
    oldPrice,
    discountPercent,
    costUsd: Number(row.min_price_usd),
    rating: Number(rating.toFixed(1)),
    orders,
    deliveryDays,
    viewers,
    cartAdds,
    images,
    video: row.video_url || null,
    hasVideo: row.has_video || false,
    category: row.category_name || "General",
    categoryId: row.category_id,
    vendor: row.store_name || "AICeVrei",
    tags: row.category_name || "",
    gradient: "from-orange-500 to-pink-500",
    qualityScore: Math.min(10, Math.max(7, Math.round(rating * 2))),
    shipFree: row.ship_free || false,
    shipMethod: row.ship_method || "",
    shipDaysMin: row.ship_days_min,
    shipDaysMax: row.ship_days_max,
    socialProofLabel: orders > 500 ? `${orders}+ comenzi` : orders > 100 ? `${orders}+ vândute` : null,
    commerceBadge: orders > 500 ? "🔥 Se vinde bine"
      : rating >= 4.8 && orders > 100 ? "⭐ Alegere sigură"
      : discountPercent >= 30 ? "💰 Super reducere"
      : cartAdds > 30 ? "🛒 Hot în coș"
      : null,
    dealLabel: discountPercent >= 20 ? "🔥 Super Deal" : discountPercent >= 10 ? "💰 Preț bun" : "✨ Nou",
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ─── Search Products ──────────────────────────────────────────────
export type ProductFilters = {
  search?: string;
  category?: string;
  categoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: "price_asc" | "price_desc" | "popular" | "newest" | "discount";
  mode?: "trending" | "feed" | "deals" | "default" | "video";
  limit?: number;
  offset?: number;
};

export async function searchProducts(filters: ProductFilters = {}) {
  const { search, category, categoryId, minPrice, maxPrice, sort, mode, limit = 50, offset = 0 } = filters;

  let where = ["p.main_image IS NOT NULL", "p.min_price_usd > 0.1"];
  const params: any[] = [];
  let paramIdx = 1;

  if (search) {
    const terms = search.trim().split(/\s+/).filter(t => t.length >= 2);
    if (terms.length === 1) {
      where.push(`(p.title ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx})`);
      params.push(`%${terms[0]}%`);
      paramIdx++;
    } else if (terms.length > 1) {
      const termClauses = terms.map(term => {
        const clause = `(p.title ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx})`;
        params.push(`%${term}%`);
        paramIdx++;
        return clause;
      });
      where.push(`(${termClauses.join(" AND ")})`);
    }
  }

  if (categoryId) {
    // Include products from this category AND all subcategories
    where.push(`(p.category_id = $${paramIdx} OR p.category_id IN (SELECT ae_category_id FROM ae_categories WHERE parent_id = $${paramIdx}))`);
    params.push(categoryId);
    paramIdx++;
  } else if (category) {
    where.push(`(c.name ILIKE $${paramIdx} OR c.name_ro ILIKE $${paramIdx} OR c.ae_category_id IN (SELECT ae_category_id FROM ae_categories WHERE parent_id IN (SELECT ae_category_id FROM ae_categories WHERE name ILIKE $${paramIdx} OR name_ro ILIKE $${paramIdx})))`);
    params.push(`%${category}%`);
    paramIdx++;
  }

  if (minPrice != null) {
    where.push(`p.price_ron >= $${paramIdx}`);
    params.push(minPrice);
    paramIdx++;
  }
  if (maxPrice != null) {
    where.push(`p.price_ron <= $${paramIdx}`);
    params.push(maxPrice);
    paramIdx++;
  }

  if (mode === "video") {
    where.push("p.has_video = true");
  }

  let orderBy = "p.orders_count DESC NULLS LAST, p.rating DESC NULLS LAST";
  if (sort === "price_asc") orderBy = "p.price_ron ASC";
  if (sort === "price_desc") orderBy = "p.price_ron DESC";
  if (sort === "newest") orderBy = "p.created_at DESC";
  if (sort === "popular" || mode === "trending") orderBy = "p.orders_count DESC NULLS LAST";
  if (mode === "deals") orderBy = "p.price_ron ASC";
  if (mode === "feed") orderBy = "p.has_video DESC, p.orders_count DESC NULLS LAST";

  const sql = `
    SELECT p.id, p.ae_product_id, p.title, p.title_ro, p.description,
      p.min_price_usd, p.max_price_usd, p.price_ron, p.old_price_ron,
      p.main_image, p.images, p.video_url, p.has_video,
      p.rating, p.rating_count, p.orders_count,
      p.brand, p.ship_method, p.ship_cost_usd, p.ship_free,
      p.ship_days_min, p.ship_days_max, p.ship_tracking,
      p.store_name, p.store_rating, p.variants_count,
      p.category_id, c.name as category_name, p.source_url, p.created_at
    FROM ae_products p
    LEFT JOIN ae_categories c ON c.ae_category_id = p.category_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  params.push(Math.min(limit, 200), offset);

  const { rows } = await dbQuery(sql, params);
  const products = rows.map((r: any) => transformProduct(r));

  // Get total count
  const countSql = `
    SELECT COUNT(*) as total
    FROM ae_products p
    LEFT JOIN ae_categories c ON c.ae_category_id = p.category_id
    WHERE ${where.join(" AND ")}`;
  const { rows: countRows } = await dbQuery(countSql, params.slice(0, -2));
  const total = parseInt(countRows[0]?.total || "0");

  return { products, total, offset, limit };
}

// ─── Get single product ─────────────────────────────────────────
export async function getProductById(pgId: number) {
  const { rows } = await dbQuery(
    `SELECT p.*, c.name as category_name
     FROM ae_products p
     LEFT JOIN ae_categories c ON c.ae_category_id = p.category_id
     WHERE p.id = $1`, [pgId]
  );
  if (rows.length === 0) return null;
  return transformProduct(rows[0]);
}

// ─── Get product by AliExpress ID ────────────────────────────────
export async function getProductByAeId(aeProductId: string) {
  const { rows } = await dbQuery(
    `SELECT p.*, c.name as category_name
     FROM ae_products p
     LEFT JOIN ae_categories c ON c.ae_category_id = p.category_id
     WHERE p.ae_product_id = $1`, [aeProductId]
  );
  if (rows.length === 0) return null;
  return transformProduct(rows[0]);
}

// ─── Get categories with counts ──────────────────────────────────
export async function getCategories() {
  const { rows } = await dbQuery(`
    SELECT c.ae_category_id, c.name, c.name_ro, c.level,
      COALESCE(direct.cnt, 0) + COALESCE(child.cnt, 0) as count
    FROM ae_categories c
    LEFT JOIN (
      SELECT category_id, COUNT(*) as cnt FROM ae_products GROUP BY category_id
    ) direct ON direct.category_id = c.ae_category_id
    LEFT JOIN (
      SELECT sub.parent_id, SUM(pc.cnt) as cnt
      FROM ae_categories sub
      JOIN (SELECT category_id, COUNT(*) as cnt FROM ae_products GROUP BY category_id) pc
        ON pc.category_id = sub.ae_category_id
      WHERE sub.parent_id IS NOT NULL
      GROUP BY sub.parent_id
    ) child ON child.parent_id = c.ae_category_id
    WHERE c.level = 1 AND c.is_active = true
    ORDER BY count DESC, c.name ASC
  `);
  return rows.map((r: any) => ({
    id: r.ae_category_id,
    name: r.name_ro || r.name,
    nameEn: r.name,
    count: parseInt(r.count),
  }));
}

// ─── Get full category hierarchy ─────────────────────────────────
export type CategoryNode = {
  id: number;
  name: string;
  nameEn: string;
  count: number;
  children: { id: number; name: string; nameEn: string; count: number }[];
};

export async function getCategoryHierarchy(): Promise<CategoryNode[]> {
  // Get all active categories with product counts
  const { rows } = await dbQuery(`
    SELECT c.ae_category_id, c.name, c.name_ro, c.level, c.parent_id,
      COALESCE(p.cnt, 0) as product_count
    FROM ae_categories c
    LEFT JOIN (
      SELECT category_id, COUNT(*) as cnt FROM ae_products GROUP BY category_id
    ) p ON p.category_id = c.ae_category_id
    WHERE c.is_active = true
    ORDER BY c.level, c.name
  `);

  // Build tree
  const roots = rows.filter((r: any) => r.level === 1);
  const children = rows.filter((r: any) => r.level === 2);

  const result: CategoryNode[] = roots.map((root: any) => {
    const subs = children
      .filter((c: any) => c.parent_id === root.ae_category_id)
      .map((c: any) => ({
        id: c.ae_category_id,
        name: c.name_ro || c.name,
        nameEn: c.name,
        count: parseInt(c.product_count),
      }));

    // Total count = sum of children counts
    const totalCount = subs.reduce((sum: number, s: any) => sum + s.count, 0);

    return {
      id: root.ae_category_id,
      name: root.name_ro || root.name,
      nameEn: root.name,
      count: totalCount,
      children: subs,
    };
  });

  // Sort by count descending
  return result.sort((a, b) => b.count - a.count);
}
