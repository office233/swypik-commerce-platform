import { dbQuery } from "@/lib/db";
import { buildScopedTagId, parseScopedTagFilter } from "@/lib/db/category-filter-utils";

export type ProductFilters = {
  search?: string;
  category?: string;
  categoryId?: string;
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

function addCategoryTextFilters(where: string[], params: any[], paramIndex: number, value: string) {
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
    tag,
    minPrice,
    maxPrice,
    mode,
    excludeIds,
  } = filters;

  const where = ["p.status = 'active'"];
  const params: any[] = [];
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
    } else if (String(categoryId).startsWith("tag:")) {
      const tagValue = String(categoryId).replace("tag:", "");
      paramIndex = addCategoryTextFilters(where, params, paramIndex, tagValue);
    } else {
      // AliExpress category ids must remain stable even after AI product_type enrichment.
      where.push(`
        (
          COALESCE(p.metadata->>'ae_category_id', '') = $${paramIndex}
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
  const { where, params, paramIndex } = buildSearchFilters(filters);
  const orderBy = buildOrderBy(sort, mode);

  const sql = `
    ${BASE_PRODUCT_COLUMNS}
    ${BASE_PRODUCT_SELECT}
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const queryParams = [...params, Math.min(limit, 200), offset];
  const { rows } = await dbQuery(sql, queryParams);
  const products = rows.map((row: any) => transformProduct(row, locale));

  const countSql = `
    SELECT COUNT(*)::int AS total
    ${BASE_PRODUCT_SELECT}
    WHERE ${where.join(" AND ")}
  `;
  const { rows: countRows } = await dbQuery(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  return { products, total, offset, limit };
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

export async function getCategoryHierarchy(locale = "ro") {
  const { rows } = await dbQuery(
    `
      SELECT
        COALESCE(
          NULLIF(p.metadata->>'ae_root_category_id', ''),
          ar.ae_category_id::text,
          NULLIF(p.metadata->>'ae_category_id', ''),
          ac.ae_category_id::text,
          md5(COALESCE(p.category, 'general'))
        ) AS root_id,
        COALESCE(
          NULLIF(p.metadata->>'ae_root_category_name', ''),
          NULLIF(ar.name, ''),
          NULLIF(p.category, ''),
          'General'
        ) AS root_name,
        COALESCE(
          NULLIF(p.metadata->>'ae_root_category_name_ro', ''),
          NULLIF(ar.name_ro, ''),
          COALESCE(
            NULLIF(p.metadata->>'ae_root_category_name', ''),
            NULLIF(ar.name, ''),
            NULLIF(p.category, ''),
            'General'
          )
        ) AS root_name_ro,
        NULLIF(COALESCE(p.metadata->>'product_type', ap.product_type), '') AS tag_en,
        NULLIF(COALESCE(p.metadata->>'product_type_ro', ap.product_type_ro), '') AS tag_ro,
        COALESCE(NULLIF(p.metadata->>'ae_category_id', ''), ac.ae_category_id::text) AS leaf_id,
        COALESCE(NULLIF(p.metadata->>'ae_category_name', ''), ac.name, p.category) AS leaf_name,
        COALESCE(
          NULLIF(p.metadata->>'ae_category_name_ro', ''),
          ac.name_ro,
          COALESCE(NULLIF(p.metadata->>'ae_category_name', ''), ac.name, p.category)
        ) AS leaf_name_ro,
        COUNT(*)::int AS count
      ${BASE_PRODUCT_SELECT}
      WHERE p.status = 'active'
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
      HAVING COUNT(*) > 0
      ORDER BY COUNT(*) DESC, 2 ASC
    `,
  );

  return buildCategoryHierarchy(rows, locale);
}

function buildCategoryHierarchy(rows: any[], locale = "ro") {
  const CATEGORY_MAP_RO: Record<string, string> = {
    "underwear": "Lenjerie", "boxer briefs": "Lenjerie", "boxeri": "Lenjerie", "panties": "Lenjerie", "chiloți": "Lenjerie", "thermal underwear": "Lenjerie", "lenjerie": "Lenjerie",
    "polo shirts": "Polo", "polo": "Polo",
    "t-shirts": "Tricouri & Maiouri", "tricouri": "Tricouri & Maiouri", "tank tops": "Tricouri & Maiouri", "maiouri": "Tricouri & Maiouri", "undershirts": "Tricouri & Maiouri",
    "jeans": "Blugi", "blugi": "Blugi",
    "joggers": "Pantaloni Jogging", "sweatpants": "Pantaloni Jogging",
    "suits": "Costume & Sacouri", "costume": "Costume & Sacouri", "blazers": "Costume & Sacouri",
    "shorts": "Pantaloni Scurți", "pantaloni scurți": "Pantaloni Scurți", "board shorts": "Pantaloni Scurți",
    "casual shirts": "Cămăși", "dress shirts": "Cămăși", "hawaiian shirts": "Cămăși", "cămăși": "Cămăși",
    "tracksuits": "Treninguri & Seturi", "treninguri": "Treninguri & Seturi",
    "casual pants": "Pantaloni Casual & Cargo", "cargo pants": "Pantaloni Casual & Cargo",
    "jackets": "Jachete & Veste", "jachete": "Jachete & Veste", "vests": "Jachete & Veste",
    "hoodies": "Hanorace & Bluze", "sweatshirts": "Hanorace & Bluze",
    "coats": "Paltoane & Geci", "paltoane": "Paltoane & Geci",
    "leggings": "Pantaloni Sport", "compression wear": "Pantaloni Sport", "activewear": "Echipament Sportiv",
    "sweaters": "Pulovere & Cardigane", "cardigans": "Pulovere & Cardigane",
    "socks": "Șosete", "șosete": "Șosete",
    "pajamas": "Pijamale & Halate", "robes": "Pijamale & Halate",
    "dresses": "Rochii", "rochii": "Rochii", "skirts": "Fuste", "fuste": "Fuste",
    "blouses": "Bluze Damă", "bras": "Sutiene", "bodysuits": "Body-uri", "stockings": "Dresuri & Ciorapi",
    "swimwear": "Costume de Baie", "rash guards": "Protecții Sport",
    "shoes": "Încălțăminte", "bags": "Genți", "hats": "Pălării & Șepci",
    "walkie talkie": "Stații Radio",
    "girls clothing": "Îmbrăcăminte Fete", "boys clothing": "Îmbrăcăminte Băieți", "baby clothing": "Îmbrăcăminte Bebeluși",
    "other": "Altele", "briefs": "Chiloți",
  };

  // ══════════════════════════════════════════════════════
  // CONSOLIDATION MAP — reduce 23+ AliExpress roots to 6 clean storefront categories
  // ══════════════════════════════════════════════════════
  const ROOT_CONSOLIDATION: Record<string, { id: string; en: string; ro: string }> = {
    // Keep these as-is (main categories)
    "200000345": { id: "200000345", en: "Women's Clothing", ro: "Îmbrăcăminte Femei" },
    "200000343": { id: "200000343", en: "Men's Clothing", ro: "Îmbrăcăminte Bărbați" },
    "1501":      { id: "1501",      en: "Mom & Kids", ro: "Mamă & Copii" },
    // Merge INTO main categories
    "200574005": { id: "200000345", en: "Women's Clothing", ro: "Îmbrăcăminte Femei" },  // Lenjerie -> Femei
    "320":       { id: "200000345", en: "Women's Clothing", ro: "Îmbrăcăminte Femei" },  // Nunți -> Femei
    "322":       { id: "root:other", en: "Others", ro: "Altele" },                       // Încălțăminte
    "509":       { id: "root:other", en: "Others", ro: "Altele" },                       // Phones (Walkie Talkie)
    "18":        { id: "root:other", en: "Others", ro: "Altele" },                       // Sport
    "15":        { id: "root:other", en: "Others", ro: "Altele" },                       // Casă & Grădină
    "200000297": { id: "200000345", en: "Women's Clothing", ro: "Îmbrăcăminte Femei" },  // Accesorii vestimentare
    "36":        { id: "root:other", en: "Others", ro: "Altele" },                       // Bijuterii
    "26":        { id: "root:other", en: "Others", ro: "Altele" },                       // Jucării
    "66":        { id: "root:other", en: "Others", ro: "Altele" },                       // Frumusețe
    "1524":      { id: "root:other", en: "Others", ro: "Altele" },                       // Genți & Bagaje
    "1511":      { id: "root:other", en: "Others", ro: "Altele" },                       // Ceasuri
    "44":        { id: "root:other", en: "Others", ro: "Altele" },                       // Electronică
    "200000532": { id: "root:other", en: "Others", ro: "Altele" },                       // Noutăți
  };

  const roots: Record<string, any> = {};

  for (const row of rows) {
    const rawRootId = cleanCategoryId(row.root_id);

    // Consolidate: map small/irrelevant roots to main categories
    const consolidated = ROOT_CONSOLIDATION[rawRootId];
    let rootId: string;
    let rootName: string;

    if (consolidated) {
      rootId = consolidated.id;
      rootName = locale === "ro" ? consolidated.ro : consolidated.en;
    } else if (rawRootId && !rawRootId.startsWith("root:")) {
      // Unknown AE root — send to "Altele"
      rootId = "root:other";
      rootName = locale === "ro" ? "Altele" : "Others";
    } else {
      rootId = "root:other";
      rootName = locale === "ro" ? "Altele" : "Others";
    }
    
    if (!roots[rootId]) {
      roots[rootId] = { id: rootId, name: rootName, count: 0, children: [] };
    }

    const bestString = (row.tag_en || row.tag_ro || row.leaf_name_ro || row.leaf_name || "").toLowerCase().trim();
    let tagName = "";

    if (locale === "ro") {
      const matchedKey = Object.keys(CATEGORY_MAP_RO)
        .sort((a, b) => b.length - a.length)
        .find(k => bestString.includes(k));
      if (matchedKey) tagName = CATEGORY_MAP_RO[matchedKey];
    }
    
    if (!tagName) {
      tagName = cleanCategoryLabel(
        locale === "ro" ? row.tag_ro : row.tag_en,
        cleanCategoryLabel(locale === "ro" ? row.leaf_name_ro : row.leaf_name, rootName),
      );
    }
    
    const tagKey = cleanCategoryLabel(row.tag_en || row.tag_ro || tagName, "");
    const normalizedName = tagName.trim().toLowerCase();
    const count = Number(row.count) || 0;

    const existing = roots[rootId].children.find((child: any) => child.name.toLowerCase() === normalizedName);
    if (existing) {
      existing.count += count;
      if (tagKey && !existing.tagKeyList.includes(tagKey.toLowerCase())) {
        existing.tagKeyList.push(tagKey.toLowerCase());
        existing.id = buildScopedTagId(existing.tagKeyList, rootId);
      }
    } else {
      const tagKeyList = tagKey ? [tagKey.toLowerCase()] : [];
      roots[rootId].children.push({
        id: tagKeyList.length > 0 ? buildScopedTagId(tagKeyList, rootId) : String(row.leaf_id || row.root_id),
        name: tagName,
        tag: tagKey || undefined,
        count,
        tagKeyList,
      });
    }

    roots[rootId].count += count;
  }

  // Filter out subcategories with very few products (noise)
  return Object.values(roots)
    .filter((root: any) => root.children.length > 0 && root.count >= 5)
    .map((root: any) => ({
      ...root,
      children: root.children
        .filter((child: any) => child.count >= 3) // hide subcats with < 3 products
        .map((child: any) => {
          const { tagKeyList, ...rest } = child;
          return rest;
        })
        .sort((left: any, right: any) => right.count - left.count),
    }))
    .sort((left: any, right: any) => right.count - left.count);
}

export {
  buildSearchFilters as buildSearchFiltersForTest,
  buildCategoryHierarchy as buildCategoryHierarchyForTest,
  mapCategoryRow as mapCategoryRowForTest,
};
