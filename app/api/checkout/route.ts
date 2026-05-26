/**
 * Checkout API — Stripe Direct
 * 
 * SECURITY: Client sends ONLY productId, quantity, skuId.
 * Server ALWAYS reads price/title/image from PostgreSQL.
 * Client-provided prices are completely ignored.
 * 
 * Flow: validate → fetch from NeonDB → create Stripe session → return URL
 */

import { NextResponse } from "next/server";
import { getCheckoutProductById } from "@/lib/db/product-queries";
import { dbQuery, getDb } from "@/lib/db";
import { resolveCheckoutAttribution } from "@/lib/checkout/attribution";
import { createCheckoutSession, type CheckoutItem } from "@/lib/stripe/checkout";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logCheckoutEvent } from "@/lib/security/audit-log";
import crypto from "crypto";


import { logger } from "@/lib/logger";
function parsePositiveInt(val: unknown, fallback: number, max: number): number {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function ronToCents(value: number): number {
  return Math.round(value * 100);
}

async function persistOpenCheckoutSession(items: CheckoutItem[], sessionId: string, expiresAt?: number | null, customerEmail?: string) {
  const client = await getDb().connect();
  const currency = "RON";
  const subtotalCents = items.reduce((sum, item) => sum + ronToCents(item.price) * item.quantity, 0);
  const orderLookupToken = crypto.randomBytes(24).toString("hex");
  const metadata = {
    provider: "stripe",
    stripe_session_id: sessionId,
    customer_email: customerEmail || null,
    fulfillment_status: "not_started",
    source: "next_checkout",
    item_count: items.length,
    order_lookup_token: orderLookupToken,
    items: items.map((item) => ({
          product_id: item.productId,
          video_id: item.videoId || null,
          creator_id: item.creatorId || null,
          creator_product_link_id: item.creatorProductLinkId || null,
          seller_id: item.sellerId || null,
          sku_id: item.skuId || null,
      title: item.title,
      quantity: item.quantity,
      unit_amount_cents: ronToCents(item.price),
      color: item.color || null,
      size: item.size || null,
    })),
  };

  try {
    await client.query("BEGIN");
    const orderResult = await client.query(
      `INSERT INTO commerce_orders (
        status, currency, subtotal_cents, total_cents, metadata, created_at
      ) VALUES ('pending', $1, $2, $2, $3::jsonb, now())
      RETURNING id`,
      [currency, subtotalCents, JSON.stringify(metadata)]
    );
    const orderId = orderResult.rows[0]?.id;
    if (!orderId) throw new Error("Could not create pending order");

    for (const item of items) {
      const unitAmountCents = ronToCents(item.price);
      const grossAmountCents = unitAmountCents * item.quantity;
      await client.query(
        `INSERT INTO commerce_order_items (
          order_id, product_id, variant_id, creator_id, video_id, creator_product_link_id,
          external_line_item_id, title, quantity, currency, unit_amount_cents,
          gross_amount_cents, commissionable_amount_cents, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13::jsonb, now())
        ON CONFLICT (order_id, external_line_item_id)
        WHERE external_line_item_id IS NOT NULL
        DO UPDATE SET
          title = EXCLUDED.title,
          quantity = EXCLUDED.quantity,
          unit_amount_cents = EXCLUDED.unit_amount_cents,
          gross_amount_cents = EXCLUDED.gross_amount_cents,
          commissionable_amount_cents = EXCLUDED.commissionable_amount_cents,
          metadata = EXCLUDED.metadata`,
        [
          orderId,
          item.productId,
          item.variantId || null,
          item.creatorId || null,
          item.videoId || null,
          item.creatorProductLinkId || null,
          `${item.productId}:${item.skuId || "default"}`,
          item.title,
          item.quantity,
          currency,
          unitAmountCents,
          grossAmountCents,
          JSON.stringify({
            source: "aliexpress",
            product_id: item.productId,
            video_id: item.videoId || null,
            creator_id: item.creatorId || null,
            creator_product_link_id: item.creatorProductLinkId || null,
            seller_id: item.sellerId || null,
            sku_id: item.skuId || null,
            color: item.color || null,
            size: item.size || null,
            image: item.image || null,
          }),
        ]
      );
    }

    await client.query(
      `INSERT INTO checkout_sessions (
        order_id, provider, provider_session_id, status, currency,
        amount_total_cents, success_url, cancel_url, expires_at, metadata, created_at
      ) VALUES ($1, 'stripe', $2, 'open', $3, $4, $5, $6, to_timestamp($7), $8::jsonb, now())
      ON CONFLICT (provider, provider_session_id)
      DO UPDATE SET
        order_id = EXCLUDED.order_id,
        status = EXCLUDED.status,
        amount_total_cents = EXCLUDED.amount_total_cents,
        expires_at = EXCLUDED.expires_at,
        metadata = EXCLUDED.metadata`,
      [
        orderId,
        sessionId,
        currency,
        subtotalCents,
        `${process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com"}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com",
        expiresAt || null,
        JSON.stringify(metadata),
      ]
    );

    await client.query("COMMIT");
    return orderLookupToken;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function POST(req: Request) {
  try {
    // Rate limit
    const ip = getClientIP(req);
    const { success: allowed } = await rateLimit("cart", ip);
    if (!allowed) {
      logCheckoutEvent("checkout_rate_limited", { clientIp: ip });
      return NextResponse.json(
        { success: false, error: "Prea multe încercări. Așteaptă un moment." },
        { status: 429 }
      );
    }

    const userAgent = req.headers.get("user-agent") || undefined;
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "invalid_body" }, { status: 400 });
    }
    const rawItems = body.items || body.products || (body.product ? [body.product] : []);
    const customer = body.customer;

    // Validate
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ success: false, error: "missing_items" }, { status: 400 });
    }
    if (rawItems.length > 10) {
      return NextResponse.json({ success: false, error: "Maxim 10 produse per comandă." }, { status: 400 });
    }

    logger.info({ items_count: rawItems.length }, "[Checkout] processing items");

    const checkoutItems: CheckoutItem[] = [];

    for (const item of rawItems) {
      const productId = String(item.productId);
      if (!productId || productId === 'undefined' || productId === 'null') {
        logger.warn(`[Checkout] Invalid productId: ${item.productId}`);
        continue;
      }

      const qty = parsePositiveInt(item.quantity, 1, 10);

      // ALWAYS fetch from NeonDB — never trust client
      const pgProduct = await getCheckoutProductById(productId);
      if (!pgProduct) {
        logger.warn(`[Checkout] Product ${productId} not found`);
        logCheckoutEvent("product_not_found", { productId, clientIp: ip, userAgent });
        return NextResponse.json(
          { success: false, error: "Produsul nu este disponibil." },
          { status: 400 }
        );
      }

      const baseStock = pgProduct.metadata?.available_stock ?? pgProduct.stock;
      if (baseStock !== undefined && baseStock !== null && item.quantity > Number(baseStock)) {
        return NextResponse.json(
          { success: false, error: `Stoc insuficient pentru "${pgProduct.title}". Ai cerut ${item.quantity}, dar avem doar ${baseStock} disponibile.` },
          { status: 400 }
        );
      }

      let variantPrice = pgProduct.price;
      let variantId: string | undefined;
      let variantColor = "";
      let variantSize = "";

      // Resolve variant
      if (item.skuId) {
        try {
          const { rows } = await dbQuery(
            `SELECT id, price_cents, attributes->>'color' as color, attributes->>'size' as size, inventory_quantity as stock FROM marketplace_product_variants 
             WHERE product_id = $1 AND sku = $2 LIMIT 1`,
            [pgProduct.productId, String(item.skuId)]
          );
          if (rows.length === 0) {
            return NextResponse.json(
              { success: false, error: "Varianta selectată nu mai este disponibilă." },
              { status: 400 }
            );
          }
          const v = rows[0];
          variantId = String(v.id);
          if (v.price_cents && Number(v.price_cents) > 0) variantPrice = Number(v.price_cents) / 100;
          if (v.color) variantColor = v.color;
          if (v.size) variantSize = v.size;
          if (v.stock !== null && item.quantity > v.stock) {
            return NextResponse.json(
              { success: false, error: `Stoc insuficient pentru "${pgProduct.title}". Ai cerut ${item.quantity}, dar avem doar ${v.stock} disponibile.` },
              { status: 400 }
            );
          }
        } catch (e) {
          logger.error({ err: e }, `[Checkout] Variant lookup error:`);
          return NextResponse.json(
            { success: false, error: "Nu am putut valida varianta selectată." },
            { status: 500 }
          );
        }
      }

      const titleParts = [pgProduct.title];
      if (variantColor) titleParts.push(variantColor);
      if (variantSize) titleParts.push(variantSize);
      const attribution = await resolveCheckoutAttribution(
        pgProduct.productId,
        item.videoId ? String(item.videoId) : null,
      );

      checkoutItems.push({
        productId: pgProduct.productId,
        title: titleParts.join(" — "),
        price: variantPrice,
        oldPrice: pgProduct.oldPrice,
        image: pgProduct.image || undefined,
        quantity: qty,
        skuId: item.skuId ? String(item.skuId) : undefined,
        variantId,
        color: variantColor || undefined,
        size: variantSize || undefined,
        sellerId: pgProduct.sellerId,
        ...attribution,
      });

      logger.info({ product_id: pgProduct.id, price: variantPrice, qty }, "[Checkout] item added");
    }

    if (checkoutItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nu am putut procesa niciun produs." },
        { status: 400 }
      );
    }

    // Create Stripe Checkout session
    const { url, sessionId, expiresAt } = await createCheckoutSession(checkoutItems, {
      customerEmail: customer?.email,
    });

    const orderLookupToken = await persistOpenCheckoutSession(checkoutItems, sessionId, expiresAt, customer?.email);

    logCheckoutEvent("checkout_success", {
      clientIp: ip,
      userAgent,
      payload: {
        itemCount: checkoutItems.length,
        sessionId,
        totalRon: checkoutItems.reduce((s, i) => s + i.price * i.quantity, 0),
        provider: "stripe",
      },
    });

    logger.info({ session_id: sessionId }, "[Checkout] stripe session created");

    return NextResponse.json({
      success: true,
      checkoutUrl: url,
      sessionId,
      orderLookupToken,
      itemCount: checkoutItems.reduce((s, i) => s + i.quantity, 0),
      currency: "RON",
    });
  } catch (error: any) {
    console.error("[Checkout] Error:", error?.message, error?.stack);
    logCheckoutEvent("checkout_fail", { error: error?.message });
    return NextResponse.json(
      { success: false, error: "Nu am putut iniția checkout-ul. Încearcă din nou." },
      { status: 500 }
    );
  }
}
