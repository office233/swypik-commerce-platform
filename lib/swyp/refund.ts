/**
 * Reversarea plăților cu SWYP — bani reali, disciplină de ledger.
 *
 * Cazuri acoperite:
 *  - payment_intent.canceled / payment_failed definitiv → comanda nu se mai
 *    plătește, SWYP-ul debitat la create-intent se întoarce integral la user;
 *  - charge.refunded → partea SWYP a comenzii hibride se întoarce proporțional
 *    cu cât s-a refundat din partea de card (refund total → tot SWYP-ul);
 *  - abandon tăcut (cron) → intentul a rămas requires_payment_method >24h.
 *
 * Mecanism: inversul exact al `redeemSwypForPayment`:
 *  - subunitățile merg pool 'rewards' → user (swypTransfer, idempotent după
 *    (refType, refId, kind));
 *  - cenții se întorc în fondul de acoperire (swyp_backing_ledger 'in',
 *    idempotent după (direction, ref_type, ref_id), gate pe RETURNING id).
 *
 * NIMIC de aici nu aruncă spre caller în fluxul de webhook — dar funcțiile
 * de bază aruncă, iar apelanții decid (webhook-ul vrea retry de la Stripe).
 */
import { dbQuery, withTransaction } from "@/lib/db";
import { logger } from "@/lib/logger";
import { swypTransfer } from "./ledger";

const log = logger.child({ mod: "swyp/refund" });

/** Debit-ul original de la create-intent: kind='spend', ref=(commerce_order, orderId). */
export type SwypSpend = {
    userId: string;
    units: bigint;
    /** Cenții acoperiți efectiv (din swyp_backing_ledger 'out'; fallback ledger metadata). */
    cents: number;
};

/**
 * Calcul PUR: câte subunități/cenți SWYP trebuie recreditați pentru un refund
 * (posibil parțial, posibil incremental — Stripe trimite charge.refunded cu
 * amount_refunded CUMULAT).
 *
 * target cumulat = floor(pro-rata din partea SWYP); creditul de acum e delta
 * față de ce s-a recreditat deja pentru același charge. Refund total (sau
 * amountTotal 0) → tot restul.
 */
export function computeSwypRefundShare(args: {
    /** Subunitățile debitate inițial. */
    spentUnits: bigint;
    /** Cenții acoperiți inițial din SWYP. */
    spentCents: number;
    /** charge.amount_refunded (cumulat, cenți card). */
    amountRefunded: number;
    /** charge.amount (total card, cenți). */
    amountTotal: number;
    /** Deja recreditat pentru acest charge (cumulat). */
    alreadyRefundedUnits?: bigint;
    alreadyRefundedCents?: number;
}): { units: bigint; cents: number } {
    const already = args.alreadyRefundedUnits ?? 0n;
    const alreadyCents = args.alreadyRefundedCents ?? 0;
    if (args.spentUnits <= 0n || args.amountRefunded <= 0) return { units: 0n, cents: 0 };

    let targetUnits: bigint;
    let targetCents: number;
    if (args.amountTotal <= 0 || args.amountRefunded >= args.amountTotal) {
        targetUnits = args.spentUnits;
        targetCents = args.spentCents;
    } else {
        targetUnits =
            (args.spentUnits * BigInt(args.amountRefunded)) / BigInt(args.amountTotal);
        targetCents = Math.floor((args.spentCents * args.amountRefunded) / args.amountTotal);
    }

    const units = targetUnits > already ? targetUnits - already : 0n;
    const cents = Math.max(0, Math.min(targetCents - alreadyCents, args.spentCents - alreadyCents));
    return { units, cents: units > 0n ? cents : 0 };
}

