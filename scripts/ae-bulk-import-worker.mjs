#!/usr/bin/env node
/**
 * scripts/ae-bulk-import-worker.mjs
 *
 * Resumable bulk AliExpress importer.
 *
 *   Reads:  /opt/swypik/data/import_plan.jsonl
 *           one JSON per line:
 *             { product_id, category_hint, source_files }
 *
 *   Tracks: ae_import_jobs (status per product_id)
 *
 *   Pipeline (per product):
 *     1. Skip if ae_import_jobs.status='done' (or 'skipped')
 *     2. Mark 'running', increment attempts
 *     3. Fetch AE product detail (rate limited 3 QPS, retry 3x w/ backoff)
 *     4. INSERT/UPDATE marketplace_products + variants (same logic as
 *        scripts/ae-import-standalone-clean.mjs)
 *     5. Run inline pricing recalc (cost+ship+markup+TVA) for this product
 *     6. Mark 'done', store db id
 *
 *   Flags:
 *     --limit=N         stop after N successful imports (default: all)
 *     --qps=N           rate limit (default: 3)
 *     --plan=path       override plan path
 *     --resume          process only pending/failed (default behavior)
 *     --reset-failed    set failed -> pending before run
 *     --status          print status summary and exit
 *     --no-pricing      skip pricing recalc (faster, do after batch)
 *
 *   Logs:  stdout JSON lines, also pushed to /opt/swypik/logs/ae-import.log
 *
 *   Designed to run under systemd as service swypik-ae-import.service.
 *   Receives SIGTERM cleanly — finishes current product, exits 0.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline';
import { createRequire } from 'node:module';
import { resolveTaxonomyV2, loadCategories, loadFullChainCache } from '../lib/aliexpress/taxonomy-resolver.mjs';
import { TREE, flatten, buildMatcher, resolveSlug } from './seed-taxonomy-i18n.mjs';

const requireFromApp = createRequire('/opt/swypik/app/package.json');
const { Pool } = requireFromApp('pg');

// ─── ENV ─────────────────────────────────────────────────────────────────────
const envText = fs.readFileSync('/opt/swypik/app/infra/hetzner/.env.production', 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const APP_KEY    = process.env.ALIEXPRESS_APP_KEY    || '';
const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET || '';
const TOKEN      = process.env.ALIEXPRESS_ACCESS_TOKEN || '';
if (!APP_KEY || !APP_SECRET || !TOKEN) throw new Error('AliExpress credentials missing');

function hostDbUrl() {
  const u = new URL(process.env.DATABASE_URL);
  if (u.hostname === 'postgres') u.hostname = '127.0.0.1';
  return u.toString();
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const a = argv.find(x => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return def;
  if (!a.includes('=')) return true;
  return a.split('=')[1];
};
const LIMIT      = parseInt(flag('limit', '99999999'), 10);
const QPS        = parseFloat(flag('qps', '3'));
const PLAN       = flag('plan', '/opt/swypik/data/import_plan.jsonl');
const RESET_FAIL = !!flag('reset-failed', false);
const STATUS     = !!flag('status', false);
const NO_PRICING = !!flag('no-pricing', false);

const LOG_FILE = '/opt/swypik/logs/ae-import.log';
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const log = (level, msg, extra = {}) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra });
  console.log(line);
  try { logStream.write(line + '\n'); } catch {}
};

// ─── DB ──────────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: hostDbUrl(), max: 5 });
const uiTaxonomyMatcher = buildMatcher(flatten(TREE));

if (STATUS) {
  const { rows } = await pool.query(`SELECT status, count(*) FROM ae_import_jobs GROUP BY status ORDER BY status`);
  console.log('AE Import status:');
  for (const r of rows) console.log(`  ${r.status.padEnd(10)} ${r.count}`);
  const { rows: errs } = await pool.query(`SELECT last_error, count(*) FROM ae_import_jobs WHERE status='failed' GROUP BY last_error ORDER BY count DESC LIMIT 10`);
  if (errs.length) {
    console.log('\nTop errors:');
    for (const e of errs) console.log(`  ${e.count}x  ${e.last_error?.slice(0,120)}`);
  }
  await pool.end();
  logStream.end();
  process.exit(0);
}

if (RESET_FAIL) {
  const r = await pool.query(`UPDATE ae_import_jobs SET status='pending' WHERE status='failed' RETURNING product_id`);
  log('info', `reset ${r.rowCount} failed -> pending`);
}

// ─── AE API ──────────────────────────────────────────────────────────────────
function signParams(params) {
  const input = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', APP_SECRET).update(input, 'utf8').digest('hex').toUpperCase();
}

function isRetryable(msg) {
  const s = String(msg || '').toLowerCase();
  return s.includes('rate') || s.includes('limit') || s.includes('flow') || s.includes('frequen') || s.includes('timeout') || s.includes('busy') || s.includes('try again') || s.includes('502') || s.includes('503');
}

function parseBanSeconds(msg) {
  const m = String(msg || '').match(/(\d+)\s*seconds?/i);
  if (!m) return 0;
  const seconds = parseInt(m[1], 10);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(24 * 60 * 60, seconds + 10) : 0;
}

async function retrySleep(ms) {
  const endAt = Date.now() + ms;
  while (Date.now() < endAt) {
    if (stopRequested) throw new Error('AE worker stopping');
    await new Promise(r => setTimeout(r, Math.min(60_000, endAt - Date.now())));
  }
}

async function callAE(method, params = {}, { retries = 5, baseDelayMs = 3000 } = {}) {
  let attempt = 0;
  while (true) {
    const all = {
      app_key: APP_KEY,
      method,
      session: TOKEN,
      sign_method: 'sha256',
      timestamp: new Date().toISOString().replace(/\.\d+Z/, '+0000').replace('T', ' '),
      v: '2.0',
      format: 'json',
    };
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) all[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
    all.sign = signParams(all);
    const url = new URL('https://api-sg.aliexpress.com/sync');
    url.search = new URLSearchParams(all).toString();
    let json;
    try {
      const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(30000) });
      json = await res.json();
    } catch (err) {
      if (attempt < retries) {
        await retrySleep(baseDelayMs * Math.pow(2, attempt));
        attempt++; continue;
      }
      throw err;
    }
    if (json.error_response) {
      const msg = json.error_response.msg || json.error_response.sub_msg || 'AE error';
      if (attempt < retries && isRetryable(msg)) {
        const ban = parseBanSeconds(msg);
        const wait = ban > 0 ? ban * 1000 : baseDelayMs * Math.pow(2, attempt);
        if (ban >= 300) log('warn', 'AE API ban backoff', { method, ban_seconds: ban, wait_until: new Date(Date.now() + wait).toISOString() });
        await retrySleep(wait);
        attempt++; continue;
      }
      throw new Error(msg);
    }
    return json;
  }
}

// ─── PRODUCT MAPPER (riff on standalone-clean) ───────────────────────────────
function slugify(t) {
  return String(t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}
function centsRon(r) { const n = Number(r); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; }
function numberOf(v, d = 0) { const n = typeof v === 'number' ? v : parseFloat(String(v || '')); return Number.isFinite(n) ? n : d; }
function intOf(v, d = 0) { const n = typeof v === 'number' ? v : parseInt(String(v || ''), 10); return Number.isFinite(n) ? n : d; }
function asArray(v) { if (Array.isArray(v)) return v; if (!v || typeof v !== 'object') return []; for (const c of Object.values(v)) if (Array.isArray(c)) return c; return []; }
function splitImages(v) {
  return String(v || '').split(/[;,]/).map(u => u.trim()).filter(Boolean).map(u => u.startsWith('//') ? `https:${u}` : u);
}
function optionName(v) { const r = String(v || 'option').trim().toLowerCase(); if (r === 'colour') return 'color'; return r.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'option'; }
function skuProps(sku) {
  return asArray(sku?.ae_sku_property_dtos).map(p => ({
    name: String(p.sku_property_name || '').trim(),
    value: String(p.property_value_definition_name || p.sku_property_value || '').trim(),
    propertyId: p.sku_property_id ?? null,
    valueId: p.property_value_id ?? null,
    image: p.sku_image || null,
  })).filter(p => p.name || p.value);
}

const ADULT_TERMS = [
  'sex toy','sex toys','sex doll','sex products','vibrator','vibrators','dildo','dildos',
  'masturbator','masturbation','fleshlight','bondage','bdsm','fetish','butt plug','anal plug',
  'anal beads','anal toy','cock ring','penis ring','penis pump','penis sleeve','vibrating egg',
  'love egg','g-spot','g spot','lubricant sex','sex lubricant','personal lubricant','adult only',
  'adult-only','adults only','erotic','porn','pornographic','nsfw','crotchless','pheromone','xxx','18+',
  'sissy','chastity','open butt',
];
const ADULT_COMBO_RULES = [
  { reason: 'matched jockstrap+g-string', pattern: /(?:jock\s*strap|jockstrap).*g[-\s]?strings?|g[-\s]?strings?.*(?:jock\s*strap|jockstrap)/i },
];
function adultReason(p) {
  const t = `${p.title} ${p.description || ''}`.toLowerCase();
  for (const rule of ADULT_COMBO_RULES) {
    if (rule.pattern.test(t)) return rule.reason;
  }
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const term of ADULT_TERMS) {
    if (new RegExp('(^|[^a-z0-9])' + esc(term) + '([^a-z0-9]|$)', 'i').test(t)) return 'matched ' + term;
  }
  return null;
}

async function getProductDetail(id) {
  const response = await callAE('aliexpress.ds.product.get', {
    product_id: id, ship_to_country: 'RO', target_currency: 'USD', target_language: 'EN',
  });
  const result = response.aliexpress_ds_product_get_response?.result;
  if (!result) throw new Error('AE product detail missing result');
  return result;
}

function mapProduct(result, fallbackId) {
  const base = result.ae_item_base_info_dto || {};
  const multimedia = result.ae_multimedia_info_dto || {};
  const logistics = result.logistics_info_dto || {};
  const store = result.ae_store_info || {};
  const packageInfo = result.package_info_dto || {};
  const id = String(base.product_id || fallbackId);
  const rawSkus = asArray(result.ae_item_sku_info_dtos);
  const skuList = rawSkus.length ? rawSkus : [{}];
  const variants = skuList.map(sku => {
    const props = skuProps(sku);
    const options = {};
    for (const p of props) if (p.name && p.value) options[optionName(p.name)] = p.value;
    const skuId = String(sku.sku_id || sku.id || sku.sku_attr || `${id}-default`);
    const skuAttr = String(sku.sku_attr || sku.id || `default-${id}`);
    const priceUsd = numberOf(sku.offer_sale_price ?? sku.sku_price ?? base.sale_price ?? base.original_price, 0);
    const stock = intOf(sku.sku_available_stock ?? base.sale_count ?? 0, 0);
    return {
      sourceVariantId: skuId,
      title: Object.values(options).filter(Boolean).join(' / ') || 'Standard',
      options,
      priceRon: Math.round(priceUsd * 4.60),  // legacy field, real price comes from pricing recalc
      stock,
      status: stock > 0 ? 'active' : 'out_of_stock',
      metadata: {
        source: 'official_ae_api',
        ae_product_id: id,
        ae_product_url: `https://www.aliexpress.com/item/${id}.html`,
        ae_sku_id: skuId,
        ae_sku_attr: skuAttr,
        ae_sku_properties: props,
        ae_price_usd: priceUsd,
        ae_original_price_usd: numberOf(sku.sku_price, priceUsd),
        ae_currency: sku.currency_code || 'USD',
        ae_stock: stock,
        ae_price_include_tax: sku.price_include_tax ?? null,
      },
    };
  });
  if (!variants.length) throw new Error('Product has no variants');
  const videoDtos = asArray(multimedia?.ae_video_dtos?.ae_video_d_t_o ?? multimedia?.ae_video_dtos);
  const videos = videoDtos.filter(v => v && (v.media_url || v.url)).map(v => ({
    url: String(v.media_url || v.url), poster: v.poster_url || v.poster || null,
    mediaId: v.media_id != null ? String(v.media_id) : null,
    type: v.media_type || 'video', status: v.media_status || null,
  }));
  return {
    id, title: String(base.subject || ''),
    description: String(base.detail || base.subject || ''),
    images: splitImages(multimedia.image_urls),
    videos, sourceUrl: `https://www.aliexpress.com/item/${id}.html`,
    rating: numberOf(base.avg_evaluation_rating, 0),
    orders: intOf(base.sales_count, 0),
    deliveryDays: intOf(logistics.delivery_time, 20),
    categoryId: base.category_id ?? null,
    store, packageInfo,
    shipToCountry: logistics.ship_to_country || null,
    variants,
  };
}

// ─── INSERT PRODUCT ──────────────────────────────────────────────────────────
async function upsertProduct(client, product, categoryHint, sourceFiles, aeCategories, chainCache, nodesBySlug, slugByAeLeafId) {
  const ar = adultReason(product);
  const tax = resolveTaxonomyV2({
    displayName: product.title,
    labelHint: '',
    postCatIds: product.categoryId ? [product.categoryId] : [],
    leafCatId: product.categoryId || null,
    aeCategoryId: product.categoryId || null,
  }, aeCategories, chainCache);
  const uiTax = resolveSlug(uiTaxonomyMatcher, tax.department, tax.category, tax.subcategory);
  const taxonomySlug = tax.slug;
  // Shortcut: daca avem mapping direct ae_category_id -> slug (din statistici prior), foloseste-l (confidence 0.95).
  // Altfel cad pe resolverul uiTaxonomyMatcher (chain-based, mai zgomotos).
  const aeIdStr = product.categoryId != null ? String(product.categoryId) : null;
  const directSlug = aeIdStr ? slugByAeLeafId?.get(aeIdStr) : null;
  const taxonomyNodeSlug = directSlug || uiTax.slug;
  if (directSlug) {
    tax.reason = `${tax.reason}_ae_leaf_direct`;
    tax.confidence = Math.max(tax.confidence, 0.95);
    tax.unresolved = false;  // mapare directa AE id -> slug, certitudine din statistici
  }
  // canonical_category text = display_name_ro din taxonomy_nodes (sursa unica de adevar),
  // NU tax.canonical (care e 'Fashion > Men > Suits & Sets > <titlul produsului>' din resolver-ul AE).
  const canonicalCategory = nodesBySlug?.get(taxonomyNodeSlug) || tax.canonical;
  const totalStock = product.variants.reduce((s, v) => s + v.stock, 0);
  const activePrices = product.variants.filter(v => v.status === 'active').map(v => centsRon(v.priceRon)).filter(Number.isFinite);
  const priceCents = activePrices.length ? Math.min(...activePrices) : centsRon(product.variants[0].priceRon);
  const productStatus = tax.unresolved || totalStock <= 0 ? 'draft' : 'active';
  const slug = `${slugify(product.title) || 'aliexpress-product'}-${product.id}`;

  const metadata = {
    imported_from_official_ae_api: true,
    ae_product_id: product.id,
    ae_category_id: tax.aeCategoryId ?? product.categoryId,
    ae_root_category_id: tax.aeRootCategoryId,
    ae_root_category_name: tax.aeRootCategoryName,
    ae_ship_to_country: product.shipToCountry,
    ae_package: product.packageInfo,
    ae_store: product.store,
    product_type: tax.leaf,
    ae_category_name: tax.leaf,
    taxonomy_resolver_version: 2,
    taxonomy_node_slug: taxonomyNodeSlug,
    taxonomy_node_confidence: uiTax.confidence,
    ae_chain_ids: tax.chainIds || [],
    ae_chain_names_ro: tax.chainNamesRo || [],
    taxonomy_unresolved: Boolean(tax.unresolved),
    taxonomy_unresolved_reason: tax.unresolvedReason || null,
    images: product.images,
    videos: product.videos,
    ae_video_url: product.videos[0]?.url || null,
    ae_video_poster: product.videos[0]?.poster || null,
    rating: product.rating,
    orders_count: product.orders,
    delivery_days: product.deliveryDays,
    bulk_import: { category_hint: categoryHint, source_files: sourceFiles, imported_at: new Date().toISOString() },
  };

  if (process.env.DEBUG_INSERT) {
    console.error('DEBUG_INSERT', JSON.stringify({
      product_id: product.id, priceCents, totalStock,
      variant_count: product.variants.length,
      variant_prices: product.variants.map(v => ({ priceRon: v.priceRon, cents: centsRon(v.priceRon), status: v.status }))
    }));
  }
  const inserted = await client.query(`
    INSERT INTO marketplace_products (
      external_product_id, slug, title, description, category, product_url,
      image_url, status, currency, price_cents, compare_at_price_cents,
      inventory_status, metadata, source_type, supplier, supplier_product_id,
      supplier_url, supplier_cost_cents, canonical_category, canonical_category_slug,
      classification_confidence, classification_reason, taxonomy_department,
      taxonomy_category, taxonomy_subcategory, taxonomy_leaf, taxonomy_slug,
      taxonomy_node_slug, taxonomy_confidence, taxonomy_reason, is_adult, adult_reason, taxonomy_unresolved, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $21, 'RON', $8::int, NULL,
      $9, $10::jsonb, 'aliexpress', 'aliexpress', $1,
      $6, NULL, $11, $12,
      $13, $14, $15,
      $16, $17, $18, $12,
      $23, $13, $14, $19, $20, $22, now(), now()
    )
    ON CONFLICT (source_type, supplier, supplier_product_id)
    WHERE supplier_product_id IS NOT NULL
    DO UPDATE SET
      title=EXCLUDED.title, description=EXCLUDED.description, category=EXCLUDED.category,
      product_url=EXCLUDED.product_url, image_url=EXCLUDED.image_url, status=EXCLUDED.status,
      currency=EXCLUDED.currency,
      -- price_cents intentionally NOT updated here; recomputed by recalcPricing below
      inventory_status=EXCLUDED.inventory_status, metadata=EXCLUDED.metadata,
      -- supplier_cost_cents / shipping_cost_cents kept NULL until recalcPricing
      supplier_cost_cents=NULL, shipping_cost_cents=NULL,
      -- canonical_* derivă din taxonomy_node_slug: dacă slug-ul e protejat (manual_*),
      -- păstrăm și canonical_* ca să nu introducem mismatch între ele.
      canonical_category      = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.canonical_category      ELSE EXCLUDED.canonical_category      END,
      canonical_category_slug = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.canonical_category_slug ELSE EXCLUDED.canonical_category_slug END,
      -- Pastreaza fix-urile manuale: daca taxonomy_reason curent incepe cu 'manual_', nu rescrie campurile de clasificare
      taxonomy_department  = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.taxonomy_department  ELSE EXCLUDED.taxonomy_department  END,
      taxonomy_category    = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.taxonomy_category    ELSE EXCLUDED.taxonomy_category    END,
      taxonomy_subcategory = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.taxonomy_subcategory ELSE EXCLUDED.taxonomy_subcategory END,
      taxonomy_leaf        = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.taxonomy_leaf        ELSE EXCLUDED.taxonomy_leaf        END,
      taxonomy_slug        = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.taxonomy_slug        ELSE EXCLUDED.taxonomy_slug        END,
      taxonomy_node_slug   = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.taxonomy_node_slug   ELSE EXCLUDED.taxonomy_node_slug   END,
      taxonomy_confidence  = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.taxonomy_confidence  ELSE EXCLUDED.taxonomy_confidence  END,
      taxonomy_reason      = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.taxonomy_reason      ELSE EXCLUDED.taxonomy_reason      END,
      is_adult             = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.is_adult             ELSE EXCLUDED.is_adult             END,
      adult_reason         = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.adult_reason         ELSE EXCLUDED.adult_reason         END,
      taxonomy_unresolved  = CASE WHEN marketplace_products.taxonomy_reason LIKE 'manual_%' THEN marketplace_products.taxonomy_unresolved  ELSE EXCLUDED.taxonomy_unresolved  END,
      updated_at=now()
    RETURNING id::text AS id
  `, [
    product.id, slug, product.title, product.description, canonicalCategory, product.sourceUrl,
    product.images[0] || null, priceCents, totalStock > 0 ? 'in_stock' : 'out_of_stock',
    // $11=canonical_category (RO label din taxonomia AE), $12=canonical_category_slug (sursa de adevar = taxonomyNodeSlug, nu AE-derived taxonomySlug)
    JSON.stringify(metadata), canonicalCategory, taxonomyNodeSlug, tax.confidence,
    `ae_resolver_${tax.reason}${ar ? '_adult_checked' : ''}`,
    tax.department, tax.category, tax.subcategory, tax.leaf,
    Boolean(ar), ar, productStatus, Boolean(tax.unresolved), taxonomyNodeSlug,
  ]);
  const productDbId = inserted.rows[0].id;

  for (const v of product.variants) {
    const image = v.metadata.ae_sku_properties.find(p => p.image)?.image || null;
    await client.query(`
      INSERT INTO marketplace_product_variants (
        product_id, external_variant_id, sku, title, attributes,
        currency, price_cents, inventory_quantity, status, metadata, created_at, updated_at
      ) VALUES ($1, $2, $2, $3, $4::jsonb, 'RON', $5, $6, $7, $8::jsonb, now(), now())
      ON CONFLICT (product_id, external_variant_id) WHERE external_variant_id IS NOT NULL
      DO UPDATE SET sku=EXCLUDED.sku, title=EXCLUDED.title, attributes=EXCLUDED.attributes,
        price_cents=EXCLUDED.price_cents, inventory_quantity=EXCLUDED.inventory_quantity,
        status=EXCLUDED.status, metadata=EXCLUDED.metadata, updated_at=now()
    `, [productDbId, v.sourceVariantId, v.title, JSON.stringify({ ...v.options, image_url: image }),
        centsRon(v.priceRon), v.stock, v.status, JSON.stringify(v.metadata)]);
  }
  return productDbId;
}

// ─── PRICING RECALC (inline, single product) ─────────────────────────────────
const RON_PER_USD = 4.60;
async function recalcPricing(client, productDbId) {
  // 1. Variants: cost from ae_price_usd, shipping from product gross_weight
  await client.query(`
    UPDATE marketplace_product_variants v
       SET supplier_cost_cents = ROUND((v.metadata->>'ae_price_usd')::numeric * $1 * 100)::int,
           shipping_cost_cents = (
             CASE
               WHEN p.metadata->'ae_package'->>'gross_weight' IS NULL THEN ROUND(3 * $1 * 100)::int
               WHEN (p.metadata->'ae_package'->>'gross_weight')::numeric <= 0.2 THEN ROUND(2 * $1 * 100)::int
               WHEN (p.metadata->'ae_package'->>'gross_weight')::numeric <= 0.5 THEN ROUND(3 * $1 * 100)::int
               WHEN (p.metadata->'ae_package'->>'gross_weight')::numeric <= 1.0 THEN ROUND(5 * $1 * 100)::int
               ELSE ROUND(8 * $1 * 100)::int
             END
           ),
           updated_at = now()
      FROM marketplace_products p
     WHERE v.product_id = p.id
       AND v.product_id = $2::uuid
       AND v.metadata ? 'ae_price_usd'
  `, [RON_PER_USD, productDbId]);

  // 2+3 combined: set cost/ship AND price/compare in ONE statement so check
  //               constraint (price >= cost+ship) is satisfied atomically.
  await client.query(`
    WITH agg AS (
      SELECT MIN(supplier_cost_cents) AS min_cost, MIN(shipping_cost_cents) AS min_ship
      FROM marketplace_product_variants
      WHERE product_id = $1::uuid AND supplier_cost_cents IS NOT NULL
    )
    UPDATE marketplace_products p
       SET supplier_cost_cents = agg.min_cost,
           shipping_cost_cents = agg.min_ship,
           price_cents = ROUND(
             (agg.min_cost + COALESCE(agg.min_ship,0)) *
             CASE
               WHEN (agg.min_cost + COALESCE(agg.min_ship,0)) <  2500 THEN 3.0
               WHEN (agg.min_cost + COALESCE(agg.min_ship,0)) < 10000 THEN 2.0
               ELSE 1.7
             END * 1.21
           )::int,
           compare_at_price_cents = ROUND(
             ROUND(
               (agg.min_cost + COALESCE(agg.min_ship,0)) *
               CASE
                 WHEN (agg.min_cost + COALESCE(agg.min_ship,0)) <  2500 THEN 3.0
                 WHEN (agg.min_cost + COALESCE(agg.min_ship,0)) < 10000 THEN 2.0
                 ELSE 1.7
               END * 1.21
             )::int * 1.30
           )::int,
           updated_at = now()
      FROM agg
     WHERE p.id = $1::uuid AND agg.min_cost IS NOT NULL
  `, [productDbId]);
}

// ─── MAIN LOOP ───────────────────────────────────────────────────────────────
let stopRequested = false;
process.on('SIGTERM', () => { log('warn', 'SIGTERM, will exit after current product'); stopRequested = true; });
process.on('SIGINT',  () => { log('warn', 'SIGINT, will exit after current product');  stopRequested = true; });

const minDelayMs = Math.floor(1000 / QPS);
let lastCallAt = 0;
async function rateLimit() {
  const wait = lastCallAt + minDelayMs - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCallAt = Date.now();
}

async function main() {
  log('info', 'worker boot', { plan: PLAN, limit: LIMIT, qps: QPS, no_pricing: NO_PRICING });

  // Preload taxonomy resolver caches once.
  const aeCategories = await loadCategories(pool);
  const chainCache = await loadFullChainCache(pool);
  // Cache UI taxonomy nodes -> display_name_ro pentru canonical_category text consistent.
  // + cache reverse ae_leaf_id -> slug pentru shortcut la resolver (skip chain walk daca avem mapping).
  const nodesBySlug = new Map();
  const slugByAeLeafId = new Map();
  {
    const { rows } = await pool.query(`SELECT slug, ae_leaf_ids, metadata->>'display_name_ro' AS ro, metadata->>'display_name' AS en FROM taxonomy_nodes WHERE is_active = true`);
    for (const r of rows) {
      nodesBySlug.set(r.slug, r.ro || r.en || r.slug);
      for (const ae of (r.ae_leaf_ids || [])) slugByAeLeafId.set(String(ae), r.slug);
    }
  }
  log('info', 'taxonomy caches loaded', { ae_categories: aeCategories.size, ui_nodes: nodesBySlug.size, ae_leaf_mappings: slugByAeLeafId.size });

  let processed = 0, succeeded = 0, failed = 0, skipped = 0;
  const startedAt = Date.now();

  const rl = readline.createInterface({ input: fs.createReadStream(PLAN, 'utf8') });
  for await (const line of rl) {
    if (stopRequested) break;
    if (succeeded >= LIMIT) break;
    const trim = line.trim();
    if (!trim) continue;
    let plan;
    try { plan = JSON.parse(trim); } catch { continue; }
    const pid = plan.product_id;
    if (!/^\d{10,20}$/.test(pid)) continue;

    processed++;

    // Skip if done/skipped
    const existing = await pool.query(`SELECT status, attempts FROM ae_import_jobs WHERE product_id=$1`, [pid]);
    if (existing.rows[0]?.status === 'done' || existing.rows[0]?.status === 'skipped') { skipped++; continue; }
    const attempts = (existing.rows[0]?.attempts || 0) + 1;
    if (attempts > 5) { skipped++; continue; }  // give up

    // Upsert job row as running
    await pool.query(`
      INSERT INTO ae_import_jobs (product_id, status, category_hint, source_files, attempts)
      VALUES ($1,'running',$2,$3,$4)
      ON CONFLICT (product_id) DO UPDATE
      SET status='running', attempts=$4,
          category_hint=COALESCE(EXCLUDED.category_hint, ae_import_jobs.category_hint),
          source_files=$3
    `, [pid, plan.category_hint || null, plan.source_files || [], attempts]);

    try {
      await rateLimit();
      const detail = await getProductDetail(pid);
      const product = mapProduct(detail, pid);

      const adultGate = adultReason(product);
      if (adultGate) {
        await pool.query(`UPDATE ae_import_jobs SET status='skipped', last_error=$2, fetched_at=now() WHERE product_id=$1`, [pid, `adult_blocked:${adultGate}`.slice(0, 500)]);
        skipped++;
        log('info', 'adult skipped', { product_id: pid, reason: adultGate });
        continue;
      }

      const client = await pool.connect();
      let productDbId = null;
      try {
        await client.query('BEGIN');
        productDbId = await upsertProduct(client, product, plan.category_hint, plan.source_files, aeCategories, chainCache, nodesBySlug, slugByAeLeafId);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      if (!NO_PRICING) {
        const c2 = await pool.connect();
        try { await recalcPricing(c2, productDbId); } finally { c2.release(); }
      }

      await pool.query(`UPDATE ae_import_jobs SET status='done', last_error=NULL, imported_db_id=$2, fetched_at=now() WHERE product_id=$1`, [pid, productDbId]);
      succeeded++;
      if (succeeded % 25 === 0) {
        const rate = succeeded / ((Date.now() - startedAt) / 1000);
        log('info', 'progress', { processed, succeeded, failed, skipped, qps_real: rate.toFixed(2) });
      }
    } catch (err) {
      failed++;
      if (process.env.DEBUG_INSERT) {
        console.error('FULL_ERR', JSON.stringify({
          message: err?.message, code: err?.code, detail: err?.detail, hint: err?.hint,
          where: err?.where, internalQuery: err?.internalQuery, position: err?.position,
          column: err?.column, table: err?.table, constraint: err?.constraint, schema: err?.schema,
        }));
      }
      await pool.query(`UPDATE ae_import_jobs SET status='failed', last_error=$2 WHERE product_id=$1`, [pid, String(err?.message || err).slice(0, 500)]);
      log('error', 'import failed', { product_id: pid, error: String(err?.message || err).slice(0, 200) });
    }
  }

  log('info', 'worker done', { processed, succeeded, failed, skipped, elapsed_s: Math.round((Date.now() - startedAt) / 1000) });
  await pool.end();
  logStream.end();
  process.exit(0);
}

main().catch(e => { log('fatal', 'worker crashed', { error: String(e?.message || e), stack: e?.stack }); process.exit(1); });
