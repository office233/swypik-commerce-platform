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
import { logger } from "@/lib/logger";

const log = logger.child({ mod: "payments/mobility" });

const DEFAULT_PLATFORM_COMMISSION_PCT = 20;
const DEFAULT_COURIER_SHARE_PCT = 80;

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
    final_fare_cents: number | null;
    estimated_fare_cents: number | null;
    tip_cents: number;
    payment_method: string | null;
    pricing_zone_id: string | null;
    driver_user_id: string | null;
  }>(
    `SELECT r.id, r.status, r.driver_id, r.final_fare_cents, r.estimated_fare_cents,
            COALESCE(r.tip_cents, 0)::int AS tip_cents, r.payment_method, r.pricing_zone_id,
            c.user_id AS driver_user_id
       FROM rides r
       LEFT JOIN couriers c ON c.id = r.driver_id
      WHERE r.id = $1`,
    [rideId],
  );
  const ride = rows[0];
  if (!ride || ride.status !== "completed" || !ride.driver_user_id) return null;

  const fare = ride.final_fare_cents ?? ride.estimated_fare_cents ?? 0;
  const pct = await zonePercents(ride.pricing_zone_id);
  const split = computeSplit({
    fee_cents: fare,
    tip_cents: ride.tip_cents,
    platform_commission_pct: pct.platform,
    courier_share_pct: pct.courier,
  });

  const isCash = (ride.payment_method ?? "cash") === "cash";
  let result: SettleResult;

  if (isCash) {
    // Șoferul are toți banii → îi debităm comisionul platformei (datorie).
    const debt = split.platform_cents;
    if (debt > 0) {
      const r = await debitUser({
        userId: ride.driver_user_id,
        amountCents: debt,
        refType: "ride",
        refId: ride.id,
        description: `Comision platformă cursă cash #${ride.id.slice(0, 8)}`,
        metadata: { split, payment: "cash" },
        allowNegative: true,
      });
      result = { settled: true, alreadySettled: r.alreadyApplied, split, ledger_amount_cents: debt, ledger_kind: "debit" };
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

  // Comisionul platformei — intrare pe contul tehnic (idempotent pe ride id).
  await recordCommission({
    refType: "commission_ride",
    refId: ride.id,
    amountCents: split.platform_cents,
    description: `Comision cursă #${ride.id.slice(0, 8)}`,
    metadata: { split, payment: isCash ? "cash" : "card", gmv_cents: fare + ride.tip_cents },
  });

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
  }>(
    `SELECT lo.id, lo.status, lo.merchant_id,
            COALESCE(lo.subtotal_cents, 0)::int  AS subtotal_cents,
            COALESCE(lo.delivery_fee_cents, 0)::int AS delivery_fee_cents,
            COALESCE(lo.tip_cents, 0)::int AS tip_cents,
            lo.payment_method, lo.pricing_zone_id,
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

  await dbQuery(`UPDATE local_orders SET settled_at = COALESCE(settled_at, now()) WHERE id = $1`, [orderId]);
  log.info({ orderId, isCash, split, kind: result.ledger_kind, amount: result.ledger_amount_cents }, "order settled");
  return result;
}
