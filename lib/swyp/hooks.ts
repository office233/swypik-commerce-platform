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

/** Rulează un hook fără să propage vreodată eroarea. */
async function safe(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error({ err, hook: label }, "swyp.hook.failed");
  }
}

/**
 * Comandă plătită → recompensează cumpărătorul și, dacă e prima lui comandă,
 * validează referral-ul și plătește invitatorul.
 *
 * @param orderId  comanda tocmai trecută în 'paid'
 * @param paidTxRef  id-ul PaymentIntent Stripe (dovada plății)
 */
export async function onOrderPaid(orderId: string, paidTxRef: string): Promise<void> {
  await safe("order_paid", async () => {
    const { rows } = await dbQuery<{ buyer_user_id: string | null; prior_paid: string }>(
      `SELECT co.buyer_user_id::text,
              (SELECT COUNT(*) FROM commerce_orders co2
                WHERE co2.buyer_user_id = co.buyer_user_id
                  AND co2.status IN ('paid','fulfilled','completed','shipped','delivered')
                  AND co2.id <> co.id)::text AS prior_paid
         FROM commerce_orders co WHERE co.id = $1`,
      [orderId],
    );
    const buyerId = rows[0]?.buyer_user_id;
    if (!buyerId) return; // comandă de oaspete — nimic de recompensat

    const isFirstPaidOrder = Number(rows[0].prior_paid) === 0;

    // Referral: se validează DOAR la prima comandă plătită a invitatului.
    // Aici se plătește invitatorul — fermele de conturi nu produc nimic
    // pentru că nu ajung niciodată la o plată reală.
    if (isFirstPaidOrder) {
      const { rows: refRows } = await dbQuery<{ referrer_user_id: string }>(
        `UPDATE referral_attributions
            SET validated_at = now(), validation_action = 'first_paid_order'
          WHERE invitee_user_id = $1 AND validated_at IS NULL
          RETURNING referrer_user_id::text`,
        [buyerId],
      );
      const referrerId = refRows[0]?.referrer_user_id;
      if (referrerId) {
        await awardSwyp({
          userId: referrerId,
          action: "referral_validated",
          refId: buyerId, // un singur bonus per invitat, oricâte comenzi ar face
          paidTxRef,
          metadata: { invitee_user_id: buyerId, order_id: orderId },
        });
        // total_validated e incrementat automat de trigger-ul
        // trg_referral_attr_counters (migrarea 20260519_0013) la trecerea
        // validated_at NULL → NOT NULL. Nu-l atingem aici, ar dubla contorul.
        logger.info({ referrerId, inviteeId: buyerId }, "swyp.referral.validated");
      }
    }
  });
}

/** Cursă Swypik Go finalizată → recompensă pentru șofer. */
export async function onRideCompleted(args: {
  rideId: string;
  driverUserId: string | null;
  paidTxRef: string;
}): Promise<void> {
  if (!args.driverUserId) return;
  await safe("ride_completed", () =>
    awardSwyp({
      userId: args.driverUserId!,
      action: "go_ride_completed",
      refId: args.rideId,
      paidTxRef: args.paidTxRef,
      metadata: { ride_id: args.rideId },
    }),
  );
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
