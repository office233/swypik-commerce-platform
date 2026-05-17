import { dbQuery } from "@/lib/db";
import { buildScopedTagId, parseScopedTagFilter } from "@/lib/db/category-filter-utils";

export type ProductFilters = {
  search?: string;
  category?: string;
  categoryId?: string;
  taxonomyNodeSlug?: string;
  tag?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "price_asc" | "price_desc" | "popular" | "newest" | "discount";
  mode?: "trending" | "feed" | "deals" | "default" | "video" | "bestvalue" | "toprated";
  limit?: number;
  offset?: number;
  excludeIds?: string[];
  seed?: number;
  locale?: string;
  includeCount?: boolean;
};

const BASE_PRODUCT_SELECT = `
  FROM marketplace_products p
  LEFT JOIN ae_products ap
    ON p.source_type = 'aliexpress'
   AND p.supplier_product_id IS NOT NULL
   AND ap.ae_product_id::text = p.supplier_product_id
  LEFT JOIN ae_categories ac ON ac.ae_category_id = ap.category_id
  LEFT JOIN ae_categories ar ON ar.ae_category_id = COALESCE(ac.parent_id, ac.ae_category_id)
`;

const BASE_PRODUCT_COLUMNS = `
  SELECT
    p.*,
    ap.id AS ae_internal_id,
    ap.ae_product_id AS ae_product_id,
    ap.title AS ae_title,
    ap.title_ro AS ae_title_ro,
    ap.product_type AS ae_product_type,
    ap.product_type_ro AS ae_product_type_ro,
    ap.orders_count AS ae_orders_count,
    ap.rating AS ae_rating,
    ap.ship_days_min AS ae_ship_days_min,
    ap.ship_days_max AS ae_ship_days_max,
    ap.ship_cost_usd AS ae_ship_cost_usd,
    ap.ship_free AS ae_ship_free,
    ap.video_url AS ae_video_url,
    ap.has_video AS ae_has_video,
    ap.store_name AS ae_store_name,
    ac.ae_category_id AS ae_category_id,
    ac.name AS ae_category_name,
    ac.name_ro AS ae_category_name_ro,
    ar.ae_category_id AS ae_root_id,
    ar.name AS ae_root_name,
    ar.name_ro AS ae_root_name_ro
`;

const ORDERS_SQL = `COALESCE(NULLIF(p.metadata->>'orders_count', '')::int, ap.orders_count, 0)`;
const RATING_SQL = `COALESCE(NULLIF(p.metadata->>'rating', '')::numeric, ap.rating, 0)`;
const VIDEO_SQL = `COALESCE((p.metadata->>'has_video')::boolean, ap.has_video, false)`;
const DISCOUNT_SQL = `GREATEST(COALESCE(p.compare_at_price_cents, 0) - COALESCE(p.price_cents, 0), 0)`;
const ROOT_CATEGORY_ID_SQL = `COALESCE(NULLIF(p.metadata->>'ae_root_category_id', ''), ar.ae_category_id::text, NULLIF(p.metadata->>'ae_category_id', ''), ac.ae_category_id::text, '')`;
const ACTUAL_ROOT_CATEGORY_ID_SQL = `COALESCE(NULLIF(p.metadata->>'ae_root_category_id', ''), ar.ae_category_id::text, '')`;
const PRODUCT_TYPE_SQL = `COALESCE(NULLIF(p.metadata->>'product_type', ''), ap.product_type)`;

function cleanCategoryLabel(value: unknown, fallback = "General") {
  const label = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!label) return fallback;
  if (/^AE-\d+$/i.test(label)) return fallback;
  if (/^\d{6,}$/.test(label)) return fallback;
  return label;
}

function cleanCategoryId(value: unknown, fallback = "") {
  const id = String(value ?? "").trim();
  if (!id) return fallback;
  if (/^AE-\d+$/i.test(id)) return fallback;
  return id;
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return undefined;
}

function toNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function toBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value === "true") return true;
      if (value === "false") return false;
    }
    if (typeof value === "number") return value > 0;
  }
  return undefined;
}

function getMetadataValue(metadata: any, path: string) {
  return path.split(".").reduce((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return acc[key];
    }
    return undefined;
  }, metadata);
}

