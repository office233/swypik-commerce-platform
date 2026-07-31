/**
 * Hook-uri SWYP pe evenimente reale de business.
 *
 * Regula de aur: SWYP se acordă DOAR după o tranzacție reală confirmată
 * (plată Stripe, cursă finalizată, livrare efectuată). `paidTxRef` e dovada —
 * fără ea, regulile cu `requires_paid_tx` refuză plata. Ăsta e zidul anti-sybil.
 *
 * Toate funcțiile sunt best-effort: nu aruncă niciodată, nu blochează fluxul
 * de business. Un reward pierdut e o pagubă mică; o comandă blocată, mare.
 * Idempotența e garantată de ledger (UNIQUE pe ref_type+ref_id+kind).
 */
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { awardSwyp } from "./rewards";
import { swypTransfer } from "./ledger";

/** Rulează un hook fără să propage vreodată eroarea. */
async function safe(label: string, fn: () => Promise<unknown>): Promise<void> {
    try {
        await fn();
    } catch (err) {
        logger.error({ err, hook: label }, "swyp.hook.failed");
    }
}

/**
 * Nucleul anti-fraudă al referralului.
 *
 * Se apelează la ORICE tranzacție reală plătită de un utilizator, indiferent
 * de verticală (shop, cursă Go, mâncare Eats, cazare…). Prima dată când un
 * invitat cheltuie bani reali, invitatorul primește bonusul — o singură dată,
 * oricâte tranzacții ar urma.
 *
 * De ce nu poate fi furat:
 *   • conturile fabricate nu produc nimic — nu ajung niciodată la o plată;
 *   • mining-ul/înregistrarea NU declanșează bonusul (n-ar costa nimic);
 *   • ca să fraudezi, ar trebui să plătești real cu cardul, iar comisionul
 *     platformei pe acea tranzacție depășește valoarea bonusului.
 *
 * @param inviteeUserId  utilizatorul care tocmai a plătit
 * @param paidTxRef      id-ul PaymentIntent Stripe (dovada plății)
 * @param context        de unde a venit plata (pentru audit)
 */
export async function onUserPaidTransaction(
    inviteeUserId: string | null,
    paidTxRef: string,
    context: "shop_order" | "go_ride" | "eats_order" | "stay_booking" | "other",
): Promise<void> {
    if (!inviteeUserId) return; // plată ca oaspete — fără cont, fără referral
    await safe(`paid_tx:${context}`, async () => {
        // UPDATE ... WHERE validated_at IS NULL = poartă atomică: chiar dacă două
        // plăți se confirmă simultan, o singură cerere primește rândul înapoi.
        const { rows } = await dbQuery<{ referrer_user_id: string }>(
            `UPDATE referral_attributions
          SET validated_at = now(), validation_action = $2
        WHERE invitee_user_id = $1 AND validated_at IS NULL
        RETURNING referrer_user_id::text`,
            [inviteeUserId, `first_paid:${context}`],
        );
        const referrerId = rows[0]?.referrer_user_id;
        if (!referrerId) return; // n-a fost invitat de nimeni, sau deja validat

        await awardSwyp({
            userId: referrerId,
            action: "referral_validated",
            refId: inviteeUserId, // un singur bonus per invitat, pe viață
            paidTxRef,
            metadata: { invitee_user_id: inviteeUserId, context },
        });
        // total_validated e incrementat automat de trigger-ul
        // trg_referral_attr_counters (migrarea 20260519_0013) la trecerea
        // validated_at NULL → NOT NULL. Nu-l atingem aici, ar dubla contorul.
        logger.info({ referrerId, inviteeId: inviteeUserId, context }, "swyp.referral.validated");
    });
}

/** Comandă din Shop plătită → validează referralul cumpărătorului. */
export async function onOrderPaid(orderId: string, paidTxRef: string): Promise<void> {
    await safe("order_paid", async () => {
        const { rows } = await dbQuery<{ buyer_user_id: string | null }>(
            `SELECT buyer_user_id::text FROM commerce_orders WHERE id = $1`,
            [orderId],
        );
        await onUserPaidTransaction(rows[0]?.buyer_user_id ?? null, paidTxRef, "shop_order");
    });
}

/**
 * Cursă Swypik Go plătită → recompensă pentru șofer + referral pentru pasager.
 * Se apelează după confirmarea plății (card capturat sau cash încasat).
 */
