/**
 * FRONT R5 — Decontarea banilor la finalul unei curse (Go) sau livrări (Eats).
 *
 * MODELUL CASH vs CARD
 * ────────────────────
 *  CARD  (platforma încasează prin Stripe):
 *    - banii intră la platformă → platforma DATOREAZĂ părțile:
 *        · curier/șofer: CREDIT în wallet ledger cu cota lui + tot bacșișul;
 *        · merchant (Eats): rând în merchant_settlements(source='platform_owes').
 *
 *  CASH  (curierul/șoferul încasează fizic toți banii):
 *    - banii sunt LA curier → curierul DATOREAZĂ restul:
 *        · Go:   DEBIT = platform_cents (comisionul platformei);
 *        · Eats: DEBIT = platform_cents + merchant_cents (comision + banii
 *                merchantului, pe care platforma îi decontează merchantului →
 *                rând în merchant_settlements(source='cash_with_courier')).
 *    - debitul se face cu allowNegative=true: soldul curierului poate coborî
 *      sub zero (datorie), care se stinge natural din creditările viitoare
 *      (curse card) sau la reglaje manuale. Payout-ul e permis doar din sold
 *      pozitiv, deci datoria nu poate fi „retrasă".
 *
 * IDEMPOTENȚĂ: ref unic pe ledger — ("ride", <id>) / ("order", <id>).
 * Constrângerea UNIQUE (ref_type, ref_id, kind) garantează o singură decontare
 * chiar sub retry/race. settled_at pe rides/local_orders e doar marcaj de audit.
 *
 * Sumele sunt exclusiv CENȚI (integer).
 */
import { dbQuery } from "@/lib/db";
import { creditUser, debitUser } from "@/lib/wallet/ledger";
import { computeSplit, type MoneySplit } from "@/lib/pricing/split";
import { recordCommission } from "@/lib/payments/platform-account";
import { effectiveCommissionPct, recordTierRide } from "@/lib/drivers/tiers";
import {
    driverReferralDiscountCents,
    payFirstRideBonusIfDue,
} from "@/lib/drivers/referral";
import { awardSwyp } from "@/lib/swyp/rewards";
import {
    fundBacking,
    getSwypRate,
    unitsToCents,
    redeemSwypForPayment,
} from "@/lib/swyp/valuation";
import { getSwypBalanceUnits } from "@/lib/swyp/ledger";
import { logger } from "@/lib/logger";
import { MOBILITY_PLATFORM_FEE_BPS, MOBILITY_COURIER_SHARE_BPS } from "@/lib/config/commerce";

const log = logger.child({ mod: "payments/mobility" });

const DEFAULT_PLATFORM_COMMISSION_PCT = MOBILITY_PLATFORM_FEE_BPS / 100;
const DEFAULT_COURIER_SHARE_PCT = MOBILITY_COURIER_SHARE_BPS / 100;

export type SettleResult = {
    settled: boolean;
    alreadySettled: boolean;
    split: MoneySplit;
    /** suma mișcată în ledger (credit net sau debit datorie) */
    ledger_amount_cents: number;
    ledger_kind: "credit" | "debit" | "none";
};

async function zonePercents(zoneId: string | null): Promise<{ platform: number; courier: number }> {
    if (zoneId) {
        const { rows } = await dbQuery<{ platform_commission_pct: string; courier_share_pct: string }>(
            `SELECT platform_commission_pct, courier_share_pct FROM pricing_zones WHERE id = $1`,
            [zoneId],
        );
        if (rows[0]) {
            return {
                platform: Number(rows[0].platform_commission_pct),
                courier: Number(rows[0].courier_share_pct),
            };
        }
    }
    return { platform: DEFAULT_PLATFORM_COMMISSION_PCT, courier: DEFAULT_COURIER_SHARE_PCT };
}

// ─── Curse (Swypik Go) ───────────────────────────────────────────────────────

/**
 * Decontează o cursă completed. Apelabil de oricâte ori — idempotent.
 * paymentIsCash: true = șoferul a încasat cash; false = card (platforma are banii).
 */
