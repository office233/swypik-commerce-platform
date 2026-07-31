import { NextResponse } from "next/server";
import { getCheckoutProductById } from "@/lib/db/product-queries";
import { dbQuery } from "@/lib/db";
import { resolveCheckoutAttribution } from "@/lib/checkout/attribution";
import { getStripe } from "@/lib/stripe/checkout";
import crypto from "crypto";

import { logger } from "@/lib/logger";
import { rateLimit, idempotencyGet, idempotencySet, clientIp } from "@/lib/rate-limit";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { CheckoutCreateIntentSchema, parseBody } from "@/lib/validation/schemas";
import { applySwypToTotal } from "@/lib/swyp/hybrid-payment";
function parseQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return null;
  return quantity;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json().catch(() => null);
    const parsed = parseBody(CheckoutCreateIntentSchema, rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const rawItems = parsed.data.products;
    const idempotencyKey = parsed.data.idempotencyKey ?? null;

    // Rate limit per user (if authed) or per IP: max 10 req/min
    const uid = await getOptionalSocialUserId().catch(() => null);
    const rlKey = uid ? `checkout:u:${uid}` : `checkout:ip:${clientIp(req)}`;
    const rl = await rateLimit(rlKey, 10, 60);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "Prea multe cereri. Reîncearcă în câteva secunde." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }

    // User-level fraud block — refuse checkout entirely
    if (uid) {
      const { isUserFraudBlocked } = await import("@/lib/risk/user-block");
      if (await isUserFraudBlocked(uid)) {
        logger.warn({ uid }, "[checkout] fraud-blocked user attempted checkout");
        return NextResponse.json(
          { success: false, error: "Contul nu poate plasa comenzi momentan. Te rugăm contactează support@swypik.com." },
          { status: 403 }
        );
      }
    }

    // Idempotency: return cached response if present
    if (idempotencyKey) {
      const cached = await idempotencyGet<any>(`checkout:${idempotencyKey}`);
      if (cached) {
        return NextResponse.json(cached);
      }
    }


    const checkoutItems = [];
    let totalRon = 0;

    for (const item of rawItems) {
      const productId = String(item.productId || item.pgId || "").trim();
      const qty = parseQuantity(item.quantity || 1);
      if (!productId || !qty) {
        return NextResponse.json({ success: false, error: "Produs sau cantitate invalidă." }, { status: 400 });
      }

      const pgProduct = await getCheckoutProductById(productId);
      if (!pgProduct) continue;

      let variantPrice = pgProduct.price;
      let variantId: string | null = null;
      
      if (item.skuId) {
        const { rows } = await dbQuery(
          `SELECT id, price_cents FROM marketplace_product_variants WHERE product_id = $1 AND sku = $2 LIMIT 1`,
          [pgProduct.productId, String(item.skuId)]
        );
        if (rows.length > 0 && Number(rows[0].price_cents) > 0) {
          variantId = String(rows[0].id);
          variantPrice = Number(rows[0].price_cents) / 100;
        }
      }

      const attribution = await resolveCheckoutAttribution(
        pgProduct.productId,
        item.videoId ? String(item.videoId) : null,
      );

      checkoutItems.push({
        productId,
        aeProductId: pgProduct.aeProductId,
        pgId: pgProduct.productId,
        title: pgProduct.title,
        price: variantPrice,
        quantity: qty,
        skuId: item.skuId,
        variantId,
        sellerId: pgProduct.sellerId,
        ...attribution,
      });

      totalRon += variantPrice * qty;
    }

    if (checkoutItems.length === 0) {
      return NextResponse.json({ success: false, error: "Produse indisponibile." }, { status: 400 });
    }

    const totalCents = Math.round(totalRon * 100);
    const orderLookupToken = crypto.randomBytes(24).toString("hex");

    // Cloudflare signals — only trusted because Caddy strips CF-* from origin traffic.
    const ipCountry = (req.headers.get("cf-ipcountry") || "").trim().toUpperCase() || null;
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 200) || null;

    // Create a pending order in our database
    const { rows: orderRows } = await dbQuery(
      `INSERT INTO commerce_orders (
        status, currency, subtotal_cents, total_cents, metadata
      ) VALUES ('pending', 'RON', $1, $1, $2::jsonb)
      RETURNING id`,
      [totalCents, JSON.stringify({
        source: "embedded_checkout",
        items: checkoutItems,
        order_lookup_token: orderLookupToken,
        checkout_ip_country: ipCountry,
        checkout_user_agent: userAgent,
        checkout_at: new Date().toISOString(),
      })]
    );
    const orderId = orderRows[0].id;

    // Insert order items
    for (const item of checkoutItems) {
      await dbQuery(
        `INSERT INTO commerce_order_items (
          order_id, product_id, variant_id, creator_id, video_id, creator_product_link_id,
          external_line_item_id, title, quantity, currency, unit_amount_cents,
          gross_amount_cents, commissionable_amount_cents, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'RON', $10, $11, $11, $12::jsonb)`,
        [
          orderId,
          item.pgId,
          item.variantId,
          item.creatorId,
          item.videoId,
          item.creatorProductLinkId,
          `${item.pgId}:${item.skuId || "default"}`,
          item.title,
          item.quantity,
          Math.round(item.price * 100),
          Math.round(item.price * item.quantity * 100),
          JSON.stringify({
            source: "manual",
            product_id: item.productId,
            pg_id: item.pgId,
            ae_product_id: item.aeProductId,
            seller_id: item.sellerId || null,
            sku_id: item.skuId || null,
            video_id: item.videoId || null,
            creator_id: item.creatorId || null,
            creator_product_link_id: item.creatorProductLinkId || null,
          }),
        ]
      );
    }

    const stripe = getStripe();

    // ── Plată hibridă cu SWYP ────────────────────────────────────────────
    // Acoperim din SWYP cât permit soldul, cursul, fondul și plafonul (50%),
    // iar restul merge pe card. Idempotent după orderId; dacă ceva nu merge,
    // `applySwypToTotal` întoarce totalul neatins — vânzarea nu se blochează.
    const swypRequestedCents = parsed.data.swypCents ?? 0;
    const wantsSwyp = swypRequestedCents > 0 || Boolean(parsed.data.useSwyp);
    const { swypCents, remainingCents } = wantsSwyp && uid
      ? await applySwypToTotal({
          userId: uid,
          totalCents,
          requestedCents: swypRequestedCents,
          refType: "commerce_order",
          refId: orderId,
        })
      : { swypCents: 0, remainingCents: totalCents };

    if (swypCents > 0) {
      await dbQuery(
        `UPDATE commerce_orders
            SET swyp_paid_cents = $2, total_cents = $3,
                metadata = metadata || jsonb_build_object('swyp_paid_cents', $2::int)
          WHERE id = $1`,
        [orderId, swypCents, remainingCents],
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: remainingCents,
      currency: "ron",
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        orderId: orderId,
        expectedAmount: String(remainingCents),
        expectedCurrency: "RON",
        swypPaidCents: String(swypCents),
      }
    });

    await dbQuery(
      `UPDATE commerce_orders SET metadata = metadata || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ stripe_payment_intent: paymentIntent.id }), orderId]
    );

    const responsePayload = {
      success: true,
      clientSecret: paymentIntent.client_secret,
      totalRon,
      orderId,
      orderLookupToken,
      swypPaidCents: swypCents,
      cardAmountCents: remainingCents,
    };
    if (idempotencyKey) {
      await idempotencySet(`checkout:${idempotencyKey}`, responsePayload, 300);
    }
    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    logger.error({ err: error }, "[Create Intent Error]");
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
