import { NextResponse } from "next/server";
import { getCheckoutProductById } from "@/lib/db/product-queries";
import { dbQuery, withTransaction } from "@/lib/db";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { resolveCheckoutAttribution, type CheckoutAttribution } from "@/lib/checkout/attribution";
import { getStripe } from "@/lib/stripe/checkout";
import crypto from "crypto";

import { logger } from "@/lib/logger";
import { idempotencyGet, idempotencySet, idempotencyClaim, idempotencyRelease, clientIp } from "@/lib/rate-limit";
import { rateLimit } from "@/lib/security/rate-limit";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { CheckoutCreateIntentSchema, parseBody } from "@/lib/validation/schemas";
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
          { success: false, error: `Contul nu poate plasa comenzi momentan. Te rugăm contactează ${SUPPORT_EMAIL}.` },
          { status: 403 }
        );
      }
    }

    // Idempotency: return cached response if present
    if (idempotencyKey) {
      // Răspunsul cache-uit se retrimite ca atare către client; nu îi citim
      // câmpurile, deci `unknown` e suficient și corect. `any` ar fi permis
      // accidental acces netipat la un corp de răspuns care s-ar putea schimba.
      const cached = await idempotencyGet<unknown>(`checkout:${idempotencyKey}`);
      if (cached) {
        return NextResponse.json(cached);
      }
      // Rezervare atomică: două cereri concurente cu aceeași cheie nu au voie
      // să creeze amândouă comenzi în fereastra get-then-set.
      const claimed = await idempotencyClaim(`checkout:${idempotencyKey}`, 60);
      if (!claimed) {
        return NextResponse.json(
          { success: false, error: "În curs de procesare. Reîncearcă în câteva secunde." },
          { status: 409 },
        );
      }
      claimedKey = idempotencyKey;
    }


    type CheckoutItem = CheckoutAttribution & {
      productId: string;
      aeProductId: string | null | undefined;
      pgId: string | number;
      title: string;
      priceCents: number;
      quantity: number;
      skuId: string | null | undefined;
      variantId: string | null;
      sellerId: string | null | undefined;
    };
    type ItemResolution = { error: string } | { item: CheckoutItem; lineTotal: number };

    // Validarea eșuată eliberează rezervarea de idempotency: altfel userul care
    // corectează coșul și reîncearcă cu aceeași cheie primea 409 timp de 60s.
    const failValidation = async (error: string) => {
      if (claimedKey) {
        await idempotencyRelease(`checkout:${claimedKey}`);
        claimedKey = null;
      }
      return NextResponse.json({ success: false, error }, { status: 400 });
    };

    // Produsele din coș se rezolvă ÎN PARALEL (audit 2026-08-24): înainte,
    // fiecare item costa 3 tururi secvențiale la DB (produs → variantă →
    // atribuire), deci un coș de 5 produse însemna 15 tururi înlănțuite pe
    // calea de plată. Acum: toate item-urile deodată, iar în interiorul unui
    // item varianta și atribuirea pleacă împreună ⇒ 2 tururi în total.
    const resolutions: ItemResolution[] = await Promise.all(
      rawItems.map(async (item): Promise<ItemResolution> => {
        const productId = String(item.productId || item.pgId || "").trim();
        const qty = parseQuantity(item.quantity || 1);
        if (!productId || !qty) {
          return { error: "Produs sau cantitate invalidă." };
        }

        const pgProduct = await getCheckoutProductById(productId);
        if (!pgProduct) {
          return { error: "Unul dintre produse nu mai este disponibil. Reîncarcă coșul." };
        }

        // Validare stoc (aliniat cu /api/checkout — fix oversell audit extern)
        // Tip explicit în loc de `as any`: aici se decide dacă vindem sau nu un
        // produs fără stoc, deci e ultimul loc unde vrem verificarea dezactivată.
        const stockSource = pgProduct as {
          metadata?: { available_stock?: number | string | null } | null;
          stock?: number | string | null;
        };
        const baseStock = stockSource.metadata?.available_stock ?? stockSource.stock;
        if (baseStock !== undefined && baseStock !== null && qty > Number(baseStock)) {
          return { error: `Stoc insuficient pentru "${pgProduct.title}". Ai cerut ${qty}, dar avem doar ${baseStock} disponibile.` };
        }

        const [variantRows, attribution] = await Promise.all([
          item.skuId
            ? dbQuery(
              `SELECT id, price_cents, inventory_quantity AS stock FROM marketplace_product_variants WHERE product_id = $1 AND sku = $2 LIMIT 1`,
              [pgProduct.productId, String(item.skuId)],
            ).then((r) => r.rows)
            : Promise.resolve([] as Array<{ id: string; price_cents: number | string; stock: number | string | null }>),
          resolveCheckoutAttribution(
            pgProduct.productId,
            item.videoId ? String(item.videoId) : null,
          ),
        ]);

        let variantPriceCents = Math.round(pgProduct.price * 100);
        let variantId: string | null = null;

        if (variantRows.length > 0) {
          if (Number(variantRows[0].price_cents) > 0) {
            variantId = String(variantRows[0].id);
            variantPriceCents = Number(variantRows[0].price_cents);
          }
          if (variantRows[0].stock !== null && qty > Number(variantRows[0].stock)) {
            return { error: `Stoc insuficient pentru "${pgProduct.title}". Ai cerut ${qty}, dar avem doar ${variantRows[0].stock} disponibile.` };
          }
        }

        return {
          item: {
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
          },
          lineTotal: variantPriceCents * qty,
        };
      }),
    );

    const checkoutItems: CheckoutItem[] = [];
    let totalCents = 0;
    // Prima eroare în ordinea coșului câștigă — același mesaj ca înainte.
    for (const resolution of resolutions) {
      if ("error" in resolution) return failValidation(resolution.error);
      checkoutItems.push(resolution.item);
      totalCents += resolution.lineTotal;
    }

    if (checkoutItems.length === 0) {
      return failValidation("Produse indisponibile.");
    }

    const orderLookupToken = crypto.randomBytes(24).toString("hex");

    // Cloudflare signals — only trusted because Caddy strips CF-* from origin traffic.
    const ipCountry = (req.headers.get("cf-ipcountry") || "").trim().toUpperCase() || null;
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 200) || null;

    // Comanda + items ATOMIC (audit 2026-08-24): fără tranzacție, o eroare la
    // mijlocul buclei lăsa o comandă `pending` cu items parțiale/lipsă —
    // ireconciliabilă la webhook-ul de plată.
    const orderId = await withTransaction(async (q) => {
      const { rows: orderRows } = await q(
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
      const newOrderId = orderRows[0].id as string;

      for (const item of checkoutItems) {
        await q(
          `INSERT INTO commerce_order_items (
            order_id, product_id, variant_id, creator_id, video_id, creator_product_link_id,
            external_line_item_id, title, quantity, currency, unit_amount_cents,
            gross_amount_cents, commissionable_amount_cents, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'RON', $10, $11, $11, $12::jsonb)`,
          [
            newOrderId,
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
      return newOrderId;
    });

    const stripe = getStripe();

    // Cardul (Stripe) acoperă 100% din total — nu mai există plată hibridă.
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: totalCents,
        currency: "ron",
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          orderId: orderId,
          expectedAmount: String(totalCents),
          expectedCurrency: "RON",
        }
      }, { idempotencyKey: `pi:${orderId}` });
    } catch (stripeErr) {
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
      cardAmountCents: totalCents,
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
