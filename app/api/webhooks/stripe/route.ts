import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/checkout";
import { dbQuery } from "@/lib/db";
import { logCheckoutEvent } from "@/lib/security/audit-log";
import { getClientIP } from "@/lib/security/rate-limit";
import type Stripe from "stripe";

import { logger } from "@/lib/logger";
import { handleCheckoutCompletedEvent } from "./_handlers/checkout";
import { handlePaymentIntentSucceededEvent, handlePaymentIntentFailed } from "./_handlers/payments";
import { handleChargeRefunded, handleIntentDead } from "./_handlers/refunds";
import { handleAccountUpdated } from "./_handlers/connect";
import { handleDisputeEvent } from "./_handlers/disputes";
export const dynamic = "force-dynamic";

type EventHandler = (event: Stripe.Event) => Promise<void>;

const HANDLERS: Record<string, EventHandler> = {
  "checkout.session.completed": handleCheckoutCompletedEvent,
  "payment_intent.succeeded": handlePaymentIntentSucceededEvent,
  "payment_intent.payment_failed": handlePaymentIntentFailed,
  "account.updated": handleAccountUpdated,
  "charge.refunded": handleChargeRefunded,
  "payment_intent.canceled": handleIntentDead,
  "checkout.session.async_payment_failed": handleIntentDead,
  "checkout.session.expired": handleIntentDead,
  "charge.dispute.created": handleDisputeEvent,
  "charge.dispute.updated": handleDisputeEvent,
  "charge.dispute.closed": handleDisputeEvent,
  "charge.dispute.funds_withdrawn": handleDisputeEvent,
  "charge.dispute.funds_reinstated": handleDisputeEvent,
};

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
  // 2026-08-17 (audit): cele 6 `webhook_fail` din `checkout_audit_log` aveau
  // `client_ip` gol, așa că nu s-a putut stabili cine trimitea cereri cu
  // semnătură invalidă. Folosim `getClientIP` — același helper ca restul
  // rutelor (43 de fișiere) — nu o a treia variantă locală.
  //
  // NU citim `cf-connecting-ip`: e un header pe care oricine îl poate
  // trimite direct către origine, iar `getClientIP` îl ignoră deliberat
  // (vezi comentariul din lib/security/rate-limit.ts). Dovadă că helperul
  // funcționează prin tunelul actual: `checkout_audit_log` conține
  // 92.180.72.182 (IP public real) scris de app/api/checkout/route.ts:159,
  // care folosește exact acest helper.
  const clientIp = getClientIP(req);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured");
    await logCheckoutEvent("webhook_fail", {
      clientIp,
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
        clientIp,
        error: "Missing Stripe signature",
        payload: { stage: "signature" },
      });
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    console.error("[Stripe Webhook] Signature verification failed:", err instanceof Error ? err.message : String(err));
    await logCheckoutEvent("webhook_fail", {
      clientIp,
      error: (err instanceof Error && err.message) || "Signature verification failed",
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
  } catch (err: unknown) {
    logger.error({ err }, `[Stripe Webhook] idempotency claim failed for ${event.id}`);
    // Returning 500 lets Stripe retry; do NOT proceed without a successful claim.
    return NextResponse.json({ error: "Idempotency claim failed" }, { status: 500 });
  }

  try {
    const handler = HANDLERS[event.type];
    if (handler) {
      await handler(event);
    } else {
      logger.info({ event_type: event.type, event_id: event.id }, "[Stripe Webhook] unhandled event");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Stripe Webhook] Handler failed:", msg);
    await logCheckoutEvent("webhook_fail", {
      error: msg || "Webhook handler failed",
      payload: { stage: "handler", eventType: event.type, eventId: event.id },
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