/** Găsește debitul SWYP original al unei comenzi (create-intent). */
export async function findSwypSpendForOrder(orderId: string): Promise<SwypSpend | null> {
    const { rows } = await dbQuery<{
        from_user_id: string | null;
        amount_units: string;
    }>(
        `SELECT from_user_id::text, amount_units::text
       FROM swyp_ledger_entries
      WHERE ref_type = 'commerce_order' AND ref_id = $1 AND kind = 'spend'
        AND from_user_id IS NOT NULL
      LIMIT 1`,
        [orderId],
    );
    const entry = rows[0];
    if (!entry?.from_user_id) return null;

    const { rows: backing } = await dbQuery<{ amount_cents: string }>(
        `SELECT amount_cents::text FROM swyp_backing_ledger
      WHERE direction = 'out' AND ref_type = 'commerce_order' AND ref_id = $1
      LIMIT 1`,
        [orderId],
    );

    return {
        userId: entry.from_user_id,
        units: BigInt(entry.amount_units),
        cents: Number(backing[0]?.amount_cents ?? 0),
    };
}

/** Există DEJA vreo reversare SWYP (oricare flux) pentru comanda asta? */
export async function hasAnySwypRefundForOrder(orderId: string): Promise<boolean> {
    const { rows } = await dbQuery<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM swyp_ledger_entries
      WHERE kind = 'adjustment'
        AND ref_type IN ('swyp_refund_intent', 'swyp_refund_abandoned', 'swyp_refund_charge')
        AND metadata->>'order_id' = $1`,
        [orderId],
    );
    return Number(rows[0]?.n ?? 0) > 0;
}

/** Cât s-a recreditat deja (cumulat) pentru un prefix de ref de refund. */
export async function sumSwypRefundsCredited(
    refType: string,
    refIdPrefix: string,
): Promise<{ units: bigint; cents: number }> {
    const { rows } = await dbQuery<{ total_units: string }>(
        `SELECT COALESCE(SUM(amount_units), 0)::text AS total_units
       FROM swyp_ledger_entries
      WHERE ref_type = $1 AND ref_id LIKE $2 AND kind = 'adjustment'`,
        [refType, `${refIdPrefix}%`],
    );
    const { rows: backing } = await dbQuery<{ total_cents: string }>(
        `SELECT COALESCE(SUM(amount_cents), 0)::text AS total_cents
       FROM swyp_backing_ledger
      WHERE direction = 'in' AND ref_type = $1 AND ref_id LIKE $2`,
        [refType, `${refIdPrefix}%`],
    );
    return {
        units: BigInt(rows[0]?.total_units ?? "0"),
        cents: Number(backing[0]?.total_cents ?? 0),
    };
}

/**
 * Recreditează idempotent un user: subunități pool 'rewards' → user și cenți
 * înapoi în fondul de acoperire. Idempotent după (refType, refId).
 */
export async function creditSwypRefund(args: {
    userId: string;
    units: bigint;
    cents: number;
    refType: string;
    refId: string;
    description: string;
    metadata?: Record<string, unknown>;
}): Promise<{ credited: boolean }> {
    if (args.units <= 0n) return { credited: false };

    const transfer = await swypTransfer({
        from: { pool: "rewards" },
        to: { userId: args.userId },
        amountUnits: args.units,
        kind: "adjustment",
        refType: args.refType,
        refId: args.refId,
        description: args.description,
        metadata: args.metadata,
    });
    if (transfer.alreadyApplied) {
        log.info({ refType: args.refType, refId: args.refId }, "swyp.refund.already_applied");
        return { credited: false };
    }

    if (args.cents > 0) {
        await withTransaction(async (q) => {
            const ins = await q(
                `INSERT INTO swyp_backing_ledger (direction, amount_cents, ref_type, ref_id, note)
         VALUES ('in', $1, $2, $3, 'refund plată SWYP')
         ON CONFLICT (direction, ref_type, ref_id) DO NOTHING
         RETURNING id`,
                [args.cents, args.refType, args.refId],
            );
            if (ins.rows.length > 0) {
                await q(
                    `UPDATE swyp_backing_fund
              SET balance_cents = balance_cents + $1,
                  total_in_cents = total_in_cents + $1,
                  updated_at = now()
            WHERE id = 1`,
                    [args.cents],
                );
            }
        });
    }

    log.info(
        {
            userId: args.userId,
            units: args.units.toString(),
            cents: args.cents,
            refType: args.refType,
            refId: args.refId,
        },
        "swyp.refund.credited",
    );
    return { credited: true };
}

/**
 * Reversare INTEGRALĂ a debitului SWYP al unei comenzi neplătite
 * (payment_intent.canceled / payment_failed definitiv / abandon).
 * Idempotent după (refType, refId). Best-effort la nivel de apelant.
 */
export async function refundSwypForUnpaidOrder(args: {
    orderId: string;
    refType: string; // ex. 'swyp_refund_intent'
    refId: string; //   ex. pi_xxx
    reason: string;
}): Promise<{ credited: boolean }> {
    const spend = await findSwypSpendForOrder(args.orderId);
    if (!spend) return { credited: false };

    // Guard cross-flux: webhook (swyp_refund_intent), cron
    // (swyp_refund_abandoned) și charge.refunded (swyp_refund_charge) folosesc
    // ref-uri diferite — idempotența pe ref NU acoperă dubla creditare între
    // ele. Ledger-ul e sursa adevărului: orice reversare deja înregistrată
    // pentru comanda asta → no-op.
    if (await hasAnySwypRefundForOrder(args.orderId)) {
        log.info({ orderId: args.orderId, refType: args.refType }, "swyp.refund.skip_already_reversed");
        return { credited: false };
    }

    const res = await creditSwypRefund({
        userId: spend.userId,
        units: spend.units,
        cents: spend.cents,
        refType: args.refType,
        refId: args.refId,
        description: `Refund SWYP (${args.reason})`,
        metadata: { order_id: args.orderId, reason: args.reason },
    });

    if (res.credited) {
        await dbQuery(
            `UPDATE commerce_orders
          SET metadata = metadata || jsonb_build_object(
                'swyp_refunded_at', NOW()::text,
                'swyp_refund_ref', $2::text,
                'swyp_refund_reason', $3::text)
        WHERE id = $1`,
            [args.orderId, `${args.refType}:${args.refId}`, args.reason],
        );
    }
    return res;
}

/**
 * Reversare (posibil parțială/incrementală) la charge.refunded pentru comenzi
 * hibride: recreditează pro-rata din partea SWYP, delta față de ce s-a
 * recreditat deja pentru același charge.
 * Ref idempotență: (swyp_refund_charge, <charge_id>:<amount_refunded>) —
 * retry-ul aceluiași event e no-op; un refund suplimentar (amount_refunded mai
 * mare) creditează doar diferența.
 */
export async function refundSwypForRefundedCharge(args: {
    orderId: string;
    chargeId: string;
    amountRefunded: number;
    amountTotal: number;
}): Promise<{ credited: boolean; units: bigint; cents: number }> {
    const spend = await findSwypSpendForOrder(args.orderId);
    if (!spend) return { credited: false, units: 0n, cents: 0 };

    // Dacă intentul a fost deja reversat integral (canceled/abandon), nu mai
    // există nimic de întors — evită dubla creditare între cele două fluxuri.
    const { rows: full } = await dbQuery<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM swyp_ledger_entries
      WHERE ref_type IN ('swyp_refund_intent', 'swyp_refund_abandoned')
        AND kind = 'adjustment'
        AND metadata->>'order_id' = $1`,
        [args.orderId],
    );
    if (Number(full[0]?.n ?? 0) > 0) {
        log.info({ orderId: args.orderId }, "swyp.refund.charge.skip_already_reversed");
        return { credited: false, units: 0n, cents: 0 };
    }

    const already = await sumSwypRefundsCredited("swyp_refund_charge", `${args.chargeId}:`);
    const share = computeSwypRefundShare({
        spentUnits: spend.units,
        spentCents: spend.cents,
        amountRefunded: args.amountRefunded,
        amountTotal: args.amountTotal,
        alreadyRefundedUnits: already.units,
        alreadyRefundedCents: already.cents,
    });
    if (share.units <= 0n) return { credited: false, units: 0n, cents: 0 };

    const res = await creditSwypRefund({
        userId: spend.userId,
        units: share.units,
        cents: share.cents,
        refType: "swyp_refund_charge",
        refId: `${args.chargeId}:${args.amountRefunded}`,
        description: `Refund SWYP charge ${args.chargeId}`,
        metadata: {
            order_id: args.orderId,
            charge_id: args.chargeId,
            amount_refunded: args.amountRefunded,
            amount_total: args.amountTotal,
        },
    });
    return { credited: res.credited, units: share.units, cents: share.cents };
}
