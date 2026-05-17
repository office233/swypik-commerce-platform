/**
 * Server-side product detail fetcher.
 * Uses marketplace_products as the primary read model and enriches from AE tables when available.
 */

import { dbQuery } from "@/lib/db";

export type ProductDetail = {
  product: {
    id: string;
    pgId: number | null;
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
    taxonomyNodeSlug: string | null;
    taxonomyPath: Array<{ slug: string; label: string }>;
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
    decoration: string[] | null;
    gender: string | null;
    storeName: string | null;
    storeRating: number;
    isEstimatedSocial: boolean;
  };
  variants: Array<{
    id: string;
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

const DETAIL_SELECT = `
  SELECT
    p.*,
    ap.id AS ae_internal_id,
    ap.ae_product_id,
    ap.title AS ae_title,
    ap.title_ro AS ae_title_ro,
    ap.product_type,
    ap.product_type_ro,
    ap.brand AS ae_brand,
    ap.min_price_usd,
    ap.video_url,
    ap.has_video,
    ap.rating,
    ap.rating_count,
    ap.orders_count,
    ap.ship_method,
    ap.ship_cost_usd,
    ap.ship_free,
    ap.ship_days_min,
    ap.ship_days_max,
    ap.ship_tracking,
    ap.delivery_date_desc,
    ap.available_stock,
    ap.neckline,
    ap.style,
    ap.fabric_type,
    ap.color,
    ap.colors,
    ap.sizes,
    ap.material,
    ap.pattern_type,
    ap.sleeve_style,
    ap.waistline,
    ap.season,
    ap.silhouette,
    ap.decoration,
    ap.gender,
    ap.store_name,
    ap.store_rating,
    ac.ae_category_id AS ae_category_id,
    ac.name AS ae_category_name,
    ac.name_ro AS ae_category_name_ro,
    ar.ae_category_id AS ae_root_category_id,
    ar.name AS ae_root_category_name,
    ar.name_ro AS ae_root_category_name_ro
  FROM marketplace_products p
  LEFT JOIN ae_products ap
    ON p.source_type = 'aliexpress'
   AND p.supplier_product_id IS NOT NULL
   AND ap.ae_product_id::text = p.supplier_product_id
  LEFT JOIN ae_categories ac ON ac.ae_category_id = ap.category_id
  LEFT JOIN ae_categories ar ON ar.ae_category_id = COALESCE(ac.parent_id, ac.ae_category_id)
`;

function metadataObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function firstBool(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value === "true") return true;
      if (value === "false") return false;
    }
    if (typeof value === "number") return value > 0;
  }
  return false;
}

function cleanCategory(value: unknown, fallback = "General") {
  const label = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!label) return fallback;
  if (/^AE-\d+$/i.test(label)) return fallback;
  if (/^\d{6,}$/.test(label)) return fallback;
  return label;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
  return items.length > 0 ? items : null;
}

function buildImages(row: any, metadata: Record<string, any>) {
  const result: string[] = [];
  if (typeof row.image_url === "string" && row.image_url) result.push(row.image_url);

  const metadataImages = Array.isArray(metadata.images) ? metadata.images : [];
  for (const image of metadataImages) {
    if (typeof image === "string" && image && !result.includes(image)) result.push(image);
  }

  const aeImages = Array.isArray(metadata.ae_images) ? metadata.ae_images : [];
  for (const image of aeImages) {
    if (typeof image === "string" && image && !result.includes(image)) result.push(image);
  }

  return result.slice(0, 8);
}

