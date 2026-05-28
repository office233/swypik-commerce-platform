import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { labelProduct } from "@/lib/moderation/labelProduct";
import { autoEmbedProduct } from "@/lib/ai/auto-embed";
import { rateLimit } from "@/lib/security/rate-limit";
import { SellerProductCreateSchema, parseBody } from "@/lib/validation/schemas";
import { isLocale, LOCALE_COOKIE, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { translateProductToLocales } from "@/lib/ai/product-translator";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const SELLER_PRODUCT_COLS = `
  id, title, slug, price_cents, compare_at_price_cents, currency, category,
  status, inventory_status, image_url, source_type, supplier_product_id,
  metadata, created_at, updated_at
`;

export async function GET(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") || 20);
    const rawOffset = Number(url.searchParams.get("offset") || 0);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 20;
    const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;

    const { rows } = await dbQuery(
      `SELECT ${SELLER_PRODUCT_COLS}
       FROM marketplace_products
       WHERE seller_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [sellerId, limit, offset],
    );

    return NextResponse.json({ success: true, products: rows, limit, offset, hasMore: rows.length === limit });
  } catch (error: any) {
    logger.error({ err: error }, "[Seller Products API] GET Error:");
    return NextResponse.json({ success: false, error: "Eroare la preluarea produselor." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("sellerProducts", sellerId);
    if (!rl.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

    const raw = await req.json().catch(() => null);
    const parsed = parseBody(SellerProductCreateSchema, raw);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const d = parsed.data;

    if (d.compare_at_price && d.compare_at_price < d.price) {
      return NextResponse.json({ success: false, error: "Prețul comparativ trebuie să fie mai mare decât prețul curent." }, { status: 400 });
    }
    if (
      d.shipping_days_min !== undefined &&
      d.shipping_days_max !== undefined &&
      d.shipping_days_max < d.shipping_days_min
    ) {
      return NextResponse.json({ success: false, error: "Interval livrare invalid." }, { status: 400 });
    }

    const priceCents = Math.round(d.price * 100);
    const compareCents = d.compare_at_price ? Math.round(d.compare_at_price * 100) : null;
    const supplierCostCents = d.supplier_cost ? Math.round(d.supplier_cost * 100) : null;
    const shippingCostCents = d.shipping_cost !== undefined ? Math.round(d.shipping_cost * 100) : null;
    const firstImage = d.image_urls?.[0] || null;
    const slug = `${slugify(d.title)}-${Date.now().toString(36)}`;
    const inventoryStatus = d.stock > 0 ? "in_stock" : "out_of_stock";

    const meta: Record<string, unknown> = {
      seller_id: sellerId,
      available_stock: d.stock,
    };
    if (d.sku) meta.sku = d.sku;
    if (d.image_urls?.length) meta.image_urls = d.image_urls;
    if (d.shipping_days_min !== undefined) meta.shipping_days_min = d.shipping_days_min;
    if (d.shipping_days_max !== undefined) meta.shipping_days_max = d.shipping_days_max;
    if (d.courier) meta.courier = d.courier;

    const { rows } = await dbQuery(
      `INSERT INTO marketplace_products (
        source_type, seller_id, title, slug, description, brand,
        price_cents, compare_at_price_cents, supplier_cost_cents, shipping_cost_cents,
        category, taxonomy_node_slug, currency, status, inventory_status,
        image_url, metadata
      ) VALUES (
        'seller', $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, 'active', $13,
        $14, $15::jsonb
      )
      RETURNING ${SELLER_PRODUCT_COLS}`,
      [
        sellerId,
        d.title,
        slug,
        d.description ?? null,
        d.brand ?? null,
        priceCents,
        compareCents,
        supplierCostCents,
        shippingCostCents,
        d.category ?? "General",
        d.taxonomy_node_slug ?? null,
        d.currency,
        inventoryStatus,
        firstImage,
        JSON.stringify(meta),
      ],
    );

    const productId: string | undefined = rows[0]?.id;

    if (productId && d.variants?.length) {
      for (const v of d.variants) {
        await dbQuery(
          `INSERT INTO marketplace_product_variants (
             product_id, sku, title, attributes, currency, price_cents, inventory_quantity, status, metadata
           ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, 'active', '{}'::jsonb)`,
          [
            productId,
            v.sku ?? null,
            v.title ?? null,
            JSON.stringify(v.attributes ?? {}),
            d.currency,
            v.price_cents ?? priceCents,
            v.inventory_quantity ?? null,
          ],
        ).catch((e) => logger.warn({ err: e?.message }, "[seller/products] variant insert failed"));
      }
    }

    if (productId) {
      autoEmbedProduct(productId, rows[0].title, d.description ?? null);
      labelProduct({
        id: productId,
        title: rows[0].title,
        description: d.description ?? null,
        category: rows[0].category ?? null,
      }).catch(() => {});

      // Persist a translation row for the locale the seller used (source='seller').
      const cookieStore = await cookies();
      const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
      const sellerLocale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
      await dbQuery(
        `INSERT INTO product_translations (product_id, locale, title, description, slug, source)
         VALUES ($1, $2, $3, $4, $5, 'seller')
         ON CONFLICT (product_id, locale) DO UPDATE
           SET title = EXCLUDED.title,
               description = EXCLUDED.description,
               slug = EXCLUDED.slug,
               source = 'seller'`,
        [productId, sellerLocale, d.title, d.description ?? null, slug],
      ).catch((e) => logger.warn({ err: e?.message }, "[seller/products] translation insert failed"));

      // Fire-and-forget: translate to the other RO/EN target so storefront has both.
      const targetLocales: Locale[] = sellerLocale === "ro" ? ["en"] : ["ro"];
      translateProductToLocales({
        productId,
        sourceLocale: sellerLocale,
        title: d.title,
        description: d.description ?? null,
        targetLocales,
      }).catch((e) => logger.warn({ err: e?.message }, "[seller/products] translate fanout failed"));
    }
    return NextResponse.json({ success: true, product: rows[0] });
  } catch (error: any) {
    logger.error({ err: error }, "[Seller Products API] POST Error:");
    return NextResponse.json({ success: false, error: "Eroare la adaugarea produsului." }, { status: 500 });
  }
}
