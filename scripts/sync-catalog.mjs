import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const SOURCE_TYPE = 'aliexpress';
const SUPPLIER = 'aliexpress';
const BATCH_SIZE = 500;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--limit') {
      const value = argv[index + 1];
      index += 1;
      options.limit = parseLimit(value);
      continue;
    }

    if (arg.startsWith('--limit=')) {
      options.limit = parseLimit(arg.slice('--limit='.length));
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseLimit(value) {
  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('--limit must be a positive integer');
  }
  return limit;
}

function printUsage() {
  console.log('Usage: node scripts/sync-catalog.mjs [--dry-run] [--limit <count>]');
}

function toCents(value) {
  if (value === null || value === undefined) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function cleanCategoryLabel(value, fallback = 'General') {
  const label = String(value || '').replace(/\s+/g, ' ').trim();
  if (!label) return fallback;
  if (/^AE-\d+$/i.test(label)) return fallback;
  if (/^\d{6,}$/.test(label)) return fallback;
  return label;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

function deriveCatalogCategory(product) {
  return cleanCategoryLabel(
    firstNonEmpty(
      product.product_type_ro,
      product.product_type,
      product.category_name_ro,
      product.category_name,
      product.root_category_name_ro,
      product.root_category_name,
    ),
    'General',
  );
}

function productMetadata(product) {
  return {
    ae_product_id: String(product.ae_product_id),
    ae_category_id: product.category_id === null ? null : String(product.category_id),
    ae_category_name: product.category_name || null,
    ae_category_name_ro: product.category_name_ro || null,
    ae_parent_category_id: product.parent_category_id === null ? null : String(product.parent_category_id),
    ae_root_category_id: product.root_category_id === null ? null : String(product.root_category_id),
    ae_root_category_name: product.root_category_name || null,
    ae_root_category_name_ro: product.root_category_name_ro || null,
    title_ro: product.title_ro || null,
    product_type: product.product_type || null,
    product_type_ro: product.product_type_ro || null,
    images: product.images || [],
    mobile_detail: product.mobile_detail || null,
    properties: product.properties || null,
    video_url: product.video_url || null,
    video_poster: product.video_poster || null,
    has_video: Boolean(product.has_video),
    rating: product.rating === null ? null : Number(product.rating),
    rating_count: product.rating_count,
    orders_count: product.orders_count,
    product_status: product.product_status,
    shipping: {
      method: product.ship_method,
      cost_usd: product.ship_cost_usd === null ? null : Number(product.ship_cost_usd),
      free: Boolean(product.ship_free),
      days_min: product.ship_days_min,
      days_max: product.ship_days_max,
      tracking: Boolean(product.ship_tracking),
      from: product.ship_from,
      delivery_date_desc: product.delivery_date_desc,
    },
    store: {
      id: product.store_id === null ? null : String(product.store_id),
      name: product.store_name,
      rating: product.store_rating === null ? null : Number(product.store_rating),
    },
    variants_count: product.variants_count,
    available_stock: product.available_stock,
    attributes: {
      neckline: product.neckline,
      style: product.style,
      fabric_type: product.fabric_type,
      color: product.color,
      colors: product.colors || [],
      sizes: product.sizes || [],
      material: product.material,
      pattern_type: product.pattern_type,
      sleeve_style: product.sleeve_style,
      waistline: product.waistline,
      season: product.season,
      silhouette: product.silhouette,
      decoration: product.decoration || [],
      gender: product.gender,
    },
  };
}

function variantAttributes(variant) {
  return {
    color: variant.color || null,
    size: variant.size || null,
    image_url: variant.variant_image || null,
    properties: variant.properties || null,
  };
}

function variantMetadata(variant) {
  return {
    ae_variant_id: variant.id,
    sku_id: String(variant.sku_id),
    price_usd: variant.price_usd === null ? null : Number(variant.price_usd),
    original_price_usd: variant.original_price_usd === null ? null : Number(variant.original_price_usd),
  };
}

async function ensureSyncSchema(client) {
  await client.query(`
    ALTER TABLE marketplace_products
      ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'seller'
        CHECK (source_type IN ('seller', 'aliexpress', 'affiliate', 'manual', 'other')),
      ADD COLUMN IF NOT EXISTS supplier text,
      ADD COLUMN IF NOT EXISTS supplier_product_id text,
      ADD COLUMN IF NOT EXISTS supplier_url text,
      ADD COLUMN IF NOT EXISTS supplier_cost_cents integer
        CHECK (supplier_cost_cents IS NULL OR supplier_cost_cents >= 0)
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS marketplace_products_supplier_uidx
      ON marketplace_products (source_type, supplier, supplier_product_id)
      WHERE supplier_product_id IS NOT NULL
  `);
}

async function syncProduct(client, product) {
  const supplierProductId = String(product.ae_product_id);
  const title = product.title_ro || product.title;
  const slugBase = slugify(title);
  const category = deriveCatalogCategory(product);
  const priceCents = toCents(product.price_ron);
  const compareAtPriceCents = toCents(product.old_price_ron);
  const supplierCostCents = toCents(product.min_price_usd === null ? null : Number(product.min_price_usd) * 4.6);

  const { rows } = await client.query(
    `
      INSERT INTO marketplace_products (
        external_product_id, slug, title, description, brand, category,
        product_url, image_url, status, currency, price_cents, compare_at_price_cents,
        inventory_status, metadata, source_type, supplier, supplier_product_id,
        supplier_url, supplier_cost_cents, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14::jsonb, $15, $16, $17,
        $18, $19, COALESCE($20::timestamptz, now()), now()
      )
      ON CONFLICT (source_type, supplier, supplier_product_id)
      WHERE supplier_product_id IS NOT NULL
      DO UPDATE SET
        external_product_id = EXCLUDED.external_product_id,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        brand = EXCLUDED.brand,
        category = EXCLUDED.category,
        product_url = EXCLUDED.product_url,
        image_url = EXCLUDED.image_url,
        status = EXCLUDED.status,
        currency = EXCLUDED.currency,
        price_cents = EXCLUDED.price_cents,
        compare_at_price_cents = EXCLUDED.compare_at_price_cents,
        inventory_status = EXCLUDED.inventory_status,
        metadata = EXCLUDED.metadata,
        supplier_url = EXCLUDED.supplier_url,
        supplier_cost_cents = EXCLUDED.supplier_cost_cents,
        updated_at = now()
      RETURNING id
    `,
    [
      supplierProductId,
      `${slugBase || 'aliexpress-product'}-${supplierProductId}`,
      title,
      product.description || null,
      product.brand || null,
      category,
      product.source_url || null,
      product.main_image || null,
      product.product_status === 'offline' ? 'disabled' : 'active',
      'RON',
      priceCents,
      compareAtPriceCents,
      product.available_stock === 0 ? 'out_of_stock' : 'in_stock',
      JSON.stringify(productMetadata(product)),
      SOURCE_TYPE,
      SUPPLIER,
      supplierProductId,
      product.source_url || null,
      supplierCostCents,
      product.created_at || null,
    ],
  );

  const marketplaceProductId = rows[0].id;
  const variants = await client.query('SELECT * FROM ae_variants WHERE product_id = $1 ORDER BY id', [
    product.ae_product_id,
  ]);

  for (const variant of variants.rows) {
    const variantTitle = variant.variant_name || [variant.color, variant.size].filter(Boolean).join(' / ') || title;
    const variantPriceCents = toCents(variant.price_ron) ?? priceCents;
    const stock = variant.stock ?? 0;

    await client.query(
      `
        INSERT INTO marketplace_product_variants (
          product_id, external_variant_id, sku, title, attributes,
          currency, price_cents, inventory_quantity, status, metadata, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5::jsonb,
          $6, $7, $8, $9, $10::jsonb, now(), now()
        )
        ON CONFLICT (product_id, external_variant_id)
        WHERE external_variant_id IS NOT NULL
        DO UPDATE SET
          sku = EXCLUDED.sku,
          title = EXCLUDED.title,
          attributes = EXCLUDED.attributes,
          currency = EXCLUDED.currency,
          price_cents = EXCLUDED.price_cents,
          inventory_quantity = EXCLUDED.inventory_quantity,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          updated_at = now()
      `,
      [
        marketplaceProductId,
        String(variant.sku_id),
        String(variant.sku_id),
        variantTitle,
        JSON.stringify(variantAttributes(variant)),
        'RON',
        variantPriceCents,
        stock,
        stock > 0 ? 'active' : 'out_of_stock',
        JSON.stringify(variantMetadata(variant)),
      ],
    );
  }

  return variants.rowCount;
}

async function syncCatalog() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Add it to .env.local before running this script.');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  const client = await pool.connect();
  let syncedProducts = 0;
  let syncedVariants = 0;

  try {
    await client.query('BEGIN');
    await ensureSyncSchema(client);

    const countResult = await client.query('SELECT COUNT(*)::int AS count FROM ae_products');
    const totalProducts = options.limit === null ? countResult.rows[0].count : Math.min(countResult.rows[0].count, options.limit);

    console.log(
      `Syncing ${totalProducts} AliExpress products${options.dryRun ? ' (dry run)' : ''}...`,
    );

    for (let offset = 0; offset < totalProducts; offset += BATCH_SIZE) {
      const batchLimit = Math.min(BATCH_SIZE, totalProducts - offset);
      const { rows: products } = await client.query(
        `
          SELECT
            p.*,
            c.name_ro AS category_name_ro,
            c.name AS category_name,
            c.parent_id AS parent_category_id,
            root.ae_category_id AS root_category_id,
            root.name AS root_category_name,
            root.name_ro AS root_category_name_ro
          FROM ae_products p
          LEFT JOIN ae_categories c ON c.ae_category_id = p.category_id
          LEFT JOIN ae_categories root ON root.ae_category_id = COALESCE(c.parent_id, c.ae_category_id)
          ORDER BY p.id
          LIMIT $1 OFFSET $2
        `,
        [batchLimit, offset],
      );

      for (const product of products) {
        syncedVariants += await syncProduct(client, product);
        syncedProducts += 1;
      }

      console.log(`Processed ${syncedProducts}/${totalProducts} products`);
    }

    if (options.dryRun) {
      await client.query('ROLLBACK');
      console.log(`Dry run complete. Would sync ${syncedProducts} products and ${syncedVariants} variants.`);
    } else {
      await client.query('COMMIT');
      console.log(`Sync complete. Synced ${syncedProducts} products and ${syncedVariants} variants.`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

syncCatalog().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