export async function settleRide(rideId: string): Promise<SettleResult | null> {
    const { rows } = await dbQuery<{
        id: string;
        status: string;
        driver_id: string | null;
        rider_id: string | null;
        final_fare_cents: number | null;
        estimated_fare_cents: number | null;
        tip_cents: number;
        payment_method: string | null;
        pricing_zone_id: string | null;
        driver_user_id: string | null;
        swyp_paid_cents: number;
        fare_breakdown: Record<string, unknown> | null;
    }>(
        `SELECT r.id, r.status, r.driver_id, r.rider_user_id AS rider_id, r.final_fare_cents, r.estimated_fare_cents,
            COALESCE(r.tip_cents, 0)::int AS tip_cents, r.payment_method, r.pricing_zone_id,
            c.user_id AS driver_user_id, COALESCE(r.swyp_paid_cents, 0)::int AS swyp_paid_cents,
            r.fare_breakdown
       FROM rides r
       LEFT JOIN couriers c ON c.id = r.driver_id
      WHERE r.id = $1`,
        [rideId],
    );
    const ride = rows[0];
    if (!ride || ride.status !== "completed" || !ride.driver_user_id) return null;

    const fare = ride.final_fare_cents ?? ride.estimated_fare_cents ?? 0;

    // Plată hibridă cu SWYP (swyp_paid_cents = -1 → intenție exprimată la comandă):
    // acoperim cât permit soldul, cursul și fondul de acoperire, LA CURSUL DE ACUM.
    // Restul tarifului merge pe metoda de bază (cash/card). Idempotent per cursă.
    if (ride.rider_id && ride.swyp_paid_cents === -1 && fare > 0) {
        let covered = 0;
        try {
            const rate = await getSwypRate();
            if (rate.rate_microcents_per_unit > 0n) {
                const balanceUnits = await getSwypBalanceUnits(ride.rider_id);
                const maxFromBalance = Number(unitsToCents(balanceUnits, rate));
                const want = Math.min(fare, maxFromBalance);
                if (want > 0) {
                    const redeemed = await redeemSwypForPayment({
                        userId: ride.rider_id,
                        cents: want,
                        refType: "ride_swyp",
                        refId: ride.id,
                    });
                    if (redeemed.ok) covered = redeemed.cents_covered;
                }
            }
        } catch (err) {
            log.warn({ err, rideId: ride.id }, "swyp hybrid payment failed — falling back to base method");
        }
        await dbQuery(`UPDATE rides SET swyp_paid_cents = $1 WHERE id = $2`, [covered, ride.id]);
        ride.swyp_paid_cents = covered;
    }
    // Founding Drivers: treapta șoferului (15/18/20% sau 0% în promo) primează;
    // fallback pe procentul zonei pentru șoferii fără treaptă (date vechi).
    const tierPct = ride.driver_id ? await effectiveCommissionPct(ride.driver_id) : null;
    const pct = tierPct
        ? { platform: tierPct.platform_pct, courier: tierPct.courier_pct }
        : await zonePercents(ride.pricing_zone_id);
    const split = computeSplit({
        fee_cents: fare,
        tip_cents: ride.tip_cents,
        platform_commission_pct: pct.platform,
        courier_share_pct: pct.courier,
    });

    // Referral șofer→client: 2% din tarif (max 15 RON) înapoi la client, plătit
    // din comisionul platformei — cota șoferului NU scade.
    const referralDiscount = ride.rider_id
        ? Math.min(
            await driverReferralDiscountCents(ride.rider_id, fare),
            split.platform_cents,
        )
        : 0;

    const isCash = (ride.payment_method ?? "cash") === "cash";
    let result: SettleResult;

    if (isCash) {
        // Șoferul a încasat cash doar partea neacoperită de SWYP (fondul a
        // plătit restul către platformă) → datoria lui scade cu partea SWYP.
        // Dacă SWYP a acoperit mai mult decât comisionul, platforma îi
        // datorează diferența (debit negativ → credit).
        const debt = split.platform_cents - Math.max(0, ride.swyp_paid_cents);
        if (debt > 0) {
            const r = await debitUser({
                userId: ride.driver_user_id,
                amountCents: debt,
                refType: "ride",
                refId: ride.id,
                description: `Comision platformă cursă cash #${ride.id.slice(0, 8)}`,
                metadata: { split, payment: "cash", swyp_paid_cents: ride.swyp_paid_cents },
                allowNegative: true,
            });
            result = { settled: true, alreadySettled: r.alreadyApplied, split, ledger_amount_cents: debt, ledger_kind: "debit" };
        } else if (debt < 0) {
            const r = await creditUser({
                userId: ride.driver_user_id,
                amountCents: -debt,
                refType: "ride",
                refId: ride.id,
                description: `Diferență cursă plătită cu SWYP #${ride.id.slice(0, 8)}`,
                metadata: { split, payment: "cash+swyp", swyp_paid_cents: ride.swyp_paid_cents },
            });
            result = { settled: true, alreadySettled: r.alreadyApplied, split, ledger_amount_cents: -debt, ledger_kind: "credit" };
        } else {
            result = { settled: true, alreadySettled: false, split, ledger_amount_cents: 0, ledger_kind: "none" };
        }
    } else {
        // Card: platforma are banii → creditează șoferul cu cota + bacșiș.
        const net = split.courier_cents + split.tip_cents;
        if (net > 0) {
            const r = await creditUser({
                userId: ride.driver_user_id,
                amountCents: net,
                refType: "ride",
                refId: ride.id,
                description: `Câștig cursă card #${ride.id.slice(0, 8)}`,
                metadata: { split, payment: "card" },
            });
            result = { settled: true, alreadySettled: r.alreadyApplied, split, ledger_amount_cents: net, ledger_kind: "credit" };
        } else {
            result = { settled: true, alreadySettled: false, split, ledger_amount_cents: 0, ledger_kind: "none" };
        }
    }

    // Reducerea de referral: creditată clientului în wallet (idempotent pe ride),
    // suportată din comisionul platformei.
    if (referralDiscount > 0 && ride.rider_id) {
        await creditUser({
            userId: ride.rider_id,
            amountCents: referralDiscount,
            refType: "driver_referral_discount",
            refId: ride.id,
            description: `Reducere referral cursă #${ride.id.slice(0, 8)}`,
        });
    }

    // Comisionul platformei — intrare pe contul tehnic (idempotent pe ride id).
    await recordCommission({
        refType: "commission_ride",
        refId: ride.id,
        amountCents: split.platform_cents - referralDiscount,
        description: `Comision cursă #${ride.id.slice(0, 8)}`,
        metadata: {
            split,
            payment: isCash ? "cash" : "card",
            gmv_cents: fare + ride.tip_cents,
            tier: tierPct?.tier ?? null,
            in_promo: tierPct?.in_promo ?? false,
            referral_discount_cents: referralDiscount,
        },
    });

    // Founding Drivers: contorizează cursa pentru condiția de activitate și
    // plătește bonusul de 5 RON la prima cursă a unui client invitat.
    if (!result.alreadySettled) {
        if (ride.driver_id) await recordTierRide(ride.driver_id);
        if (ride.rider_id) await payFirstRideBonusIfDue(ride.rider_id);

        // Acoperirea SWYP: un procent din comisionul NET intră în fondul care
        // dă valoare monedei. Fără încasări reale, cursul rămâne 0.
        // În perioada promo (comision 0%) baza e booking fee-ul — singura
        // parte care rămâne mereu a platformei — altfel fondul ar stagna 60 zile.
        try {
            const bookingFee = Number(
                (ride.fare_breakdown as { booking_fee_cents?: number } | null)?.booking_fee_cents ?? 0,
            );
            await fundBacking({
                commissionCents: Math.max(split.platform_cents - referralDiscount, bookingFee),
                refType: "ride",
                refId: ride.id,
            });
        } catch (err) {
            log.warn({ err, rideId: ride.id }, "swyp backing (ride) failed");
        }

        // Cashback în SWYP pentru client (regula go_ride_completed, cu cap
        // zilnic și anti-sybil: doar pe curse plătite efectiv). Best-effort —
        // o eroare la recompensă nu trebuie să blocheze decontarea banilor.
        if (ride.rider_id) {
            try {
                await awardSwyp({
                    userId: ride.rider_id,
                    action: "go_ride_completed",
                    refId: ride.id,
                    paidTxRef: ride.id,
                    valueCents: fare,
                    metadata: { fare_cents: fare, payment: isCash ? "cash" : "card" },
                });
            } catch (err) {
                log.warn({ err, rideId: ride.id }, "swyp cashback (ride) failed");
            }
        }
    }

    await dbQuery(`UPDATE rides SET settled_at = COALESCE(settled_at, now()) WHERE id = $1`, [rideId]);
    log.info({ rideId, isCash, split, kind: result.ledger_kind, amount: result.ledger_amount_cents }, "ride settled");
    return result;
}

