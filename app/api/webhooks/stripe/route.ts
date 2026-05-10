/**
 * Stripe Webhook Handler
 * 
 * Receives payment confirmations from Stripe and:
 * 1. Saves the order to NeonDB
 * 2. Logs the event for audit
 * 3. (Future) Triggers CJ/AliExpress fulfillment
 * 
 * SECURITY: Validates webhook signature using STRIPE_WEBHOOK_SECRET
 */

import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/checkout";
import { dbQuery } from "@/lib/db";
import type Stripe from "stripe";

export const preferredRegion = "fra1";

// Disable body parsing — Stripe needs raw body for signature verification
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
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      console.warn(`[Stripe Webhook] Payment failed: ${intent.id} — ${intent.last_payment_error?.message}`);
      break;
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log(`[Stripe Webhook] ✅ Checkout completed: ${session.id}`);

  try {
    // Check if order already exists (idempotency)
    const { rows: existing } = await dbQuery(
      "SELECT id FROM orders WHERE stripe_session_id = $1",
      [session.id]
    );
    if (existing.length > 0) {
      console.log(`[Stripe Webhook] Order already exists for session ${session.id}`);
      return;
    }

    // Retrieve line items from Stripe
    const stripe = getStripe();
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 });

    const items = lineItems.data.map((li) => ({
      name: li.description || "Product",
      price: (li.amount_total || 0) / 100,
      quantity: li.quantity || 1,
      currency: li.currency,
    }));

    const totalRon = (session.amount_total || 0) / 100;

    // Get shipping address (cast to any — Stripe types vary across versions)
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

    // Save order to NeonDB
    await dbQuery(
      `INSERT INTO orders (
        stripe_session_id, stripe_payment_intent, customer_email, customer_phone,
        total_ron, currency, status, items, shipping_address, fulfillment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (stripe_session_id) DO NOTHING`,
      [
        session.id,
        session.payment_intent || null,
        session.customer_details?.email || session.customer_email || null,
        session.customer_details?.phone || null,
        totalRon,
        session.currency || "ron",
        "paid",
        JSON.stringify(items),
        shippingAddress ? JSON.stringify(shippingAddress) : null,
        "pending",
      ]
    );

    console.log(`[Stripe Webhook] 💾 Order saved: ${session.id} — ${totalRon} RON — ${items.length} items`);

    // TODO: Trigger CJ/AliExpress fulfillment here
    // await triggerFulfillment(orderId, items, shippingAddress);

  } catch (error: any) {
    console.error(`[Stripe Webhook] Error saving order:`, error);
    // Don't return error — Stripe will retry
  }
}