function hashCode(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function buildImages(row: any, metadata: any) {
  const images: string[] = [];
  if (row.image_url) images.push(row.image_url);
  const extraImages = Array.isArray(metadata?.images) ? metadata.images : [];
  for (const image of extraImages) {
    if (typeof image === "string" && image && image !== row.image_url) {
      images.push(image);
    }
  }
  return images.slice(0, 6);
}

function chooseLocalizedLabel(
  locale: string,
  roCandidates: unknown[],
  enCandidates: unknown[],
  fallback = "General",
) {
  const selected = locale === "ro" ? firstNonEmpty(...roCandidates) : firstNonEmpty(...enCandidates);
  return cleanCategoryLabel(selected, fallback);
}

function transformProduct(row: any, locale = "ro") {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const rawPriceCents = Number(row.price_cents);
  const hasValidPrice = Number.isFinite(rawPriceCents) && rawPriceCents > 0;
  const price = hasValidPrice ? rawPriceCents / 100 : 29;
  const oldPriceCents = Number(row.compare_at_price_cents) || 0;
  const oldPrice = oldPriceCents > 0 ? oldPriceCents / 100 : Math.round(price * 1.5);
  const discountPercent = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const seed = hashCode(`mp_${row.id}`);

  const title = locale === "ro"
    ? String(firstNonEmpty(row.ae_title_ro, metadata.title_ro, row.title) || row.title)
    : String(firstNonEmpty(row.ae_title, metadata.title_en, row.title) || row.title);

  const rootCategory = chooseLocalizedLabel(
    locale,
    [metadata.ae_root_category_name_ro, row.ae_root_name_ro, row.category, metadata.ae_root_category_name],
    [metadata.ae_root_category_name, row.ae_root_name, row.category, metadata.ae_root_category_name_ro],
  );

  const leafCategory = chooseLocalizedLabel(
    locale,
    [metadata.ae_category_name_ro, row.ae_category_name_ro, row.category, metadata.ae_category_name, rootCategory],
    [metadata.ae_category_name, row.ae_category_name, row.category, metadata.ae_category_name_ro, rootCategory],
    rootCategory,
  );

  const productType = chooseLocalizedLabel(
    locale,
    [metadata.product_type_ro, row.ae_product_type_ro, metadata.product_type, row.ae_product_type, leafCategory],
    [metadata.product_type, row.ae_product_type, metadata.product_type_ro, row.ae_product_type_ro, leafCategory],
    leafCategory,
  );

  const category = cleanCategoryLabel(firstNonEmpty(productType, row.category, leafCategory, rootCategory), rootCategory);
  const categoryId = toNumber(metadata.ae_category_id, row.ae_category_id, metadata.ae_root_category_id, row.ae_root_id);
  const orders = toNumber(metadata.orders_count, row.ae_orders_count, 0) || 0;
  const rating = Number((toNumber(metadata.rating, row.ae_rating, 4.5) || 4.5).toFixed(1));
  const deliveryDays = toNumber(
    getMetadataValue(metadata, "shipping.days_min"),
    metadata.ship_days_min,
    row.ae_ship_days_min,
    7,
  ) || 7;
  const images = buildImages(row, metadata);
  const vendor = String(
    firstNonEmpty(
      getMetadataValue(metadata, "store.name"),
      metadata.store_name,
      row.ae_store_name,
      row.brand,
      "Swypik",
    ) || "Swypik",
  );
  const shipCostUsd = toNumber(
    getMetadataValue(metadata, "shipping.cost_usd"),
    metadata.ship_cost_usd,
    row.ae_ship_cost_usd,
    0,
  ) || 0;
  const shipFree = toBoolean(
    getMetadataValue(metadata, "shipping.free"),
    metadata.ship_free,
    row.ae_ship_free,
    shipCostUsd === 0,
  ) || false;
  const video = firstNonEmpty(metadata.video_url, row.ae_video_url);
  const hasVideo = toBoolean(metadata.has_video, row.ae_has_video, Boolean(metadata.video_url || row.ae_video_url)) || false;

  return {
    id: String(row.id),
    pgId: toNumber(row.ae_internal_id),
    aeProductId: String(firstNonEmpty(row.supplier_product_id, row.external_product_id, row.ae_product_id, row.id)),
    title,
    titleEn: String(firstNonEmpty(row.ae_title, row.title, title) || title),
    description: row.description ? row.description.replace(/<[^>]*>/g, " ").trim().substring(0, 200) : title,
    benefits: ["Livrare rapida in Romania", "Checkout securizat", "Produs verificat"],
    whyBuy: "",
    warnings: [] as string[],
    price,
    oldPrice,
    discountPercent,
    costUsd: shipCostUsd,
    rating,
    orders,
    deliveryDays,
    viewers: 7 + (seed % 25),
    cartAdds: Math.max(3, Math.round(Math.max(orders, 20) * 0.14)),
    hasValidPrice,
    images,
    video: typeof video === "string" ? video : undefined,
    hasVideo,
    category,
    categoryId,
    taxonomyNodeSlug: typeof row.taxonomy_node_slug === "string" ? row.taxonomy_node_slug : null,
    productType,
    rootCategory,
    vendor,
    tags: [productType, leafCategory, rootCategory].filter(Boolean).join(", "),
    gradient: "from-orange-500 to-pink-500",
    qualityScore: Math.min(10, Math.max(7, Math.round(rating * 2))),
    shipFree,
    shipDaysMin: toNumber(getMetadataValue(metadata, "shipping.days_min"), metadata.ship_days_min, row.ae_ship_days_min),
    shipDaysMax: toNumber(getMetadataValue(metadata, "shipping.days_max"), metadata.ship_days_max, row.ae_ship_days_max),
    socialProofLabel: orders > 500 ? `${orders}+ comenzi` : orders > 100 ? `${orders}+ vandute` : orders > 10 ? "Popular" : undefined,
    commerceBadge: orders > 500 ? "Se vinde bine" : rating >= 4.8 && orders > 100 ? "Alegere sigura" : discountPercent >= 30 ? "Super reducere" : undefined,
    dealLabel: discountPercent >= 20 ? "Super Deal" : discountPercent >= 10 ? "Pret bun" : "Nou",
  };
}

const CATEGORY_TEXT_EXPRESSIONS = [
  "p.taxonomy_department",
  "p.taxonomy_category",
  "p.taxonomy_subcategory",
  "p.taxonomy_leaf",
  "p.taxonomy_slug",
  "p.canonical_category",
  "p.canonical_category_slug",
  "p.metadata->>'product_type'",
  "p.metadata->>'product_type_ro'",
  "ap.product_type",
  "ap.product_type_ro",
  "p.category",
  "p.metadata->>'ae_category_name'",
  "p.metadata->>'ae_category_name_ro'",
  "ac.name",
  "ac.name_ro",
  "p.metadata->>'ae_root_category_name'",
  "p.metadata->>'ae_root_category_name_ro'",
  "ar.name",
  "ar.name_ro",
];

function buildCategoryTextCondition(paramRef: string) {
  return `(${CATEGORY_TEXT_EXPRESSIONS
    .map((expression) => `COALESCE(NULLIF(${expression}, ''), '') ILIKE ${paramRef}`)
    .join(" OR ")})`;
}

function buildSyntheticRootCondition(rootType: string) {
  const withOptionalProductTypeFallback = (rootId: string, productTypes: string[]) => {
    const productTypeList = productTypes.map((type) => `'${type.replace(/'/g, "''")}'`).join(", ");
    return `(${ACTUAL_ROOT_CATEGORY_ID_SQL} = '${rootId}' OR (${ACTUAL_ROOT_CATEGORY_ID_SQL} = '' AND ${PRODUCT_TYPE_SQL} IN (${productTypeList})))`;
  };

  const withoutKnownRoot = (productTypes: string[]) => {
    const productTypeList = productTypes.map((type) => `'${type.replace(/'/g, "''")}'`).join(", ");
    return `(${ACTUAL_ROOT_CATEGORY_ID_SQL} = '' AND ${PRODUCT_TYPE_SQL} IN (${productTypeList}))`;
  };

  if (rootType === "apparel") {
    return withOptionalProductTypeFallback("200000343", ['Socks', 'Boxer Briefs', 'Tank Tops', 'T-Shirts', 'Polo Shirts', 'Casual Shirts', 'Dress Shirts', 'Hawaiian Shirts', 'Hoodies', 'Sweatshirts', 'Sweaters', 'Cardigans', 'Jackets', 'Coats', 'Vests', 'Blazers', 'Suits', 'Casual Pants', 'Jeans', 'Cargo Pants', 'Shorts', 'Board Shorts', 'Sweatpants', 'Pajamas', 'Tracksuits', 'Sleeveless Tops', 'Thermal Underwear', 'Compression Wear', 'Swimwear', 'Robes', 'Activewear']);
  }
  if (rootType === "womens") {
    return withOptionalProductTypeFallback("200000345", ['Panties', 'Leggings', 'Dresses', 'Skirts', 'Blouses', 'Bras', 'Tights & Hosiery', 'Bodysuits', 'Vintage Dresses', 'Shirt Dresses']);
  }
  if (rootType === "accessories") {
    return withoutKnownRoot(['Hats & Caps', 'Scarves', 'Gloves', 'Belts', 'Ties', 'Bags', 'Jewelry', 'Watches', 'Shoes']);
  }
  if (rootType === "sports") {
    return withOptionalProductTypeFallback("18", ['Sports Gear', 'Sports Protection']);
  }
  if (rootType === "underwear") {
    return `${ACTUAL_ROOT_CATEGORY_ID_SQL} = '200574005'`;
  }
  if (rootType === "other") {
    return null;
  }
  return null;
}

const TAXONOMY_PATH_COLUMNS = [
  "p.taxonomy_department",
  "p.taxonomy_category",
  "p.taxonomy_subcategory",
];

function buildTaxonomyPathFilters(where: string[], params: unknown[], paramIndex: number, categoryId: string) {
  const parts = categoryId
    .replace("department:", "")
    .split(":")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, TAXONOMY_PATH_COLUMNS.length);

  for (const [index, part] of parts.entries()) {
    where.push(`REGEXP_REPLACE(LOWER(COALESCE(NULLIF(${TAXONOMY_PATH_COLUMNS[index]}, ''), '')), '[^a-z0-9]+', '-', 'g') = $${paramIndex}`);
    params.push(part);
    paramIndex += 1;
  }
  return paramIndex;
}