export async function getProductDetail(id: string): Promise<ProductDetail | null> {
  const numericId = Number(id);
  const legacyAeInternalId = Number.isInteger(numericId) && numericId > 0 && numericId < 2147483647 ? numericId : null;

  const { rows } = await dbQuery(
    `
      ${DETAIL_SELECT}
      WHERE p.status = 'active'
        AND (
          p.id::text = $1
          OR p.supplier_product_id = $1
          OR p.external_product_id = $1
          OR ($2::int IS NOT NULL AND ap.id = $2)
        )
      ORDER BY
        CASE
          WHEN p.id::text = $1 THEN 0
          WHEN p.supplier_product_id = $1 THEN 1
          WHEN p.external_product_id = $1 THEN 2
          WHEN ($2::int IS NOT NULL AND ap.id = $2) THEN 3
          ELSE 4
        END
      LIMIT 1
    `,
    [id, legacyAeInternalId],
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  const metadata = metadataObject(row.metadata);
  const attrs = metadataObject(metadata.attributes);
  const shipping = metadataObject(metadata.shipping);
  const store = metadataObject(metadata.store);

  const images = buildImages(row, metadata);
  const titleRo = firstString(row.ae_title_ro, metadata.title_ro, row.title);
  const titleEn = firstString(row.ae_title, metadata.title_en, row.title) || row.title;
  const title = titleRo || titleEn;

  const category = cleanCategory(
    firstString(
      metadata.product_type_ro,
      row.product_type_ro,
      metadata.product_type,
      row.product_type,
      metadata.ae_category_name_ro,
      row.ae_category_name_ro,
      metadata.ae_category_name,
      row.ae_category_name,
      row.category,
      metadata.ae_root_category_name_ro,
      row.ae_root_category_name_ro,
      metadata.ae_root_category_name,
      row.ae_root_category_name,
    ),
  );

  const categoryId = firstNumber(metadata.ae_category_id, row.ae_category_id, metadata.ae_root_category_id, row.ae_root_category_id);
  const priceCents = firstNumber(row.price_cents, 0) || 0;
  const compareAtCents = firstNumber(row.compare_at_price_cents, 0) || 0;
  const rating = firstNumber(metadata.rating, row.rating);
  const ordersCount = firstNumber(metadata.orders_count, row.orders_count);
  const ratingCount = firstNumber(metadata.rating_count, row.rating_count);
  const storeRating = firstNumber(store.rating, row.store_rating, metadata.store_rating, 0) || 0;
  const hasRealOrders = ordersCount !== null && ordersCount > 0;

  const { rows: variantRows } = await dbQuery(
    `
      SELECT
        id::text AS id,
        COALESCE(sku, metadata->>'sku_id', external_variant_id, id::text) AS sku_id,
        COALESCE(title, '') AS title,
        price_cents,
        inventory_quantity,
        attributes,
        metadata,
        status
      FROM marketplace_product_variants
      WHERE product_id = $1
        AND status IN ('active', 'out_of_stock')
      ORDER BY
        COALESCE(attributes->>'color', ''),
        COALESCE(attributes->>'size', ''),
        created_at
    `,
    [row.id],
  );

  const colorMap: Record<string, { image: string | null; sizes: Array<{ size: string; price: number; stock: number; skuId: string }> }> = {};
  const variants = variantRows.map((variant: any) => {
    const variantAttrs = metadataObject(variant.attributes);
    const variantMeta = metadataObject(variant.metadata);
    const color = firstString(variantAttrs.color, variantMeta.color);
    const size = firstString(variantAttrs.size, variantMeta.size);
    const image = firstString(variantAttrs.image_url, variantMeta.image_url);
    const stock = firstNumber(variant.inventory_quantity, 0) || 0;
    const priceRon = (firstNumber(variant.price_cents, priceCents) || priceCents) / 100;
    const skuId = String(variant.sku_id);
    const name = firstString(variant.title, [color, size].filter(Boolean).join(" / "), title) || title;

    if (color) {
      if (!colorMap[color]) {
        colorMap[color] = { image, sizes: [] };
      }
      if (size) {
        colorMap[color].sizes.push({
          size,
          price: priceRon,
          stock,
          skuId,
        });
      }
    }

    return {
      id: String(variant.id),
      skuId,
      name,
      priceRon,
      priceUsd: firstNumber(variantMeta.price_usd, metadata.min_price_usd, row.min_price_usd, 0) || 0,
      image,
      stock,
      color,
      size,
    };
  });

  const similarCategoryId = String(firstString(metadata.ae_root_category_id, row.ae_root_category_id, metadata.ae_category_id, row.ae_category_id) || "");
  const { rows: similarRows } = await dbQuery(
    `
      ${DETAIL_SELECT}
      WHERE p.status = 'active'
        AND p.id <> $1
        AND (
          COALESCE(p.metadata->>'ae_root_category_id', p.metadata->>'ae_category_id', '') = $2
          OR COALESCE(p.metadata->>'ae_category_id', '') = $2
          OR p.category = $3
        )
      ORDER BY
        COALESCE(NULLIF(p.metadata->>'orders_count', '')::int, ap.orders_count, 0) DESC,
        COALESCE(NULLIF(p.metadata->>'rating', '')::numeric, ap.rating, 0) DESC,
        p.updated_at DESC
      LIMIT 8
    `,
    [row.id, similarCategoryId, row.category || category],
  );

  let taxonomyPath: Array<{ slug: string; label: string }> = [];
  const taxonomyNodeSlug = typeof row.taxonomy_node_slug === "string" && row.taxonomy_node_slug ? row.taxonomy_node_slug : null;
  if (taxonomyNodeSlug) {
    try {
      const { rows: pathRows } = await dbQuery(
        `WITH RECURSIVE chain AS (
           SELECT slug, parent_slug, 0 AS depth FROM taxonomy_nodes WHERE slug = $1
           UNION ALL
           SELECT n.slug, n.parent_slug, c.depth + 1 FROM taxonomy_nodes n JOIN chain c ON n.slug = c.parent_slug
         )
         SELECT c.slug, COALESCE(t.label, c.slug) AS label
         FROM chain c
         LEFT JOIN taxonomy_translations t ON t.node_slug = c.slug AND t.locale = 'ro'
         ORDER BY c.depth DESC`,
        [taxonomyNodeSlug]
      );
      taxonomyPath = pathRows.map((r: any) => ({ slug: String(r.slug), label: String(r.label) }));
    } catch (_) {
      taxonomyPath = [];
    }
  }

  return {
    product: {
      id: String(row.id),
      pgId: firstNumber(row.ae_internal_id),
      aeProductId: String(firstString(row.supplier_product_id, row.external_product_id, row.ae_product_id, row.id) || row.id),
      title,
      titleRo,
      titleEn,
      description: row.description,
      price: priceCents / 100,
      oldPrice: compareAtCents > 0 ? compareAtCents / 100 : null,
      minPriceUsd: firstNumber(metadata.min_price_usd, row.min_price_usd, 0) || 0,
      images,
      video: firstString(metadata.video_url, row.video_url),
      hasVideo: firstBool(metadata.has_video, row.has_video, false),
      rating: rating !== null && rating > 0 ? rating : null,
      ratingCount,
      ordersCount: hasRealOrders ? ordersCount : null,
      brand: firstString(row.brand, row.ae_brand),
      category,
      categoryId,
      taxonomyNodeSlug,
      taxonomyPath,
      shipMethod: firstString(shipping.method, row.ship_method),
      shipCostUsd: firstNumber(shipping.cost_usd, row.ship_cost_usd, 0) || 0,
      shipFree: firstBool(shipping.free, row.ship_free, false),
      shipDaysMin: firstNumber(shipping.days_min, row.ship_days_min),
      shipDaysMax: firstNumber(shipping.days_max, row.ship_days_max),
      shipTracking: firstBool(shipping.tracking, row.ship_tracking, false),
      deliveryDate: firstString(shipping.delivery_date_desc, row.delivery_date_desc),
      availableStock: firstNumber(metadata.available_stock, row.available_stock),
      color: firstString(attrs.color, row.color),
      colors: asStringArray(attrs.colors) || asStringArray(row.colors),
      sizes: asStringArray(attrs.sizes) || asStringArray(row.sizes),
      neckline: firstString(attrs.neckline, row.neckline),
      style: firstString(attrs.style, row.style),
      fabricType: firstString(attrs.fabric_type, row.fabric_type),
      material: firstString(attrs.material, row.material),
      patternType: firstString(attrs.pattern_type, row.pattern_type),
      sleeveStyle: firstString(attrs.sleeve_style, row.sleeve_style),
      waistline: firstString(attrs.waistline, row.waistline),
      season: firstString(attrs.season, row.season),
      silhouette: firstString(attrs.silhouette, row.silhouette),
      decoration: asStringArray(attrs.decoration) || asStringArray(row.decoration),
      gender: firstString(attrs.gender, row.gender),
      storeName: firstString(store.name, row.store_name),
      storeRating,
      isEstimatedSocial: !hasRealOrders,
    },
    variants,
    colorMap,
    similar: similarRows
      .map((similarRow: any) => {
        const similarMetadata = metadataObject(similarRow.metadata);
        const similarPriceCents = firstNumber(similarRow.price_cents, 0) || 0;
        const similarCompareAtCents = firstNumber(similarRow.compare_at_price_cents, 0) || 0;
        return {
          id: String(firstNumber(similarRow.ae_internal_id) || similarRow.id),
          title: String(firstString(similarRow.ae_title_ro, similarMetadata.title_ro, similarRow.title) || similarRow.title),
          price: similarPriceCents / 100,
          oldPrice: similarCompareAtCents > 0 ? similarCompareAtCents / 100 : Math.round((similarPriceCents / 100) * 1.3),
          image: String(firstString(similarRow.image_url, ...(Array.isArray(similarMetadata.images) ? similarMetadata.images : [])) || ""),
          hasVideo: firstBool(similarMetadata.has_video, similarRow.has_video, false),
          rating: firstNumber(similarMetadata.rating, similarRow.rating, 0) || 0,
        };
      })
      .filter((item) => item.image),
  };
}
