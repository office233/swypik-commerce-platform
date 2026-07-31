/**
 * Motorul de recompense SWYP — singurul drum prin care userii primesc SWYP.
 *
 * Reguli:
 *  - fiecare acțiune are o regulă în swyp_emission_rules (sumă, cap zilnic,
 *    requires_paid_tx, enabled) — configurabilă din DB, nu hardcodată;
 *  - capul zilnic e verificat pe ledger (sursa adevărului), nu pe contoare;
 *  - requires_paid_tx: apelantul TREBUIE să paseze paidTxRef (id-ul plății
 *    Stripe / comenzii finalizate) — anti-sybil: fără plată reală, fără reward;
 *  - plata efectivă = swypTransfer din pool-ul 'rewards' → user (idempotent).
 */
import { dbQuery } from "@/lib/db";
import { getSwypRate, centsToUnits } from "./valuation";
import { logger } from "@/lib/logger";
import { swypTransfer, type SwypTransferResult } from "./ledger";

export type SwypRewardAction =
    | "mining_daily"
    | "referral_validated"
    | "go_ride_completed"
    | "eats_delivery_on_time"
    | "creator_1k_views"
    | "order_review"
    | "clip_conversion"
    | "seller_first_sales";

export type AwardArgs = {
    userId: string;
    action: SwypRewardAction;
    /** Identificator unic al evenimentului (ex. order id, ride id, session id). */
    refId: string;
    /** Obligatoriu când regula are requires_paid_tx: referința plății reale. */
    paidTxRef?: string;
    /** Valoarea tranzacției în cents — pentru regulile cu pct_of_value_bps. */
    valueCents?: number;
    /** Cenții EFECTIV intrați în fondul de acoperire pentru această tranzacție
     *  — pentru regulile cu pct_of_funded_bps (emisie legată de încasări). */
    fundedCents?: number;
    /** Suprascrie suma regulii (ex. mining cu rată pe sesiune). */
    amountUnitsOverride?: bigint;
    metadata?: Record<string, unknown>;
};

export type AwardResult =
    | ({ awarded: true } & SwypTransferResult)
    | { awarded: false; reason: "rule_disabled" | "rule_missing" | "daily_cap_reached" | "paid_tx_required" };

type Rule = {
    action: string;
    amount_units: string;
    daily_cap_units: string | null;
    requires_paid_tx: boolean;
    enabled: boolean;
    pct_of_value_bps: number | null;
    pct_of_funded_bps: number | null;
};

export async function awardSwyp(args: AwardArgs): Promise<AwardResult> {
    const { userId, action, refId, paidTxRef, metadata } = args;

    const { rows } = await dbQuery<Rule>(
        `SELECT action, amount_units::text, daily_cap_units::text, requires_paid_tx, enabled,
            pct_of_value_bps, pct_of_funded_bps
       FROM swyp_emission_rules WHERE action = $1`,
        [action],
    );
    const rule = rows[0];
    if (!rule) return { awarded: false, reason: "rule_missing" };
    if (!rule.enabled) return { awarded: false, reason: "rule_disabled" };
    if (rule.requires_paid_tx && !paidTxRef) {
        logger.warn({ userId, action, refId }, "swyp.reward.paid_tx_required");
        return { awarded: false, reason: "paid_tx_required" };
    }

    // Suma: override explicit > procent din valoarea tranzacției (dacă regula
    // are pct_of_value_bps și cursul are acoperire) > suma fixă a regulii.
    // Procentual = cashback constant pentru client și curs auto-stabil: emitem
    // valoare echivalentă cu ce intră în fond, indiferent de mărimea cursei.
    let amount = args.amountUnitsOverride ?? null;
    // Prioritate 1: emisie legată de banii EFECTIV intrați în fond (raritate:
    // se emite doar o fracțiune din acoperire; fond neplătit = zero emisie).
    if (amount === null && rule.pct_of_funded_bps && args.fundedCents !== undefined) {
        if (args.fundedCents <= 0) return { awarded: false, reason: "rule_disabled" };
        const targetCents = BigInt(Math.floor((args.fundedCents * rule.pct_of_funded_bps) / 10_000));
        if (targetCents > 0n) {
            const rate = await getSwypRate();
            const units = centsToUnits(targetCents, rate);
            if (units > 0n) amount = units;
        }
        // Bootstrap doar aici: fond alimentat dar curs încă 0 (prima tranzacție)
        if (amount === null) amount = BigInt(rule.amount_units);
    }
    if (amount === null && rule.pct_of_value_bps && args.valueCents && args.valueCents > 0) {
        const targetCents = BigInt(Math.floor((args.valueCents * rule.pct_of_value_bps) / 10_000));
        if (targetCents > 0n) {
            const rate = await getSwypRate();
            const units = centsToUnits(targetCents, rate); // 0 dacă fondul e gol
            if (units > 0n) amount = units;
        }
    }
    // Bootstrap: fără acoperire (curs 0) nu se poate converti — suma fixă.
    if (amount === null) amount = BigInt(rule.amount_units);
    if (amount <= 0n) return { awarded: false, reason: "rule_disabled" };

    // Cap zilnic — calculat din ledger (sursa adevărului).
    if (rule.daily_cap_units !== null) {
        const cap = BigInt(rule.daily_cap_units);
        const { rows: sumRows } = await dbQuery<{ total: string }>(
            `SELECT COALESCE(SUM(amount_units), 0)::text AS total
         FROM swyp_ledger_entries
        WHERE to_user_id = $1 AND kind = 'reward' AND ref_type = $2
          AND created_at >= date_trunc('day', now())`,
            [userId, `reward:${action}`],
        );
        if (BigInt(sumRows[0].total) + amount > cap) {
            return { awarded: false, reason: "daily_cap_reached" };
        }
    }

    const result = await swypTransfer({
        from: { pool: "rewards" },
        to: { userId },
        amountUnits: amount,
        kind: "reward",
        refType: `reward:${action}`,
        refId,
        description: `SWYP reward: ${action}`,
        metadata: { ...metadata, ...(paidTxRef ? { paid_tx_ref: paidTxRef } : {}) },
    });
    return { awarded: true, ...result };
}

/** Cheltuire SWYP (checkout, boost, tips): user → pool-ul rewards (circular, fără burn). */
export async function spendSwyp(args: {
    userId: string;
    amountUnits: bigint;
    refType: string;
    refId: string;
    description?: string;
    metadata?: Record<string, unknown>;
}): Promise<SwypTransferResult> {
    return swypTransfer({
        from: { userId: args.userId },
        to: { pool: "rewards" },
        amountUnits: args.amountUnits,
        kind: "spend",
        refType: args.refType,
        refId: args.refId,
        description: args.description,
        metadata: args.metadata,
    });
}
