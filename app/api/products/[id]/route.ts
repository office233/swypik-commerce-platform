/**
 * Product Detail API — Single product with all variants
 * GET /api/products/[id] → returns product + variants + filter data
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get product
    const { rows: products } = await dbQuery(
      `SELECT p.*, c.name as category_name, c.parent_id as parent_category_id
       FROM ae_products p
       LEFT JOIN ae_categories c ON c.ae_category_id = p.category_id
       WHERE p.ae_product_id = $1 OR p.id = $2`,
      [id, isNaN(Number(id)) ? 0 : Number(id)]
    );

    if (!products.length) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

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

    return NextResponse.json({
      product: {
        id: product.id,
        aeProductId: String(product.ae_product_id),
        title: product.title,
        titleRo: product.title_ro,
        description: product.description,
        price: product.price_ron,
        oldPrice: product.old_price_ron,
        minPriceUsd: Number(product.min_price_usd),
        images,
        video: product.video_url,
        hasVideo: product.has_video,
        rating: Number(product.rating),
        ratingCount: product.rating_count,
        ordersCount: product.orders_count,
        brand: product.brand,
        category: product.category_name,
        categoryId: product.category_id,
        // Shipping
        shipMethod: product.ship_method,
        shipCostUsd: Number(product.ship_cost_usd),
        shipFree: product.ship_free,
        shipDaysMin: product.ship_days_min,
        shipDaysMax: product.ship_days_max,
        shipTracking: product.ship_tracking,
        deliveryDate: product.delivery_date_desc,
        availableStock: product.available_stock,
        // Filters
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
        // Store
        storeName: product.store_name,
        storeRating: Number(product.store_rating),
      },
      variants: variants.map(v => ({
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
      similar: similar.map(s => ({
        id: String(s.ae_product_id),
        title: s.title,
        price: s.price_ron,
        oldPrice: s.old_price_ron,
        image: s.main_image,
        hasVideo: s.has_video,
        rating: Number(s.rating),
      })),
    });
  } catch (error: any) {
    console.error("[Product Detail API]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
