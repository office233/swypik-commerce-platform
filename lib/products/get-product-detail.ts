/**
 * Server-side product detail fetcher
 * Used by app/product/[id]/page.tsx server component
 * to avoid double fetch (once for SEO/JSON-LD, once client-side).
 */

import { dbQuery } from "@/lib/db";

export type ProductDetail = {
  product: {
    id: number;
    aeProductId: string;
    title: string;
    titleRo: string | null;
    titleEn: string;
    description: string | null;
    price: number;
    oldPrice: number | null;
    minPriceUsd: number;
    images: string[];
    video: string | null;
    hasVideo: boolean;
    rating: number | null;
    ratingCount: number | null;
    ordersCount: number | null;
    brand: string | null;
    category: string | null;
    categoryId: number | null;
    shipMethod: string | null;
    shipCostUsd: number;
    shipFree: boolean;
    shipDaysMin: number | null;
    shipDaysMax: number | null;
    shipTracking: boolean;
    deliveryDate: string | null;
    availableStock: number | null;
    color: string | null;
    colors: string[] | null;
    sizes: string[] | null;
    neckline: string | null;
    style: string | null;
    fabricType: string | null;
    material: string | null;
    patternType: string | null;
    sleeveStyle: string | null;
    waistline: string | null;
    season: string | null;
    silhouette: string | null;
    decoration: string | null;
    gender: string | null;
    storeName: string | null;
    storeRating: number;
    isEstimatedSocial: boolean;
  };
  variants: Array<{
    id: number;
    skuId: string;
    name: string;
    priceRon: number;
    priceUsd: number;
    image: string | null;
    stock: number;
    color: string | null;
    size: string | null;
  }>;
  colorMap: Record<string, { image: string | null; sizes: Array<{ size: string; price: number; stock: number; skuId: string }> }>;
  similar: Array<{
    id: string;
    title: string;
    price: number;
    oldPrice: number;
    image: string;
    hasVideo: boolean;
    rating: number;
  }>;
};

export async function getProductDetail(id: string): Promise<ProductDetail | null> {
  const numId = Number(id);
  const isInternalId = !isNaN(numId) && numId < 2147483647;

  const { rows: products } = await dbQuery(
    isInternalId
      ? `SELECT p.*, c.name as category_name, c.parent_id as parent_category_id
         FROM ae_products p
         LEFT JOIN ae_categories c ON c.ae_category_id = p.category_id
         WHERE p.ae_product_id = $1 OR p.id = $2`
      : `SELECT p.*, c.name as category_name, c.parent_id as parent_category_id
         FROM ae_products p
         LEFT JOIN ae_categories c ON c.ae_category_id = p.category_id
         WHERE p.ae_product_id = $1`,
    isInternalId ? [id, numId] : [id]
  );

  if (!products.length) return null;

  const product = products[0];

  // Get variants
  const { rows: variants } = await dbQuery(
    `SELECT id, sku_id, price_usd, original_price_usd, price_ron, 
            variant_name, variant_image, stock, color, size, properties
     FROM ae_variants 
     WHERE product_id = $1 
     ORDER BY color, size`,
    [product.ae_product_id]
  );

  // Build structured color/size data
  const colorMap: Record<string, { image: string | null; sizes: { size: string; price: number; stock: number; skuId: string }[] }> = {};
  for (const v of variants) {
    const color = v.color || "Default";
    if (!colorMap[color]) {
      colorMap[color] = { image: v.variant_image, sizes: [] };
    }
    if (v.size) {
      colorMap[color].sizes.push({
        size: v.size,
        price: v.price_ron,
        stock: v.stock || 0,
        skuId: v.sku_id,
      });
    }
  }

  // Build images array
  const images: string[] = [];
  if (product.main_image) images.push(product.main_image);
  if (product.images && Array.isArray(product.images)) {
    images.push(...product.images.filter((img: string) => img && img !== product.main_image).slice(0, 8));
  }

  // Similar products
  const { rows: similar } = await dbQuery(
    `SELECT ae_product_id, title, price_ron, old_price_ron, main_image, has_video, rating
     FROM ae_products 
     WHERE category_id = $1 AND ae_product_id != $2 AND main_image IS NOT NULL
     ORDER BY orders_count DESC LIMIT 8`,
    [product.category_id, product.ae_product_id]
  );

  // Determine if social data is estimated
  const hasRealOrders = product.orders_count != null && Number(product.orders_count) > 0;
  const hasRealRating = product.rating != null && Number(product.rating) > 0;
  const isEstimatedSocial = !hasRealOrders;

  return {
    product: {
      id: product.id,
      aeProductId: String(product.ae_product_id),
      title: product.title_ro || product.title,
      titleRo: product.title_ro,
      titleEn: product.title,
      description: product.description,
      price: product.price_ron,
      oldPrice: product.old_price_ron,
      minPriceUsd: Number(product.min_price_usd),
      images,
      video: product.video_url,
      hasVideo: product.has_video,
      rating: hasRealRating ? Number(product.rating) : null,
      ratingCount: product.rating_count,
      ordersCount: hasRealOrders ? product.orders_count : null,
      brand: product.brand,
      category: product.category_name,
      categoryId: product.category_id,
      shipMethod: product.ship_method,
      shipCostUsd: Number(product.ship_cost_usd),
      shipFree: product.ship_free,
      shipDaysMin: product.ship_days_min,
      shipDaysMax: product.ship_days_max,
      shipTracking: product.ship_tracking,
      deliveryDate: product.delivery_date_desc,
      availableStock: product.available_stock,
      color: product.color,
      colors: product.colors,
      sizes: product.sizes,
      neckline: product.neckline,
      style: product.style,
      fabricType: product.fabric_type,
      material: product.material,
      patternType: product.pattern_type,
      sleeveStyle: product.sleeve_style,
      waistline: product.waistline,
      season: product.season,
      silhouette: product.silhouette,
      decoration: product.decoration,
      gender: product.gender,
      storeName: product.store_name,
      storeRating: Number(product.store_rating),
      isEstimatedSocial,
    },
    variants: variants.map((v: any) => ({
      id: v.id,
      skuId: v.sku_id,
      name: v.variant_name,
      priceRon: v.price_ron,
      priceUsd: Number(v.price_usd),
      image: v.variant_image,
      stock: v.stock || 0,
      color: v.color,
      size: v.size,
    })),
    colorMap,
    similar: similar.map((s: any) => ({
      id: String(s.ae_product_id),
      title: s.title,
      price: s.price_ron,
      oldPrice: s.old_price_ron,
      image: s.main_image,
      hasVideo: s.has_video,
      rating: Number(s.rating),
    })),
  };
}