function addCategoryTextFilters(where: string[], params: unknown[], paramIndex: number, value: string) {
  const scoped = parseScopedTagFilter(value);
  const terms = scoped.tags.length > 0
    ? scoped.tags
    : value.split("|").map((term) => term.trim()).filter(Boolean);
  if (terms.length === 0) return paramIndex;

  const conditions = terms.map((term, index) => {
    const pIdx = paramIndex + index;
    params.push(`%${term}%`);
    return buildCategoryTextCondition(`$${pIdx}`);
  });

  where.push(`(${conditions.join(" OR ")})`);
  paramIndex += terms.length;

  const syntheticRootConditions = scoped.rootIds
    .filter((rootId) => rootId.startsWith("root:"))
    .map((rootId) => buildSyntheticRootCondition(rootId.replace("root:", "")))
    .filter(Boolean);

  if (syntheticRootConditions.length > 0) {
    where.push(`(${syntheticRootConditions.join(" OR ")})`);
  }

  const numericRootIds = scoped.rootIds.filter((rootId) => !rootId.startsWith("root:"));
  if (numericRootIds.length > 0) {
    const placeholders = numericRootIds.map((_, index) => `$${paramIndex + index}`).join(", ");
    where.push(`${ROOT_CATEGORY_ID_SQL} IN (${placeholders})`);
    params.push(...numericRootIds);
    paramIndex += numericRootIds.length;
  }

  return paramIndex;
}

