/**
 * Cron: recuperare SWYP din checkout-uri abandonate.
 *
 * Bug acoperit: create-intent debitează partea SWYP a comenzii ÎNAINTE de
 * plata cu cardul. Dacă clientul abandonează (intentul rămâne
 * requires_payment_method și nu mai vine niciun webhook), SWYP-ul rămâne
 * blocat pentru totdeauna în pool-ul 'rewards'.
 *
 * Mecanism:
 *  - candidat = comandă cu swyp_paid_cents > 0, nefinalizată (pending /
 *    cancelled / failed), mai veche de 24h, fără swyp_refunded_at;
 *  - dubla verificare la Stripe: recreditează DOAR dacă intentul nu e
 *    succeeded/processing (plasa de siguranță contra unui webhook pierdut);
 *  - creditul e idempotent prin ledger: ref (swyp_refund_abandoned, <pi_id>)
 *    — cron dublu / retry = no-op;
 *  - dacă lookup-ul Stripe eșuează, sare peste comandă (o prinde rularea
 *    următoare) — nu recredităm niciodată pe informație incertă.
 *
 * Auth: același pattern ca app/api/cron/process-payouts/route.ts (CRON_SECRET).
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { dbQuery } from "@/lib/db";
import { getStripe } from "@/lib/stripe/checkout";
import { logger } from "@/lib/logger";
import { refundSwypForUnpaidOrder } from "@/lib/swyp/refund";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = logger.child({ mod: "cron/reclaim-abandoned-swyp" });

const ABANDON_HOURS = 24;
const BATCH_LIMIT = 100;

export async function GET(req: Request) {
    const authHeader = req.headers.get("authorization");
    const token =
        authHeader?.replace("Bearer ", "") ||
        req.headers.get("x-cron-secret");
    const cronSecretHeader =
        req.headers.get("cron-secret") || req.headers.get("CRON_SECRET");

    const providedSecret = token || cronSecretHeader;

    const expected = process.env.CRON_SECRET;
    if (!expected || !providedSecret ||
        Buffer.byteLength(providedSecret) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expected))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rows: candidates } = await dbQuery<{
        id: string;
        status: string;
        payment_intent_id: string | null;
        swyp_paid_cents: number;
    }>(
        `SELECT id,
            status,
            COALESCE(metadata->>'paymentIntentId',
                     metadata->>'payment_intent_id',
                     metadata->>'stripe_payment_intent') AS payment_intent_id,
            COALESCE(swyp_paid_cents, 0)::int AS swyp_paid_cents
       FROM commerce_orders
      WHERE COALESCE(swyp_paid_cents, 0) > 0
        AND status IN ('pending', 'cancelled', 'failed')
        AND created_at < NOW() - ($1 || ' hours')::interval
        AND metadata->>'swyp_refunded_at' IS NULL
      ORDER BY created_at ASC
      LIMIT $2`,
        [String(ABANDON_HOURS), BATCH_LIMIT],
    );

    const stripe = getStripe();
    let reclaimed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const order of candidates) {
        try {
            if (order.payment_intent_id) {
                // Plasă de siguranță: nu recredita dacă plata a reușit între timp
                // (webhook pierdut) sau e încă în procesare.
                const intent = await stripe.paymentIntents.retrieve(order.payment_intent_id);
                if (intent.status === "succeeded" || intent.status === "processing") {
                    log.warn(
                        { orderId: order.id, intentId: order.payment_intent_id, status: intent.status },
                        "reclaim.skip_intent_alive",
                    );
                    skipped++;
                    continue;
                }
                if (intent.status !== "canceled") {
                    // Abandon tăcut: anulează intentul ca să nu mai poată fi plătit
                    // DUPĂ recreditare (altfel dublă cheltuială a acelorași SWYP).
                    await stripe.paymentIntents
                        .cancel(order.payment_intent_id, { cancellation_reason: "abandoned" })
                        .catch((err: unknown) => {
                            // Race: intentul a intrat în procesare fix acum → nu atinge.
                            throw err;
                        });
                }
            }

            const res = await refundSwypForUnpaidOrder({
                orderId: order.id,
                refType: "swyp_refund_abandoned",
                refId: order.payment_intent_id || `order:${order.id}`,
                reason: "abandoned_checkout",
            });
            if (res.credited) {
                reclaimed++;
                log.info(
                    { orderId: order.id, intentId: order.payment_intent_id, swypCents: order.swyp_paid_cents },
                    "reclaim.credited",
                );
            } else {
                skipped++;
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`${order.id}: ${msg}`);
            log.error({ orderId: order.id, err: msg }, "reclaim.failed");
        }
    }

    return NextResponse.json({
        ok: true,
        candidates: candidates.length,
        reclaimed,
        skipped,
        errors,
    });
}
