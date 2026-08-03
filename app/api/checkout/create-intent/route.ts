import { NextResponse } from "next/server";
import { getCheckoutProductById } from "@/lib/db/product-queries";
import { dbQuery } from "@/lib/db";
import { resolveCheckoutAttribution } from "@/lib/checkout/attribution";
import { getStripe } from "@/lib/stripe/checkout";
import crypto from "crypto";

import { logger } from "@/lib/logger";
import { idempotencyGet, idempotencySet, idempotencyClaim, idempotencyRelease, clientIp } from "@/lib/rate-limit";
import { rateLimit } from "@/lib/security/rate-limit";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { CheckoutCreateIntentSchema, parseBody } from "@/lib/validation/schemas";
import { applySwypToTotal } from "@/lib/swyp/hybrid-payment";
import { refundSwypForUnpaidOrder } from "@/lib/swyp/refund";
function parseQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return null;
  return quantity;
}

export async function POST(req: Request) {
  let claimedKey: string | null = null;
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
    const rlKey = uid ? `u:${uid}` : `ip:${clientIp(req)}`;
    const rl = await rateLimit("checkout", rlKey, { limit: 10, window: 60 });
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "Prea multe cereri. Reîncearcă în câteva secunde." },
        { status: 429, headers: { "Retry-After": "60" } }
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
      // Rezervare atomică: două cereri concurente cu aceeași cheie nu au voie
      // să creeze amândouă comenzi + debit SWYP în fereastra get-then-set.
      const claimed = await idempotencyClaim(`checkout:${idempotencyKey}`, 60);
      if (!claimed) {
        return NextResponse.json(
          { success: false, error: "În curs de procesare. Reîncearcă în câteva secunde." },
          { status: 409 },
        );
      }
      claimedKey = idempotencyKey;
    }


    const checkoutItems = [];
    let totalCents = 0;

    for (const item of rawItems) {
      const productId = String(item.productId || item.pgId || "").trim();
      const qty = parseQuantity(item.quantity || 1);
      if (!productId || !qty) {
        return NextResponse.json({ success: false, error: "Produs sau cantitate invalidă." }, { status: 400 });
      }

      const pgProduct = await getCheckoutProductById(productId);
      if (!pgProduct) {
        return NextResponse.json(
          { success: false, error: "Unul dintre produse nu mai este disponibil. Reîncarcă coșul." },
          { status: 400 }
        );
      }

      // Validare stoc (aliniat cu /api/checkout — fix oversell audit extern)
      const baseStock = (pgProduct as any).metadata?.available_stock ?? (pgProduct as any).stock;
      if (baseStock !== undefined && baseStock !== null && qty > Number(baseStock)) {
        return NextResponse.json(
          { success: false, error: `Stoc insuficient pentru "${pgProduct.title}". Ai cerut ${qty}, dar avem doar ${baseStock} disponibile.` },
          { status: 400 }
        );
      }

      let variantPriceCents = Math.round(pgProduct.price * 100);
      let variantId: string | null = null;

      if (item.skuId) {
        const { rows } = await dbQuery(
          `SELECT id, price_cents, inventory_quantity AS stock FROM marketplace_product_variants WHERE product_id = $1 AND sku = $2 LIMIT 1`,
          [pgProduct.productId, String(item.skuId)]
        );
        if (rows.length > 0 && Number(rows[0].price_cents) > 0) {
          variantId = String(rows[0].id);
          variantPriceCents = Number(rows[0].price_cents);
        }
        if (rows.length > 0 && rows[0].stock !== null && qty > Number(rows[0].stock)) {
          return NextResponse.json(
            { success: false, error: `Stoc insuficient pentru "${pgProduct.title}". Ai cerut ${qty}, dar avem doar ${rows[0].stock} disponibile.` },
            { status: 400 }
          );
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
        priceCents: variantPriceCents,
        quantity: qty,
        skuId: item.skuId,
        variantId,
        sellerId: pgProduct.sellerId,
        ...attribution,
      });

      totalCents += variantPriceCents * qty;
    }

    if (checkoutItems.length === 0) {
      return NextResponse.json({ success: false, error: "Produse indisponibile." }, { status: 400 });
    }

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
          item.priceCents,
          item.priceCents * item.quantity,
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

    // Din acest punct SWYP-ul e deja debitat. Dacă Stripe eșuează, comanda nu
    // se va plăti niciodată, deci trebuie să întoarcem SWYP-ul imediat —
    // altfel userul rămâne fără el pe un `pending` mort, iar retry-ul creează
    // altă comandă și debitează din nou.
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
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
      }, { idempotencyKey: `pi:${orderId}` });
    } catch (stripeErr) {
      if (swypCents > 0) {
        try {
          await refundSwypForUnpaidOrder({
            orderId,
            refType: "swyp_refund_intent",
            refId: `create_failed:${orderId}`,
            reason: "stripe_intent_create_failed",
          });
        } catch (refundErr) {
          logger.error(
            { err: refundErr, orderId, swypCents },
            "[Create Intent] SWYP refund failed after Stripe error — needs manual reconciliation",
          );
        }
      }
      await dbQuery(
        `UPDATE commerce_orders SET status = 'failed' WHERE id = $1 AND status = 'pending'`,
        [orderId],
      ).catch(() => undefined);
      throw stripeErr;
    }

    await dbQuery(
      `UPDATE commerce_orders SET metadata = metadata || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ stripe_payment_intent: paymentIntent.id }), orderId]
    );

    const responsePayload = {
      success: true,
      clientSecret: paymentIntent.client_secret,
      totalRon: totalCents / 100,
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
    if (claimedKey) await idempotencyRelease(`checkout:${claimedKey}`);
    const type = (error as { type?: string } | null)?.type ?? "";
    if (type === "StripeAuthenticationError" || type === "StripePermissionError") {
      return NextResponse.json(
        { success: false, error: "Plățile cu cardul nu sunt disponibile momentan. Te rugăm să încerci mai târziu." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: "A apărut o eroare la inițierea plății. Te rugăm să încerci din nou." },
      { status: 500 }
    );
  }
}