function buildSearchFilters(filters: ProductFilters) {
  const {
    search,
    category,
    categoryId,
    taxonomyNodeSlug,
    tag,
    minPrice,
    maxPrice,
    mode,
    excludeIds,
  } = filters;

  const where = ["p.status = 'active'"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (search) {
    where.push(`
      (
        p.search_document @@ websearch_to_tsquery('simple', $${paramIndex})
        OR p.title ILIKE $${paramIndex + 1}
        OR COALESCE(ap.title, '') ILIKE $${paramIndex + 1}
        OR COALESCE(ap.title_ro, '') ILIKE $${paramIndex + 1}
        OR COALESCE(p.category, '') ILIKE $${paramIndex + 1}
        OR COALESCE(ac.name, '') ILIKE $${paramIndex + 1}
        OR COALESCE(ac.name_ro, '') ILIKE $${paramIndex + 1}
        OR COALESCE(ap.product_type, '') ILIKE $${paramIndex + 1}
        OR COALESCE(ap.product_type_ro, '') ILIKE $${paramIndex + 1}
      )
    `);
    params.push(search, `%${search}%`);
    paramIndex += 2;
  }

  if (category) {
    paramIndex = addCategoryTextFilters(where, params, paramIndex, category);
  }

  if (categoryId) {
    if (String(categoryId).startsWith("root:")) {
      const rootType = String(categoryId).replace("root:", "");
      const rootCondition = buildSyntheticRootCondition(rootType);
      if (rootCondition) where.push(rootCondition);
    } else if (String(categoryId).startsWith("department:")) {
      paramIndex = buildTaxonomyPathFilters(where, params, paramIndex, String(categoryId));
    } else if (String(categoryId).startsWith("tag:")) {
      const tagValue = String(categoryId).replace("tag:", "");
      paramIndex = addCategoryTextFilters(where, params, paramIndex, tagValue);
    } else {
      // Support both clean taxonomy slugs and legacy AliExpress category ids.
      where.push(`
        (
          COALESCE(p.taxonomy_slug, '') = $${paramIndex}
          OR COALESCE(p.canonical_category_slug, '') = $${paramIndex}
          OR COALESCE(p.taxonomy_leaf, '') = $${paramIndex}
          OR COALESCE(p.taxonomy_subcategory, '') = $${paramIndex}
          OR COALESCE(p.taxonomy_category, '') = $${paramIndex}
          OR COALESCE(p.metadata->>'ae_category_id', '') = $${paramIndex}
          OR COALESCE(p.metadata->>'ae_parent_category_id', '') = $${paramIndex}
          OR COALESCE(p.metadata->>'ae_root_category_id', '') = $${paramIndex}
          OR COALESCE(ac.ae_category_id::text, '') = $${paramIndex}
          OR COALESCE(ar.ae_category_id::text, '') = $${paramIndex}
        )
      `);
      params.push(String(categoryId));
      paramIndex += 1;
    }
  }

  if (taxonomyNodeSlug) {
    where.push(`
      p.taxonomy_node_slug IN (
        WITH RECURSIVE descendants AS (
          SELECT slug FROM taxonomy_nodes WHERE slug = ${paramIndex}::text
          UNION ALL
          SELECT n.slug FROM taxonomy_nodes n
          JOIN descendants d ON n.parent_slug = d.slug
        )
        SELECT slug FROM descendants
      )
    `);
    params.push(String(taxonomyNodeSlug));
    paramIndex += 1;
  }

  if (tag) {
    paramIndex = addCategoryTextFilters(where, params, paramIndex, tag);
  }

  if (minPrice != null) {
    where.push(`p.price_cents >= $${paramIndex}`);
    params.push(Math.round(minPrice * 100));
    paramIndex += 1;
  }

  if (maxPrice != null) {
    where.push(`p.price_cents <= $${paramIndex}`);
    params.push(Math.round(maxPrice * 100));
    paramIndex += 1;
  }

  if (mode === "video") {
    where.push(VIDEO_SQL);
  }

  if (excludeIds?.length) {
    const placeholders = excludeIds.map((_, index) => `$${paramIndex + index}`).join(",");
    where.push(`p.id::text NOT IN (${placeholders})`);
    params.push(...excludeIds);
    paramIndex += excludeIds.length;
  }

  return { where, params, paramIndex };
}

function buildOrderBy(sort?: ProductFilters["sort"], mode?: ProductFilters["mode"]) {
  if (sort === "price_asc") return "p.price_cents ASC NULLS LAST, p.updated_at DESC";
  if (sort === "price_desc") return "p.price_cents DESC NULLS LAST, p.updated_at DESC";
  if (sort === "discount") return `${DISCOUNT_SQL} DESC, ${ORDERS_SQL} DESC, p.updated_at DESC`;
  if (sort === "popular" || mode === "trending") return `${ORDERS_SQL} DESC, ${RATING_SQL} DESC, p.updated_at DESC`;
  if (mode === "deals") return `${DISCOUNT_SQL} DESC, p.price_cents ASC NULLS LAST, ${ORDERS_SQL} DESC`;
  if (mode === "feed") return `${VIDEO_SQL} DESC, ${ORDERS_SQL} DESC, p.updated_at DESC`;
  if (mode === "bestvalue") return `CASE WHEN COALESCE(p.price_cents, 0) > 0 THEN (${ORDERS_SQL}::numeric / p.price_cents) ELSE 0 END DESC, ${RATING_SQL} DESC, p.updated_at DESC`;
  if (mode === "toprated") return `${RATING_SQL} DESC, ${ORDERS_SQL} DESC, p.updated_at DESC`;
  if (sort === "newest") return "p.created_at DESC";
  return "p.created_at DESC";
}

export async function searchProducts(filters: ProductFilters = {}) {
  const { limit = 50, offset = 0, locale = "ro", sort, mode } = filters;
  const includeCount = (filters as any).includeCount === true;
  const { where, params, paramIndex } = buildSearchFilters(filters);
  const orderBy = buildOrderBy(sort, mode);
  const cappedLimit = Math.min(limit, 200);

  // Skip COUNT(*) by default — use LIMIT+1 for hasMore. Caller may opt in
  // with includeCount=true (rare admin/totals usage) at the cost of a full scan.
  const skipCount = !includeCount || mode === "video";
  const fetchLimit = skipCount ? cappedLimit + 1 : cappedLimit;

  const sql = `
    ${BASE_PRODUCT_COLUMNS}
    ${BASE_PRODUCT_SELECT}
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const queryParams = [...params, fetchLimit, offset];
  const { rows } = await dbQuery(sql, queryParams);

  let sliced = rows;
  let hasMore = false;
  let total = 0;

  if (skipCount) {
    hasMore = rows.length > cappedLimit;
    sliced = hasMore ? rows.slice(0, cappedLimit) : rows;
    total = offset + sliced.length + (hasMore ? 1 : 0); // approximation; caller should use hasMore
  } else {
    const countSql = `
      SELECT COUNT(*)::int AS total
      ${BASE_PRODUCT_SELECT}
      WHERE ${where.join(" AND ")}
    `;
    const { rows: countRows } = await dbQuery(countSql, params);
    total = Number(countRows[0]?.total || 0);
  }

  const products = sliced.map((row: any) => transformProduct(row, locale));
  return { products, total, offset, limit: cappedLimit, hasMore };
}

export async function getProductById(id: string, locale = "ro") {
  const { rows } = await dbQuery(
    `
      ${BASE_PRODUCT_COLUMNS}
      ${BASE_PRODUCT_SELECT}
      WHERE p.id::text = $1 OR p.supplier_product_id = $1 OR p.external_product_id = $1
      ORDER BY
        CASE
          WHEN p.id::text = $1 THEN 0
          WHEN p.supplier_product_id = $1 THEN 1
          ELSE 2
        END
      LIMIT 1
    `,
    [id],
  );
  if (rows.length === 0) return null;
  return transformProduct(rows[0], locale);
}

export async function getCheckoutProductById(id: string) {
  const { rows } = await dbQuery(
    `
      SELECT p.*
      FROM marketplace_products p
      WHERE p.status = 'active'
        AND (p.id::text = $1 OR p.supplier_product_id = $1 OR p.external_product_id = $1)
      ORDER BY
        CASE
          WHEN p.id::text = $1 THEN 0
          WHEN p.supplier_product_id = $1 THEN 1
          ELSE 2
        END
      LIMIT 1
    `,
    [id],
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const priceCents = Number(row.price_cents);
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    console.warn(`[Checkout] Product ${id} has invalid price_cents: ${row.price_cents}`);
    return null;
  }

  const images = buildImages(row, metadata);
  const category = cleanCategoryLabel(
    firstNonEmpty(
      metadata.product_type_ro,
      metadata.product_type,
      metadata.ae_category_name_ro,
      metadata.ae_category_name,
      row.category,
    ),
    "General",
  );

  return {
    productId: String(row.id),
    aeProductId: String(firstNonEmpty(row.supplier_product_id, row.external_product_id, row.id)),
    sellerId: row.seller_id ? String(row.seller_id) : undefined,
    title: row.title,
    price: priceCents / 100,
    oldPrice: Number(row.compare_at_price_cents) > 0 ? Number(row.compare_at_price_cents) / 100 : Math.round((priceCents / 100) * 1.3),
    image: images[0] || row.image_url || undefined,
    category,
    metadata,
    stock: row.inventory_quantity !== null && row.inventory_quantity !== undefined ? Number(row.inventory_quantity) : undefined,
  };
}

export async function getCategories(locale = "ro") {
  const { rows } = await dbQuery(
    `
      SELECT
        COALESCE(
          NULLIF(p.metadata->>'product_type', ''),
          NULLIF(p.category, ''),
          NULLIF(p.metadata->>'ae_category_name', ''),
          NULLIF(ac.name, ''),
          NULLIF(p.metadata->>'ae_root_category_name', ''),
          NULLIF(ar.name, ''),
          'General'
        ) AS name_en,
        COALESCE(
          NULLIF(p.metadata->>'product_type_ro', ''),
          NULLIF(p.category, ''),
          NULLIF(p.metadata->>'ae_category_name_ro', ''),
          NULLIF(ac.name_ro, ''),
          NULLIF(p.metadata->>'ae_root_category_name_ro', ''),
          NULLIF(ar.name_ro, ''),
          COALESCE(
            NULLIF(p.metadata->>'product_type', ''),
            NULLIF(p.category, ''),
            NULLIF(p.metadata->>'ae_category_name', ''),
            NULLIF(ac.name, ''),
            NULLIF(p.metadata->>'ae_root_category_name', ''),
            NULLIF(ar.name, ''),
            'General'
          )
        ) AS name_ro,
        COALESCE(
          NULLIF(p.metadata->>'ae_category_id', ''),
          ac.ae_category_id::text,
          NULLIF(p.metadata->>'ae_root_category_id', ''),
          ar.ae_category_id::text,
          md5(COALESCE(p.category, 'general'))
        ) AS category_id,
        COUNT(*)::int AS count
      ${BASE_PRODUCT_SELECT}
      WHERE p.status = 'active'
      GROUP BY 1, 2, 3
      ORDER BY COUNT(*) DESC, 1 ASC
    `,
  );

  return rows.map((row: any) => mapCategoryRow(row, locale));
}

function mapCategoryRow(row: any, locale = "ro") {
  const nameEn = cleanCategoryLabel(row.name_en);

  return {
    id: String(row.category_id),
    name: cleanCategoryLabel(locale === "ro" ? row.name_ro : row.name_en, nameEn),
    nameEn,
    count: Number(row.count) || 0,
  };
}

function taxonomySlugPart(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "other";
}

function localizeTaxonomyLabel(value: unknown, locale = "ro") {
  const label = cleanCategoryLabel(value, "General");
  if (locale !== "ro") return label;
  const ro: Record<string, string> = {
    Fashion: "Fashion",
    Women: "Femei",
    Men: "Bărbați",
    Shoes: "Încălțăminte",
    Accessories: "Accesorii",
    Clothing: "Îmbrăcăminte",
    Bags: "Genți",
    Dresses: "Rochii",
    Pants: "Pantaloni",
    "T-Shirts": "Tricouri",
    "Shoes Accessories": "Accesorii încălțăminte",
    Toys: "Jucării",
    Kids: "Copii",
    Other: "Altele",
    General: "General",
  };
  return ro[label] || label;
}

export async function getCategoryHierarchy(locale = "ro") {
  // i18n-ready: read from taxonomy_nodes + taxonomy_translations.
  // Walks ancestors via recursive CTE so counts roll up; labels resolved per
  // locale with English fallback. Falls back to legacy string columns if the
  // new tables are not yet populated.
  const { rows } = await dbQuery(
    `
      WITH RECURSIVE product_counts AS (
        SELECT taxonomy_node_slug AS slug, COUNT(*)::int AS direct_count
        FROM marketplace_products
        WHERE status = 'active'
          AND COALESCE(is_adult, false) = false
          AND taxonomy_node_slug IS NOT NULL
        GROUP BY taxonomy_node_slug
      ),
      ancestors AS (
        SELECT pc.slug AS leaf_slug, n.slug AS ancestor_slug, n.parent_slug, n.kind, n.sort_order, pc.direct_count, 0 AS depth
        FROM product_counts pc
        JOIN taxonomy_nodes n ON n.slug = pc.slug AND n.is_active = true
        UNION ALL
        SELECT a.leaf_slug, n.slug, n.parent_slug, n.kind, n.sort_order, a.direct_count, a.depth + 1
        FROM ancestors a
        JOIN taxonomy_nodes n ON n.slug = a.parent_slug AND n.is_active = true
        WHERE a.depth < 8
      ),
      node_counts AS (
        SELECT ancestor_slug AS slug, SUM(direct_count)::int AS total
        FROM ancestors
        GROUP BY ancestor_slug
      )
      SELECT
        n.slug,
        n.parent_slug,
        n.kind,
        n.sort_order,
        COALESCE(t_loc.label, t_en.label, n.slug) AS label,
        nc.total
      FROM node_counts nc
      JOIN taxonomy_nodes n ON n.slug = nc.slug
      LEFT JOIN taxonomy_translations t_loc ON t_loc.node_slug = n.slug AND t_loc.locale = $1
      LEFT JOIN taxonomy_translations t_en ON t_en.node_slug = n.slug AND t_en.locale = 'en'
      ORDER BY n.sort_order NULLS LAST, n.slug
    `,
    [locale],
  );

  if (rows.length === 0) {
    // Legacy fallback for pre-migration environments / tests.
    const legacy = await dbQuery(
      `
        SELECT
          COALESCE(NULLIF(p.taxonomy_department, ''), 'Other') AS department,
          COALESCE(NULLIF(p.taxonomy_category, ''), 'General') AS category,
          COALESCE(NULLIF(p.taxonomy_subcategory, ''), 'General') AS subcategory,
          COALESCE(NULLIF(p.taxonomy_leaf, ''), NULLIF(p.canonical_category, ''), NULLIF(p.category, ''), 'General') AS leaf,
          COALESCE(NULLIF(p.taxonomy_slug, ''), NULLIF(p.canonical_category_slug, ''), md5(COALESCE(p.category, 'general'))) AS slug,
          COUNT(*)::int AS count
        FROM marketplace_products p
        WHERE p.status = 'active' AND COALESCE(p.is_adult, false) = false
        GROUP BY 1,2,3,4,5
        HAVING COUNT(*) > 0
      `,
    );
    return buildCategoryHierarchy(legacy.rows, locale);
  }

  return buildTaxonomyNodeTree(rows);
}

function buildTaxonomyNodeTree(rows: any[]) {
  const nodes = new Map<string, any>();
  for (const r of rows) {
    nodes.set(r.slug, {
      id: r.slug,
      name: String(r.label),
      tag: r.slug,
      count: Number(r.total) || 0,
      kind: r.kind,
      _parent: r.parent_slug,
      _sort: r.sort_order ?? 9999,
      children: [],
    });
  }
  const roots: any[] = [];
  for (const node of nodes.values()) {
    if (node._parent && nodes.has(node._parent)) {
      nodes.get(node._parent).children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (list: any[]) => {
    list.sort((a, b) => (a._sort - b._sort) || (b.count - a.count) || a.name.localeCompare(b.name));
    for (const n of list) {
      if (n.children.length) sortRec(n.children);
      delete n._parent;
      delete n._sort;
    }
  };
  sortRec(roots);
  return roots;
}

function buildCategoryHierarchy(rows: any[], locale = "ro") {
  const roots: Record<string, any> = {};

  for (const row of rows) {
    const department = cleanCategoryLabel(row.department, "Other");
    const category = cleanCategoryLabel(row.category, "General");
    const subcategory = cleanCategoryLabel(row.subcategory, category);
    const leaf = cleanCategoryLabel(row.leaf, subcategory);
    const rootId = `department:${taxonomySlugPart(department)}`;
    if (!roots[rootId]) {
      roots[rootId] = {
        id: rootId,
        name: localizeTaxonomyLabel(department, locale),
        count: 0,
        children: [],
      };
    }

    const count = Number(row.count) || 0;
    const categoryId = `${rootId}:${taxonomySlugPart(category)}`;
    let categoryNode = roots[rootId].children.find((child: any) => child.id === categoryId);
    if (!categoryNode) {
      categoryNode = { id: categoryId, name: localizeTaxonomyLabel(category, locale), count: 0, children: [] };
      roots[rootId].children.push(categoryNode);
    }

    const subcategoryId = `${categoryId}:${taxonomySlugPart(subcategory)}`;
    let subcategoryNode = categoryNode.children.find((child: any) => child.id === subcategoryId);
    if (!subcategoryNode) {
      subcategoryNode = { id: subcategoryId, name: localizeTaxonomyLabel(subcategory, locale), count: 0, children: [] };
      categoryNode.children.push(subcategoryNode);
    }

    subcategoryNode.children.push({
      id: String(row.slug),
      name: localizeTaxonomyLabel(leaf, locale),
      tag: String(row.slug),
      count,
    });
    subcategoryNode.count += count;
    categoryNode.count += count;
    roots[rootId].count += count;
  }

  return Object.values(roots)
    .map((root: any) => ({
      ...root,
      children: root.children
        .map((category: any) => ({
          ...category,
          children: category.children
            .map((subcategory: any) => ({
              ...subcategory,
              children: subcategory.children.sort((left: any, right: any) => right.count - left.count || left.name.localeCompare(right.name)),
            }))
            .sort((left: any, right: any) => right.count - left.count || left.name.localeCompare(right.name)),
        }))
        .sort((left: any, right: any) => right.count - left.count || left.name.localeCompare(right.name)),
    }))
    .sort((left: any, right: any) => right.count - left.count || left.name.localeCompare(right.name));
}

export {
  buildSearchFilters as buildSearchFiltersForTest,
  buildCategoryHierarchy as buildCategoryHierarchyForTest,
  mapCategoryRow as mapCategoryRowForTest,
};