// ─── Livrări (Swypik Eats) ───────────────────────────────────────────────────

/** Decontează o comandă locală livrată. Idempotent. */
export async function settleLocalOrder(orderId: string): Promise<SettleResult | null> {
    const { rows } = await dbQuery<{
        id: string;
        status: string;
        merchant_id: string;
        subtotal_cents: number;
        delivery_fee_cents: number;
        tip_cents: number;
        payment_method: string | null;
        pricing_zone_id: string | null;
        courier_user_id: string | null;
        customer_user_id: string | null;
    }>(
        `SELECT lo.id, lo.status, lo.merchant_id,
            COALESCE(lo.subtotal_cents, 0)::int  AS subtotal_cents,
            COALESCE(lo.delivery_fee_cents, 0)::int AS delivery_fee_cents,
            COALESCE(lo.tip_cents, 0)::int AS tip_cents,
            lo.payment_method, lo.pricing_zone_id,
            lo.customer_user_id,
            c.user_id AS courier_user_id
       FROM local_orders lo
       LEFT JOIN couriers c ON c.id = lo.courier_id
      WHERE lo.id = $1`,
        [orderId],
    );
    const order = rows[0];
    if (!order || order.status !== "delivered" || !order.courier_user_id) return null;

    const pct = await zonePercents(order.pricing_zone_id);
    const split = computeSplit({
        items_cents: order.subtotal_cents,
        fee_cents: order.delivery_fee_cents,
        tip_cents: order.tip_cents,
        platform_commission_pct: pct.platform,
        courier_share_pct: pct.courier,
    });

    const isCash = (order.payment_method ?? "cash") === "cash";
    let result: SettleResult;

    if (isCash) {
        // Curierul a încasat totul → datorează merchant + platformă.
        const debt = split.platform_cents + split.merchant_cents;
        if (debt > 0) {
            const r = await debitUser({
                userId: order.courier_user_id,
                amountCents: debt,
                refType: "order",
                refId: order.id,
                description: `Decont comandă cash #${order.id.slice(0, 8)} (merchant + comision)`,
                metadata: { split, payment: "cash" },
                allowNegative: true,
            });
            result = { settled: true, alreadySettled: r.alreadyApplied, split, ledger_amount_cents: debt, ledger_kind: "debit" };
        } else {
            result = { settled: true, alreadySettled: false, split, ledger_amount_cents: 0, ledger_kind: "none" };
        }
        // Platforma decontează merchantul din datoria curierului.
        if (split.merchant_cents > 0) {
            await dbQuery(
                `INSERT INTO merchant_settlements (merchant_id, order_id, amount_cents, source)
         VALUES ($1, $2, $3, 'cash_with_courier')
         ON CONFLICT (order_id) DO NOTHING`,
                [order.merchant_id, order.id, split.merchant_cents],
            );
        }
    } else {
        // Card: platforma are banii → creditează curierul, datorează merchantul.
        const net = split.courier_cents + split.tip_cents;
        if (net > 0) {
            const r = await creditUser({
                userId: order.courier_user_id,
                amountCents: net,
                refType: "order",
                refId: order.id,
                description: `Câștig livrare card #${order.id.slice(0, 8)}`,
                metadata: { split, payment: "card" },
            });
            result = { settled: true, alreadySettled: r.alreadyApplied, split, ledger_amount_cents: net, ledger_kind: "credit" };
        } else {
            result = { settled: true, alreadySettled: false, split, ledger_amount_cents: 0, ledger_kind: "none" };
        }
        if (split.merchant_cents > 0) {
            await dbQuery(
                `INSERT INTO merchant_settlements (merchant_id, order_id, amount_cents, source)
         VALUES ($1, $2, $3, 'platform_owes')
         ON CONFLICT (order_id) DO NOTHING`,
                [order.merchant_id, order.id, split.merchant_cents],
            );
        }
    }

    // Comisionul platformei — intrare pe contul tehnic (idempotent pe order id).
    await recordCommission({
        refType: "commission_order",
        refId: order.id,
        amountCents: split.platform_cents,
        description: `Comision comandă #${order.id.slice(0, 8)}`,
        metadata: {
            split,
            payment: isCash ? "cash" : "card",
            gmv_cents: order.subtotal_cents + order.delivery_fee_cents + order.tip_cents,
        },
    });

    // Cashback SWYP pentru client la livrare (regula eats_delivery_on_time,
    // cap zilnic + anti-sybil în awardSwyp). Best-effort.
    if (!result.alreadySettled && order.customer_user_id) {
        try {
            await awardSwyp({
                userId: order.customer_user_id,
                action: "eats_delivery_on_time",
                refId: order.id,
                paidTxRef: order.id,
                valueCents: order.subtotal_cents,
                metadata: { subtotal_cents: order.subtotal_cents, payment: isCash ? "cash" : "card" },
            });
        } catch (err) {
            log.warn({ err, orderId: order.id }, "swyp cashback (order) failed");
        }
    }

    // Acoperirea SWYP din comisionul comenzii (același mecanism ca la curse).
    if (!result.alreadySettled) {
        try {
            await fundBacking({
                commissionCents: split.platform_cents,
                refType: "order",
                refId: order.id,
            });
        } catch (err) {
            log.warn({ err, orderId: order.id }, "swyp backing (order) failed");
        }
    }

    await dbQuery(`UPDATE local_orders SET settled_at = COALESCE(settled_at, now()) WHERE id = $1`, [orderId]);
    log.info({ orderId, isCash, split, kind: result.ledger_kind, amount: result.ledger_amount_cents }, "order settled");
    return result;
}
