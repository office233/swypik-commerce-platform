/**
 * Valoarea REALĂ a SWYP — acoperire din profitul platformei.
 *
 * MODEL (decizie owner):
 *   curs = fond_de_acoperire (RON cents) / SWYP în circulație la utilizatori
 *
 *  - Fondul se alimentează cu swyp_backing_pct% (default 10) din comisionul NET
 *    al platformei, la fiecare decontare REALĂ (cursă/livrare). Nicio altă sursă.
 *  - Zero tranzacții → fond 0 → curs 0 → SWYP nu poate plăti nimic. Corect:
 *    moneda nu valorează nimic până când platforma nu încasează bani reali.
 *  - La plata cu SWYP: subunitățile se întorc în pool-ul 'rewards' (recirculare,
 *    nu ardere), iar contravaloarea în RON iese din fond. Astfel raportul
 *    fond/circulație rămâne coerent, iar șoferul e plătit mereu în bani reali.
 *
 * Precizie: cursul e ținut în MICROCENTS per subunitate (1 SWYP = 100 subunități),
 * ca bigint — fără floating point pe bani.
 */
import { dbQuery, withTransaction } from "@/lib/db";
import { swypTransfer } from "./ledger";
import { logger } from "@/lib/logger";

const log = logger.child({ mod: "swyp/valuation" });

/** 1 SWYP = 100 subunități (vezi 20260731_0002_swyp_treasury_ledger.sql). */
export const UNITS_PER_SWYP = 100n;
const MICRO = 1_000_000n;

export type SwypRate = {
    /** Microcents (1e-6 RON cents) per subunitate. 0 = fără acoperire. */
    rate_microcents_per_unit: bigint;
    backing_cents: bigint;
    circulating_units: bigint;
};

/** Procentul din comisionul net care alimentează fondul (platform_config). */
async function backingPct(): Promise<number> {
    const { rows } = await dbQuery<{ value: unknown }>(
        `SELECT value FROM platform_config WHERE key = 'swyp_backing_pct'`,
    );
    const v = Number(rows[0]?.value ?? 10);
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 10;
}

/** Subunitățile aflate la utilizatori (pool-urile de trezorerie NU contează). */
export async function circulatingUnits(): Promise<bigint> {
    const { rows } = await dbQuery<{ total: string | null }>(
        `SELECT COALESCE(SUM(balance_units), 0)::text AS total FROM swyp_balances`,
    );
    return BigInt(rows[0]?.total ?? "0");
}

export async function getSwypRate(): Promise<SwypRate> {
    const [{ rows: fund }, circulating] = await Promise.all([
        dbQuery<{ balance_cents: string }>(`SELECT balance_cents FROM swyp_backing_fund WHERE id = 1`),
        circulatingUnits(),
    ]);
    const backing = BigInt(fund[0]?.balance_cents ?? "0");
    const rate = circulating > 0n && backing > 0n ? (backing * MICRO) / circulating : 0n;
    return { rate_microcents_per_unit: rate, backing_cents: backing, circulating_units: circulating };
}

/** Valoarea în cents a unor subunități, la cursul curent (rotunjire în jos). */
export function unitsToCents(units: bigint, rate: SwypRate): bigint {
    if (rate.rate_microcents_per_unit === 0n) return 0n;
    return (units * rate.rate_microcents_per_unit) / MICRO;
}

/** Câte subunități acoperă o sumă în cents (rotunjire în sus — conservator). */
export function centsToUnits(cents: bigint, rate: SwypRate): bigint {
    if (rate.rate_microcents_per_unit === 0n) return 0n;
    const micro = cents * MICRO;
    const r = rate.rate_microcents_per_unit;
    return (micro + r - 1n) / r;
}

/**
 * Alimentează fondul din comisionul platformei. Idempotent după
 * (direction, ref_type, ref_id). Returnează cenții adăugați (0 dacă duplicat).
 */
export async function fundBacking(args: {
    commissionCents: number;
    refType: string;
    refId: string;
    note?: string;
}): Promise<number> {
    if (args.commissionCents <= 0) return 0;
    const pct = await backingPct();
    let amount = Math.floor((args.commissionCents * pct) / 100);
    if (amount <= 0) return 0;

    // Plafon lunar: costul SWYP e predictibil — fondul nu primește peste cap,
    // iar fără alimentare nu se emite nimic (emisia e legată de fond).
    const { rows: capRow } = await dbQuery<{ value: unknown }>(
        `SELECT value FROM platform_config WHERE key = 'swyp_backing_monthly_cap_cents'`,
    );
    const cap = Number(capRow[0]?.value ?? 0);
    if (cap > 0) {
        const { rows: used } = await dbQuery<{ total: string }>(
            `SELECT COALESCE(SUM(amount_cents), 0)::text AS total
                 FROM swyp_backing_ledger
                WHERE direction = 'in' AND created_at >= date_trunc('month', now())`,
        );
        const remaining = cap - Number(used[0]?.total ?? 0);
        if (remaining <= 0) return 0;
        amount = Math.min(amount, remaining);
    }

    return withTransaction(async (q) => {
        const ins = await q(
            `INSERT INTO swyp_backing_ledger (direction, amount_cents, ref_type, ref_id, note)
       VALUES ('in', $1, $2, $3, $4)
       ON CONFLICT (direction, ref_type, ref_id) DO NOTHING
       RETURNING id`,
            [amount, args.refType, args.refId, args.note ?? null],
        );
        if (ins.rows.length === 0) return 0; // deja alimentat pentru referința asta
        await q(
            `UPDATE swyp_backing_fund
          SET balance_cents = balance_cents + $1,
              total_in_cents = total_in_cents + $1,
              updated_at = now()
        WHERE id = 1`,
            [amount],
        );
        return amount;
    });
}

