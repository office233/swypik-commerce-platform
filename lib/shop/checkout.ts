/**
 * Checkout-ul magazinului — sursa unică pentru crearea comenzii + PaymentIntent.
 *
 *  - prețurile se calculează pe server din coșul din DB (`pricing.ts`);
 *  - comanda are `buyer_user_id` + emailul clientului;
 *  - stocul e rezervat `SHOP_RESERVATION_MINUTES` (rânduri blocate FOR UPDATE);
 *  - idempotent: o singură comandă `pending` per coș (index unic pe
 *    metadata.cart_id). Coș neschimbat ⇒ aceeași comandă + același PaymentIntent;
 *    coș schimbat ⇒ comanda veche e anulată (rezervarea eliberată), apoi una nouă.
 */
import crypto from "node:crypto";
import { dbQuery, withTransaction } from "@/lib/db";
import { resolveCheckoutAttribution, type CheckoutAttribution } from "@/lib/checkout/attribution";
import { getStripe } from "@/lib/stripe/checkout";
import { logger } from "@/lib/logger";
import { getShopConfig } from "./config";
import { priceCart, type PricedCart } from "./pricing";
import {
  extendReservation,
  findPendingOrderForCart,
  insertOrder,
  loadCartLines,
  loadReserved,
  loadVariants,
  lockProducts,
  supersedeOrder,
} from "./checkout-repo";

export type CheckoutBuyer = { userId: string; email: string | null };

export type CheckoutRequestContext = {
  cartId: string;
  buyer: CheckoutBuyer;
  ipCountry: string | null;
  userAgent: string | null;
};

export type CheckoutResult = {
  orderId: string;
  orderLookupToken: string;
  clientSecret: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  reused: boolean;
};

type TxOutcome =
  | { kind: "reuse"; orderId: string; paymentIntentId: string; lookupToken: string; priced: PricedCart }
  | { kind: "new"; orderId: string; lookupToken: string; priced: PricedCart; supersededPaymentIntent: string | null };

async function resolveAttributions(lines: PricedCart["lines"]): Promise<Map<string, CheckoutAttribution>> {
  const entries = await Promise.all(
    lines.map(async (l) => [l.productId, await resolveCheckoutAttribution(l.productId, l.videoId)] as const),
  );
  return new Map(entries);
}

export async function createOrReuseCheckout(ctx: CheckoutRequestContext): Promise<CheckoutResult> {
  const config = getShopConfig();

  const outcome = await withTransaction<TxOutcome>(async (q) => {
    const inputs = await loadCartLines(q, ctx.cartId);
    const productIds = Array.from(new Set(inputs.map((i) => i.productId)));
    const existing = await findPendingOrderForCart(q, ctx.cartId);
    const products = productIds.length ? await lockProducts(q, productIds) : new Map();
    const variants = productIds.length ? await loadVariants(q, productIds) : [];
    const reserved = productIds.length ? await loadReserved(q, productIds, existing?.id ?? null) : new Map();
    const priced = priceCart(inputs, products, variants, reserved, config);

    if (existing && existing.fingerprint === priced.fingerprint && existing.paymentIntentId && existing.lookupToken) {
      await extendReservation(q, existing.id, config.reservationMinutes);
      return {
        kind: "reuse",
        orderId: existing.id,
        paymentIntentId: existing.paymentIntentId,
        lookupToken: existing.lookupToken,
        priced,
      };
    }
    if (existing) await supersedeOrder(q, existing.id);

    const lookupToken = crypto.randomBytes(24).toString("hex");
    const attribution = await resolveAttributions(priced.lines);
    const orderId = await insertOrder(q, {
      buyerUserId: ctx.buyer.userId,
      customerEmail: ctx.buyer.email,
      cartId: ctx.cartId,
      priced,
      attribution,
      lookupToken,
      reservationMinutes: config.reservationMinutes,
      ipCountry: ctx.ipCountry,
      userAgent: ctx.userAgent,
    });
    return { kind: "new", orderId, lookupToken, priced, supersededPaymentIntent: existing?.paymentIntentId ?? null };
  });

  const stripe = getStripe();
  const { priced } = outcome;
  const base = {
    orderId: outcome.orderId,
    orderLookupToken: outcome.lookupToken,
    subtotalCents: priced.subtotalCents,
    shippingCents: priced.shippingCents,
    totalCents: priced.totalCents,
    currency: priced.currency,
  };

  if (outcome.kind === "reuse") {
    const intent = await stripe.paymentIntents.retrieve(outcome.paymentIntentId);
    if (intent.client_secret && intent.status !== "canceled" && intent.status !== "succeeded") {
      return { ...base, clientSecret: intent.client_secret, reused: true };
    }
    // PaymentIntent inutilizabil (anulat/expirat) — creăm altul pentru aceeași comandă.
  }

  if (outcome.kind === "new" && outcome.supersededPaymentIntent) {
    await stripe.paymentIntents.cancel(outcome.supersededPaymentIntent).catch((err: unknown) => {
      logger.warn({ err, pi: outcome.supersededPaymentIntent }, "[shop.checkout] anularea PaymentIntent-ului vechi a eșuat");
    });
  }

  let intent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: priced.totalCents,
        currency: priced.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        ...(ctx.buyer.email ? { receipt_email: ctx.buyer.email } : {}),
        metadata: {
          kind: "shop_order",
          orderId: outcome.orderId,
          expectedAmount: String(priced.totalCents),
          expectedCurrency: priced.currency,
        },
      },
      // La regenerare (PI-ul vechi anulat) cheia trebuie să difere, altfel Stripe
      // ar întoarce exact PaymentIntent-ul inutilizabil.
      {
        idempotencyKey:
          outcome.kind === "reuse"
            ? `pi:${outcome.orderId}:${priced.fingerprint}:${outcome.paymentIntentId}`
            : `pi:${outcome.orderId}:${priced.fingerprint}`,
      },
    );
  } catch (err) {
    await dbQuery(
      `UPDATE commerce_orders SET status = 'failed', reserved_until = NULL WHERE id = $1 AND status = 'pending'`,
      [outcome.orderId],
    ).catch(() => undefined);
    throw err;
  }

  await dbQuery(
    `UPDATE commerce_orders SET metadata = metadata || $1::jsonb WHERE id = $2`,
    [JSON.stringify({ stripe_payment_intent: intent.id }), outcome.orderId],
  );
  if (!intent.client_secret) throw new Error("stripe_missing_client_secret");
  return { ...base, clientSecret: intent.client_secret, reused: false };
}
