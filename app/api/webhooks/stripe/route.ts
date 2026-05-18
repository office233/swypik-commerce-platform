import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/checkout";
import { dbQuery } from "@/lib/db";
import { sendOrderConfirmation, sendRefundEmail } from "@/lib/email/service";
import { routeOrder } from "@/lib/fulfillment/order-router";
import { awardOrderSwyp } from "@/lib/swyp/order-rewards";
import { logCheckoutEvent } from "@/lib/security/audit-log";
import type Stripe from "stripe";
import { persistConnectAccount } from "@/lib/stripe/connect";
import crypto from "crypto";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

async function getRawBody(req: Request): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = req.body?.getReader();
  if (!reader) throw new Error("No body");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  return Buffer.concat(chunks);
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured");
    await logCheckoutEvent("webhook_fail", {
      error: "STRIPE_WEBHOOK_SECRET is not configured",
      payload: { stage: "configuration" },
    });
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      await logCheckoutEvent("webhook_fail", {
        error: "Missing Stripe signature",
        payload: { stage: "signature" },
      });
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    await logCheckoutEvent("webhook_fail", {
      error: err.message || "Signature verification failed",
      payload: { stage: "signature" },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: atomic claim against processed_stripe_events. Stripe retries
  // events; without this guard fulfillment, emails, payouts and stock
  // decrements would all rerun. We INSERT ... ON CONFLICT DO NOTHING and
  // require a returned row before proceeding.
  try {
    const { rows: claimRows } = await dbQuery<{ event_id: string }>(
      `INSERT INTO processed_stripe_events (event_id, event_type)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [event.id, event.type]
    );
    if (claimRows.length === 0) {
      logger.info(`[Stripe Webhook] duplicate stripe event, skipping: ${event.id} (${event.type})`);
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (err: any) {
    logger.error({ err }, `[Stripe Webhook] idempotency claim failed for ${event.id}`);
    // Returning 500 lets Stripe retry; do NOT proceed without a successful claim.
    return NextResponse.json({ error: "Idempotency claim failed" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        logger.warn(`[Stripe Webhook] Payment failed: ${intent.id} - ${intent.last_payment_error?.message}`);
        await logCheckoutEvent("checkout_fail", {
          error: intent.last_payment_error?.message || "payment_intent.payment_failed",
          payload: { stage: "payment_failed", paymentIntentId: intent.id },
        });
        break;
      }
      case "account.updated": {
        const acc = event.data.object as Stripe.Account;
        await persistConnectAccount(acc);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (pi) {
          await dbQuery(
            "UPDATE commerce_orders SET status = 'refunded' WHERE metadata->>'paymentIntentId' = $1 OR metadata->>'payment_intent_id' = $1",
            [pi]
          );
          try {
            const { rows: oRows } = await dbQuery<{ id: string; currency: string; total_cents: number; customer_email: string | null; user_email: string | null }>(
              `SELECT co.id, co.currency, co.total_cents,
                      (co.metadata->>'customer_email') AS customer_email,
                      u.email AS user_email
                 FROM commerce_orders co
                 LEFT JOIN users u ON u.id = co.buyer_user_id
                WHERE co.metadata->>'paymentIntentId' = $1
                   OR co.metadata->>'payment_intent_id' = $1
                LIMIT 1`,
              [pi]
            );
            const order = oRows[0];
            if (order) {
              const toEmail = order.customer_email || order.user_email;
              const amountCents = typeof charge.amount_refunded === "number" && charge.amount_refunded > 0
                ? charge.amount_refunded
                : (order.total_cents || 0);
              if (toEmail) {
                await sendRefundEmail(toEmail, order.id, amountCents, order.currency || "RON").catch((err) =>
                  console.warn("[refund-email]", err?.message || err)
                );
              }
            }
          } catch (err) {
            console.warn("[refund-email] lookup failed:", (err as Error).message);
          }
        }
        break;
      }
      case "payment_intent.canceled":
      case "checkout.session.async_payment_failed": {
        const objId = (event.data.object as any).id;
        await dbQuery(
          "UPDATE commerce_orders SET status='canceled', metadata = metadata || jsonb_build_object('canceled_at', NOW()::text, 'canceled_event', $2::text) WHERE metadata->>'paymentIntentId' = $1 OR metadata->>'payment_intent_id' = $1 OR metadata->>'sessionId' = $1 OR metadata->>'stripe_session_id' = $1 OR metadata->>'stripe_payment_intent' = $1",
          [objId, event.type]
        );
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        if (chargeId) {
          await dbQuery(
            "UPDATE commerce_orders SET status='disputed' WHERE metadata->>'chargeId' = $1 OR metadata->>'charge_id' = $1",
            [chargeId]
          );
        }
        break;
      }
      default:
        console.log(`[Stripe Webhook] Unhandled event: ${event.type}`);
    }
  } catch (err: any) {
    console.error("[Stripe Webhook] Handler failed:", err.message);
    await logCheckoutEvent("webhook_fail", {
      error: err.message || "Webhook handler failed",
      payload: { stage: "handler", eventType: event.type, eventId: event.id },
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent) {
  const orderId = intent.metadata?.orderId;
  if (!orderId) {
    console.log(`[Stripe Webhook] Payment intent ${intent.id} succeeded, but no orderId in metadata (not embedded checkout).`);
    return;
  }

  console.log(`[Stripe Webhook] Payment intent succeeded for order: ${orderId}`);

  const { rows: orderRows } = await dbQuery(
    `SELECT id, status, currency, total_cents FROM commerce_orders WHERE id = $1 LIMIT 1`,
    [orderId]
  );
  if (orderRows.length === 0) throw new Error(`Order ${orderId} not found for payment intent ${intent.id}`);
  const order = orderRows[0];
  if (order.status !== "pending") {
    console.log(`[Stripe Webhook] Order ${orderId} already ${order.status}; skipping paid transition.`);
    await maybeSendOrderConfirmation(orderId);
  await awardOrderSwyp(orderId).catch((e) => logger.error({ err: e }, "[swyp] award failed"));
    return;
  }
  if (Number(order.total_cents) !== Number(intent.amount) || String(order.currency).toUpperCase() !== String(intent.currency).toUpperCase()) {
    throw new Error(`Payment intent ${intent.id} amount/currency mismatch for order ${orderId}`);
  }

  const shipping = intent.shipping;
  let shippingAddress: any = null;
  if (shipping) {
    shippingAddress = {
      name: shipping.name,
      phone: shipping.phone,
      // @ts-ignore
      line1: shipping.address?.line1,
      line2: shipping.address?.line2,
      city: shipping.address?.city,
      state: shipping.address?.state,
      postal_code: shipping.address?.postal_code,
      country: shipping.address?.country,
    };
  }

  const metadata = {
    stripe_payment_intent: intent.id,
    // @ts-ignore - charges might not be fully typed in this SDK version
    customer_email: intent.receipt_email || intent.charges?.data?.[0]?.billing_details?.email || null,
    fulfillment_status: "pending",
    shipping_address: shippingAddress,
  };

  // Update the pending order to paid (idempotent via RETURNING gate).
  const { rows: transitionRows } = await dbQuery<{ id: string }>(
    `UPDATE commerce_orders 
     SET status = 'paid', 
         placed_at = COALESCE(placed_at, now()),
         metadata = metadata || $1::jsonb
     WHERE id = $2 AND status = 'pending'
     RETURNING id`,
    [JSON.stringify(metadata), orderId]
  );

  // Decrement stock atomically ONLY on the actual pending->paid transition.
  // The processed_stripe_events guard at the top of POST() neutralizes Stripe
  // event retries; this RETURNING gate additionally protects against any
  // non-webhook path that may have already flipped the order out of 'pending'.
  if (transitionRows.length > 0) {
    await decrementOrderStock(orderId);
  }

  // Record payment transaction
  await dbQuery(
    `INSERT INTO payment_transactions (
      order_id, provider, provider_payment_id, transaction_type,
      status, currency, amount_cents, processed_at, metadata
    ) VALUES ($1, 'stripe', $2, 'payment', 'succeeded', $3, $4, now(), $5::jsonb)
    ON CONFLICT (provider, provider_payment_id, transaction_type)
    DO UPDATE SET status = 'succeeded', processed_at = now()`,
    [
      orderId,
      intent.id,
      String(intent.currency || "ron").toUpperCase(),
      intent.amount,
      JSON.stringify(metadata),
    ]
  );

  await maybeSendOrderConfirmation(orderId);
  await awardOrderSwyp(orderId).catch((e) => logger.error({ err: e }, "[swyp] award failed"));
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log(`[Stripe Webhook] Checkout completed: ${session.id}`);

  const stripe = getStripe();
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 20,
    expand: ["data.price.product"],
  });
  const items = lineItems.data.map((li) => ({
    id: li.id,
    name: li.description || "Product",
    price: (li.amount_total || 0) / 100,
    unitAmountCents: li.price?.unit_amount || Math.round(((li.amount_total || 0) / Math.max(li.quantity || 1, 1))),
    amountTotalCents: li.amount_total || 0,
    quantity: li.quantity || 1,
    currency: li.currency,
    metadata: typeof li.price?.product === "object" && li.price.product ? (li.price.product as any).metadata || {} : {},
  }));

  const totalCents = session.amount_total || 0;
  const totalRon = totalCents / 100;
  const taxCents = (session as any).total_details?.amount_tax || 0;
  const taxCountry = session.customer_details?.address?.country || null;
  const taxIds = (session.customer_details as any)?.tax_ids;
  const taxIdCollected = Array.isArray(taxIds) && taxIds.length > 0
    ? `${taxIds[0].type}:${taxIds[0].value}`
    : null;
  const sessionAny = session as any;
  const shipping = sessionAny.shipping_details || sessionAny.shipping;
  const shippingAddress = shipping ? {
    name: shipping.name,
    line1: shipping.address?.line1,
    line2: shipping.address?.line2,
    city: shipping.address?.city,
    state: shipping.address?.state,
    postal_code: shipping.address?.postal_code,
    country: shipping.address?.country,
  } : null;

  const baseMetadata = {
    stripe_session_id: session.id,
    stripe_payment_intent: session.payment_intent || null,
    customer_email: session.customer_details?.email || session.customer_email || null,
    customer_phone: session.customer_details?.phone || null,
    fulfillment_status: "pending",
    items,
    shipping_address: shippingAddress,
  };

  const { rows: existing } = await dbQuery(
    `SELECT order_id AS id
     FROM checkout_sessions
     WHERE provider = 'stripe' AND provider_session_id = $1
     LIMIT 1`,
    [session.id]
  );

  let orderId = existing[0]?.id;
  const metadata = existing.length > 0
    ? baseMetadata
    : { ...baseMetadata, order_lookup_token: crypto.randomBytes(24).toString("hex") };
  if (existing.length > 0) {
    await dbQuery(
      `UPDATE commerce_orders
       SET status = 'paid',
           currency = upper($2),
           subtotal_cents = $3,
           total_cents = $3,
           tax_cents = $5,
           tax_country = $6,
           tax_id_collected = $7,
           placed_at = COALESCE(placed_at, now()),
           metadata = metadata || $4::jsonb
       WHERE id = $1`,
      [orderId, session.currency || "ron", totalCents, JSON.stringify(metadata), taxCents, taxCountry, taxIdCollected]
    );
  } else {
    const { rows: orderRows } = await dbQuery(
      `INSERT INTO commerce_orders (
        status, currency, subtotal_cents, total_cents, tax_cents, tax_country, tax_id_collected, placed_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8::jsonb)
      RETURNING id`,
      ["paid", String(session.currency || "ron").toUpperCase(), totalCents, totalCents, taxCents, taxCountry, taxIdCollected, JSON.stringify(metadata)]
    );
    orderId = orderRows[0]?.id;
  }
  if (!orderId) throw new Error(`Could not persist order for Stripe session ${session.id}`);

  await persistOrderItems(orderId, items);

  const { rows: sessionRows } = await dbQuery(
    `INSERT INTO checkout_sessions (
      order_id, provider, provider_session_id, status, currency, amount_total_cents,
      completed_at, metadata
    ) VALUES ($1, 'stripe', $2, 'completed', $3, $4, now(), $5::jsonb)
    ON CONFLICT (provider, provider_session_id)
    DO UPDATE SET status = 'completed', completed_at = now(), order_id = EXCLUDED.order_id
    RETURNING id`,
    [orderId, session.id, String(session.currency || "ron").toUpperCase(), totalCents, JSON.stringify(metadata)]
  );

  await dbQuery(
    `INSERT INTO payment_transactions (
      order_id, checkout_session_id, provider, provider_payment_id, transaction_type,
      status, currency, amount_cents, processed_at, metadata
    ) VALUES ($1, $2, 'stripe', $3, 'payment', 'succeeded', $4, $5, now(), $6::jsonb)
    ON CONFLICT (provider, provider_payment_id, transaction_type)
    DO UPDATE SET status = 'succeeded', processed_at = now(), order_id = EXCLUDED.order_id`,
    [
      orderId,
      sessionRows[0]?.id,
      String(session.payment_intent || `checkout_${session.id}`),
      String(session.currency || "ron").toUpperCase(),
      totalCents,
      JSON.stringify(metadata),
    ]
  );

  await maybeSendOrderConfirmation(orderId);
  await awardOrderSwyp(orderId).catch((e) => logger.error({ err: e }, "[swyp] award failed"));

  console.log(`[Stripe Webhook] Order saved: ${session.id} - ${totalRon} RON - ${items.length} items`);

  // --- Fulfillment Orchestration ---
  try {
    const fulfillmentPlan = await routeOrder(orderId, items as any);
    console.log(`[Stripe Webhook] Fulfillment Plan for Order ${orderId}:\n`, JSON.stringify(fulfillmentPlan, null, 2));
  } catch (err) {
    logger.error({ err: err }, `[Stripe Webhook] Fulfillment routing failed for Order ${orderId}:`);
  }
}

async function maybeSendOrderConfirmation(orderId: string) {
  const { rows: orderRows } = await dbQuery(
    `SELECT id, metadata, total_cents
     FROM commerce_orders
     WHERE id = $1
     LIMIT 1`,
    [orderId]
  );
  if (orderRows.length === 0) return;

  const order = orderRows[0];
  const metadata = order.metadata || {};
  const customerEmail = metadata.customer_email;
  if (!customerEmail || metadata.confirmation_email_sent_at) return;

  const { rows: itemRows } = await dbQuery(
    `SELECT title, quantity, (unit_amount_cents::numeric / 100) AS price
     FROM commerce_order_items
     WHERE order_id = $1`,
    [orderId]
  );

  const sent = await sendOrderConfirmation({
    orderId,
    orderLookupToken: metadata.order_lookup_token,
    customerEmail,
    customerName: metadata.shipping_address?.name || "",
    items: itemRows.map((r: any) => ({ title: r.title, quantity: r.quantity, price: Number(r.price) })),
    totalRon: Number(order.total_cents || 0) / 100,
    shippingAddress: metadata.shipping_address || undefined,
  });

  if (sent) {
    await dbQuery(
      `UPDATE commerce_orders
       SET metadata = metadata || jsonb_build_object('confirmation_email_sent_at', now()::text)
       WHERE id = $1`,
      [orderId]
    );
  }
}

async function persistOrderItems(orderId: string, items: Array<{
  id: string;
  name: string;
  unitAmountCents: number;
  amountTotalCents: number;
  quantity: number;
  currency: string;
  metadata: Record<string, string>;
}>) {
  for (const item of items) {
    const pgId = item.metadata.pgId || item.metadata.pg_id || item.metadata.productId || item.metadata.product_id || null;
    const skuId = item.metadata.skuId || item.metadata.sku_id || null;
    const externalLineItemId = pgId ? `${pgId}:${skuId || "default"}` : item.id;
    let variantId: string | null = null;
    if (pgId && skuId) {
      const { rows } = await dbQuery<{ id: string }>(
        `SELECT id::text AS id FROM marketplace_product_variants WHERE product_id = $1 AND sku = $2 LIMIT 1`,
        [pgId, skuId],
      );
      variantId = rows[0]?.id || null;
    }

    await dbQuery(
      `INSERT INTO commerce_order_items (
        order_id, product_id, variant_id, external_line_item_id, title, quantity, currency,
        unit_amount_cents, gross_amount_cents, commissionable_amount_cents, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10::jsonb, now())
      ON CONFLICT (order_id, external_line_item_id)
      WHERE external_line_item_id IS NOT NULL
      DO UPDATE SET
        title = EXCLUDED.title,
        quantity = EXCLUDED.quantity,
        unit_amount_cents = EXCLUDED.unit_amount_cents,
        gross_amount_cents = EXCLUDED.gross_amount_cents,
        commissionable_amount_cents = EXCLUDED.commissionable_amount_cents,
        metadata = commerce_order_items.metadata || EXCLUDED.metadata`,
      [
        orderId,
        pgId,
        variantId,
        externalLineItemId,
        item.name,
        item.quantity,
        (item.currency || "ron").toUpperCase(),
        item.unitAmountCents,
        item.amountTotalCents,
        JSON.stringify({
          source: "stripe_webhook",
          pg_id: pgId,
          sku_id: skuId,
          seller_id: item.metadata.sellerId || item.metadata.seller_id || null,
          creator_id: item.metadata.creatorId || item.metadata.creator_id || null,
          video_id: item.metadata.videoId || item.metadata.video_id || null,
          creator_product_link_id: item.metadata.creatorProductLinkId || item.metadata.creator_product_link_id || null,
          stripe_line_item_id: item.id,
          stripe_product_metadata: item.metadata,
        }),
      ]
    );

    // Deduct stock to prevent overselling.
    // NOTE: we scope by (product_id, sku) because SKU is NOT globally unique
    // across products. Concurrent-write locking (SELECT ... FOR UPDATE in a
    // tx) is intentionally omitted here because lib/db does not expose a
    // transaction helper and the primary double-decrement vector - Stripe
    // event retries - is already neutralized by the processed_stripe_events
    // idempotency guard added at the top of POST().
    if (skuId && pgId) {
      try {
        await dbQuery(
          `UPDATE marketplace_product_variants
             SET inventory_quantity = GREATEST(0, inventory_quantity - $1)
           WHERE product_id = $2 AND sku = $3`,
          [item.quantity, String(pgId), String(skuId)]
        );
      } catch(e) {
        logger.error({ err: e }, `[Stripe Webhook] Error deducting variant stock for product ${pgId} SKU ${skuId}`);
      }
    } else if (skuId) {
      // No product_id available - fall back to SKU-only update but log a
      // warning since this is ambiguous if SKUs collide across products.
      logger.warn(`[Stripe Webhook] Decrementing variant stock without product_id scope (SKU ${skuId}); SKU collisions across products may decrement the wrong row.`);
      try {
        await dbQuery(
          `UPDATE marketplace_product_variants SET inventory_quantity = GREATEST(0, inventory_quantity - $1) WHERE sku = $2`,
          [item.quantity, String(skuId)]
        );
      } catch(e) {
        logger.error({ err: e }, `[Stripe Webhook] Error deducting variant stock for SKU ${skuId}`);
      }
    } else if (pgId) {
      try {
        await dbQuery(
          `UPDATE marketplace_products SET inventory_quantity = GREATEST(0, inventory_quantity - $1) WHERE id = $2`,
          [item.quantity, String(pgId)]
        );
      } catch(e) {
        logger.error({ err: e }, `[Stripe Webhook] Error deducting product stock for ID ${pgId}`);
      }
    }
  }
}

async function decrementOrderStock(orderId: string) {
  // Pull order items recorded by /api/checkout (embedded flow). We decrement
  // per (product_id, variant_id) atomically using a CHECK-guarded UPDATE so
  // the row only changes when sufficient stock exists. Variants use a real
  // integer column; product-level fallback uses metadata.available_stock
  // (jsonb int) since marketplace_products has no top-level stock column.
  let items: Array<{ product_id: string | null; variant_id: string | null; quantity: number; title: string | null }> = [];
  try {
    const { rows } = await dbQuery<{ product_id: string | null; variant_id: string | null; quantity: number; title: string | null }>(
      `SELECT product_id::text AS product_id, variant_id::text AS variant_id, quantity, title
         FROM commerce_order_items WHERE order_id = $1`,
      [orderId]
    );
    items = rows;
  } catch (e) {
    logger.error({ err: e, orderId }, '[Stripe Webhook] Failed to load order items for stock decrement');
    return;
  }

  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    if (qty <= 0) continue;
    try {
      if (it.variant_id) {
        const { rowCount } = await dbQuery(
          `UPDATE marketplace_product_variants
              SET inventory_quantity = inventory_quantity - $1,
                  updated_at = now()
            WHERE id = $2 AND inventory_quantity IS NOT NULL AND inventory_quantity >= $1`,
          [qty, it.variant_id]
        );
        if (!rowCount) {
          logger.warn({ orderId, variantId: it.variant_id, qty, title: it.title }, '[Stripe Webhook] Oversell prevented: variant stock insufficient or NULL; manual review required');
        }
      } else if (it.product_id) {
        const { rowCount } = await dbQuery(
          `UPDATE marketplace_products
              SET metadata = jsonb_set(metadata, '{available_stock}', to_jsonb(GREATEST(0, COALESCE((metadata->>'available_stock')::int, 0) - $1)), true),
                  updated_at = now()
            WHERE id = $2 AND COALESCE((metadata->>'available_stock')::int, 0) >= $1`,
          [qty, it.product_id]
        );
        if (!rowCount) {
          logger.warn({ orderId, productId: it.product_id, qty, title: it.title }, '[Stripe Webhook] Oversell prevented: product available_stock insufficient or missing; manual review required');
        }
      }
    } catch (e) {
      logger.error({ err: e, orderId, productId: it.product_id, variantId: it.variant_id }, '[Stripe Webhook] Stock decrement failed');
    }
  }
}