export async function onRidePaid(rideId: string, paidTxRef: string): Promise<void> {
    await safe("ride_paid", async () => {
        const { rows } = await dbQuery<{ rider_user_id: string | null; driver_user_id: string | null }>(
            `SELECT r.rider_user_id::text AS rider_user_id,
              c.user_id::text  AS driver_user_id
         FROM rides r
         LEFT JOIN couriers c ON c.id = r.driver_id
        WHERE r.id = $1`,
            [rideId],
        );
        const row = rows[0];
        if (!row) return;

        // Pasagerul: prima cursă plătită validează referralul.
        await onUserPaidTransaction(row.rider_user_id, paidTxRef, "go_ride");

        // Șoferul: recompensă per cursă (cu cap zilnic din swyp_emission_rules).
        if (row.driver_user_id) {
            await awardSwyp({
                userId: row.driver_user_id,
                action: "go_ride_completed",
                refId: rideId,
                paidTxRef,
                metadata: { ride_id: rideId },
            });
        }
    });
}

/** Comandă Eats plătită → referral pentru client. */
export async function onLocalOrderPaid(orderId: string, paidTxRef: string): Promise<void> {
    await safe("local_order_paid", async () => {
        const { rows } = await dbQuery<{ customer_user_id: string | null }>(
            `SELECT customer_user_id::text FROM local_orders WHERE id = $1`,
            [orderId],
        );
        await onUserPaidTransaction(rows[0]?.customer_user_id ?? null, paidTxRef, "eats_order");
    });
}

/** Livrare Eats finalizată la timp → recompensă pentru curier. */
export async function onDeliveryCompleted(args: {
    orderId: string;
    courierUserId: string | null;
    onTime: boolean;
    paidTxRef: string;
}): Promise<void> {
    if (!args.courierUserId || !args.onTime) return;
    await safe("delivery_completed", () =>
        awardSwyp({
            userId: args.courierUserId!,
            action: "eats_delivery_on_time",
            refId: args.orderId,
            paidTxRef: args.paidTxRef,
            metadata: { order_id: args.orderId },
        }),
    );
}

/** Recenzie după o comandă livrată → recompensă pentru cumpărător. */
export async function onOrderReviewed(args: {
    userId: string;
    orderId: string;
    reviewId: string;
    paidTxRef: string;
}): Promise<void> {
    await safe("order_reviewed", () =>
        awardSwyp({
            userId: args.userId,
            action: "order_review",
            refId: args.reviewId,
            paidTxRef: args.paidTxRef,
            metadata: { order_id: args.orderId },
        }),
    );
}

/**
 * Refund → revocă recompensele SWYP legate de plata respectivă.
 *
 * Găsește toate intrările de tip 'reward' din ledger care au fost acordate cu
 * paid_tx_ref = paymentIntent-ul refundat și le întoarce în pool-ul 'rewards'.
 * Idempotent: refId = id-ul intrării originale → un refund retrimis de Stripe
 * nu debitează de două ori. Dacă userul a cheltuit deja SWYP-ul și soldul nu
 * acoperă revocarea, logăm și lăsăm intrarea pentru reconciliere manuală —
 * nu blocăm procesarea refundului.
 */
export async function onPaymentRefunded(paidTxRef: string): Promise<void> {
    await safe("payment_refunded", async () => {
        const { rows } = await dbQuery<{ id: string; to_user_id: string; amount_units: string; ref_type: string }>(
            `SELECT id::text, to_user_id::text, amount_units::text, ref_type
         FROM swyp_ledger_entries
        WHERE kind = 'reward'
          AND to_user_id IS NOT NULL
          AND metadata->>'paid_tx_ref' = $1`,
            [paidTxRef],
        );
        for (const entry of rows) {
            try {
                await swypTransfer({
                    from: { userId: entry.to_user_id },
                    to: { pool: "rewards" },
                    amountUnits: BigInt(entry.amount_units),
                    kind: "adjustment",
                    refType: "reward_revoke",
                    refId: entry.id, // idempotent per intrare originală
                    description: `Revocare reward la refund (${entry.ref_type})`,
                    metadata: { paid_tx_ref: paidTxRef, original_entry_id: entry.id },
                });
                logger.info({ entryId: entry.id, userId: entry.to_user_id }, "swyp.reward.revoked");
            } catch (err) {
                // Sold insuficient (userul a cheltuit deja) sau altă eroare —
                // nu blocăm refundul; rămâne pentru reconciliere.
                logger.error({ err, entryId: entry.id, paidTxRef }, "swyp.reward.revoke_failed");
            }
        }
    });
}