export type RedeemResult =
    | { ok: true; units_spent: bigint; cents_covered: number; already: boolean }
    | { ok: false; reason: "no_rate" | "insufficient_swyp" | "insufficient_fund" | "reserve_protection" };

/**
 * Rezerva anti-run: fondul nu poate coborî, prin redeem-uri, sub un procent
 * (default 20%) din valoarea lui de la începutul lunii curente.
 *
 * De ce: dacă toți deținătorii ar plăti cu SWYP simultan, fondul s-ar goli și
 * cursul s-ar prăbuși pentru cei rămași (bank run). Plafonul garantează că
 * într-o lună se poate răscumpăra cel mult 80% din fond — restul rămâne
 * acoperire pentru toți ceilalți. Configurabil: swyp_redeem_reserve_pct.
 *
 * Reconstruim valoarea de la începutul lunii din ledger (sursa adevărului):
 *   fond_început_lună = sold_curent + ieșiri_luna_asta − intrări_luna_asta
 */
async function redeemFloorCents(currentBalance: bigint): Promise<bigint> {
    const { rows: pctRow } = await dbQuery<{ value: unknown }>(
        `SELECT value FROM platform_config WHERE key = 'swyp_redeem_reserve_pct'`,
    );
    const pct = Number(pctRow[0]?.value ?? 20);
    if (!Number.isFinite(pct) || pct <= 0) return 0n;

    const { rows } = await dbQuery<{ month_in: string; month_out: string }>(
        `SELECT
            COALESCE(SUM(amount_cents) FILTER (WHERE direction = 'in'),  0)::text AS month_in,
            COALESCE(SUM(amount_cents) FILTER (WHERE direction = 'out'), 0)::text AS month_out
           FROM swyp_backing_ledger
          WHERE created_at >= date_trunc('month', now())`,
    );
    const monthStart = currentBalance + BigInt(rows[0].month_out) - BigInt(rows[0].month_in);
    if (monthStart <= 0n) return 0n;
    return (monthStart * BigInt(Math.round(pct))) / 100n;
}

/**
 * Plătește `cents` dintr-o tranzacție folosind SWYP-ul utilizatorului.
 * Subunitățile merg user → pool 'rewards'; cenții ies din fond.
 * Idempotent după (ref_type, ref_id).
 */
export async function redeemSwypForPayment(args: {
    userId: string;
    cents: number;
    refType: string;
    refId: string;
}): Promise<RedeemResult> {
    if (args.cents <= 0) return { ok: false, reason: "no_rate" };
    const rate = await getSwypRate();
    if (rate.rate_microcents_per_unit === 0n) return { ok: false, reason: "no_rate" };

    const needUnits = centsToUnits(BigInt(args.cents), rate);
    if (needUnits <= 0n) return { ok: false, reason: "no_rate" };

    // Fondul trebuie să poată acoperi suma (nu poate intra pe minus).
    const { rows: fund } = await dbQuery<{ balance_cents: string }>(
        `SELECT balance_cents FROM swyp_backing_fund WHERE id = 1`,
    );
    const balance = BigInt(fund[0]?.balance_cents ?? "0");
    if (balance < BigInt(args.cents)) {
        return { ok: false, reason: "insufficient_fund" };
    }

    // Rezerva anti-run: redeem-ul nu poate duce fondul sub pragul lunar.
    const floor = await redeemFloorCents(balance);
    if (floor > 0n && balance - BigInt(args.cents) < floor) {
        log.warn(
            { balance: balance.toString(), floor: floor.toString(), cents: args.cents },
            "swyp.redeem.reserve_protection",
        );
        return { ok: false, reason: "reserve_protection" };
    }

    try {
        const transfer = await swypTransfer({
            from: { userId: args.userId },
            to: { pool: "rewards" },
            amountUnits: needUnits,
            kind: "spend",
            refType: args.refType,
            refId: args.refId,
            description: `Plată cu SWYP (${args.cents} cents)`,
            metadata: { rate_microcents_per_unit: rate.rate_microcents_per_unit.toString() },
        });

        if (transfer.alreadyApplied) {
            return { ok: true, units_spent: needUnits, cents_covered: args.cents, already: true };
        }

        await withTransaction(async (q) => {
            await q(
                `INSERT INTO swyp_backing_ledger (direction, amount_cents, ref_type, ref_id, rate_microcents_per_unit, note)
         VALUES ('out', $1, $2, $3, $4, 'plata cu SWYP')
         ON CONFLICT (direction, ref_type, ref_id) DO NOTHING`,
                [args.cents, args.refType, args.refId, rate.rate_microcents_per_unit.toString()],
            );
            await q(
                `UPDATE swyp_backing_fund
            SET balance_cents = GREATEST(0, balance_cents - $1),
                total_out_cents = total_out_cents + $1,
                updated_at = now()
          WHERE id = 1`,
                [args.cents],
            );
        });

        return { ok: true, units_spent: needUnits, cents_covered: args.cents, already: false };
    } catch (err) {
        log.warn({ err, userId: args.userId, cents: args.cents }, "redeem swyp failed");
        return { ok: false, reason: "insufficient_swyp" };
    }
}

/** Cursul formatat pentru UI: RON per 1 SWYP, cu 4 zecimale. */
export function formatRonPerSwyp(rate: SwypRate): string {
    if (rate.rate_microcents_per_unit === 0n) return "0";
    // microcents/subunitate → RON/SWYP: *100 subunități, /1e6 microcents, /100 bani
    const ronPer1e6 = (rate.rate_microcents_per_unit * UNITS_PER_SWYP) / 100n; // microcents→ ... 
    return (Number(ronPer1e6) / 1_000_000).toFixed(4);
}
