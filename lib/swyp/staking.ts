/**
 * Staking SWYP — blochezi, cursul crește pentru toți, primești bonus din surplus.
 *
 * Invarianți:
 *  1. Stake = transfer user → pool 'staking' (idempotent, în ledger). SWYP-ul
 *     stacat NU mai e în circulația liberă → cursul-podea P = F/C crește.
 *  2. Bonusul la scadență vine din pool-ul 'rewards', dar NUMAI în limita
 *     bugetului lunar de surplus: share × (intrări_fond_luna − valoare_emisă).
 *     Buget insuficient → bonus redus pro-rata. Niciodată emisie peste surplus
 *     (păstrează teorema: cursul nu scade).
 *  3. Retragere anticipată: principal integral înapoi, bonus 0. Fără pierderi
 *     de principal — nu e instrument financiar cu risc (MiCA).
 */
import { dbQuery, withTransaction } from "@/lib/db";
import { logger } from "@/lib/logger";
import { swypTransfer } from "./ledger";
import { getSwypRate } from "./valuation";

const log = logger.child({ mod: "swyp/staking" });

export type StakeTerm = 3 | 6 | 12;

type ApyConfig = Record<string, number>;

async function apyForTerm(term: StakeTerm): Promise<number> {
    const { rows } = await dbQuery<{ value: ApyConfig }>(
        `SELECT value FROM platform_config WHERE key = 'swyp_staking_apy_bps'`,
    );
    const cfg = rows[0]?.value ?? { "3": 800, "6": 1200, "12": 1800 };
    return Number(cfg[String(term)] ?? 0);
}

/** Bonusul nominal: principal × APY × (luni/12), în subunități. */
export function nominalBonusUnits(amountUnits: bigint, apyBps: number, termMonths: number): bigint {
    return (amountUnits * BigInt(apyBps) * BigInt(termMonths)) / (10_000n * 12n);
}

export type StakeResult =
    | { ok: true; stakeId: string; apyBps: number; maturesAt: string }
    | { ok: false; reason: "invalid_term" | "invalid_amount" | "insufficient_funds" };

/** Creează un stake: blochează suma în pool-ul 'staking'. */
export async function createStake(userId: string, amountUnits: bigint, term: StakeTerm): Promise<StakeResult> {
    if (![3, 6, 12].includes(term)) return { ok: false, reason: "invalid_term" };
    if (amountUnits < 100n) return { ok: false, reason: "invalid_amount" }; // minim 1 SWYP

    const apyBps = await apyForTerm(term);

    const { rows } = await dbQuery<{ id: string; matures_at: string }>(
        `INSERT INTO swyp_stakes (user_id, amount_units, term_months, apy_bps, matures_at)
     VALUES ($1, $2, $3, $4, now() + ($3 || ' months')::interval)
     RETURNING id::text, matures_at::text`,
        [userId, amountUnits.toString(), term, apyBps],
    );
    const stake = rows[0];

    try {
        const t = await swypTransfer({
            from: { userId },
            to: { pool: "staking" },
            amountUnits,
            kind: "transfer",
            refType: "stake_lock",
            refId: stake.id,
            description: `Stake ${term} luni @ ${apyBps / 100}% APY`,
        });
        await dbQuery(`UPDATE swyp_stakes SET ledger_lock_id = $2 WHERE id = $1`, [stake.id, t.entry.id]);
    } catch (err) {
        await dbQuery(`DELETE FROM swyp_stakes WHERE id = $1 AND ledger_lock_id IS NULL`, [stake.id]);
        log.warn({ err, userId, amountUnits: amountUnits.toString() }, "stake lock failed");
        return { ok: false, reason: "insufficient_funds" };
    }

    log.info({ userId, stakeId: stake.id, term, apyBps }, "stake created");
    return { ok: true, stakeId: stake.id, apyBps, maturesAt: stake.matures_at };
}

/**
 * Bugetul de bonusuri rămas în luna curentă (subunități SWYP):
 *   share × (alimentări_fond_luna_asta − valoarea_emisă_luna_asta), convertit
 *   la cursul curent, minus bonusurile deja plătite luna asta.
 * Fond gol / curs 0 → buget 0 → bonusurile așteaptă (stake-ul rămâne activ,
 * se plătește când există surplus — plata se reîncearcă la fiecare cron).
 */
export async function monthlyBonusBudgetUnits(): Promise<bigint> {
    const [{ rows: shareRows }, { rows: fundRows }, rate, { rows: paidRows }] = await Promise.all([
        dbQuery<{ value: unknown }>(`SELECT value FROM platform_config WHERE key = 'swyp_staking_surplus_share_bps'`),
        dbQuery<{ inflow: string }>(
            `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE direction = 'in'), 0)::text AS inflow
         FROM swyp_backing_ledger WHERE created_at >= date_trunc('month', now())`,
        ),
        getSwypRate(),
        dbQuery<{ paid: string }>(
            `SELECT COALESCE(SUM(amount_units), 0)::text AS paid
         FROM swyp_ledger_entries
        WHERE ref_type = 'stake_bonus' AND created_at >= date_trunc('month', now())`,
        ),
    ]);
    const shareBps = BigInt(Number(shareRows[0]?.value ?? 3000));
    const inflowCents = BigInt(fundRows[0].inflow);
    const rateMicro = rate.rate_microcents_per_unit; // microcents per unit
    if (rateMicro === 0n) return 0n;

    const budgetCents = (inflowCents * shareBps) / 10_000n;
    const budgetUnits = (budgetCents * 1_000_000n) / rateMicro;
    const alreadyPaid = BigInt(paidRows[0].paid);
    return budgetUnits > alreadyPaid ? budgetUnits - alreadyPaid : 0n;
}

/**
 * Procesează stake-urile scadente (chemat din cron):
 *  - principal înapoi user (pool staking → user);
 *  - bonus din pool rewards, plafonat la bugetul lunar (pro-rata implicit:
 *    primul venit primul servit per rulare, restul așteaptă luna următoare).
 */
export async function processMaturedStakes(limit = 50): Promise<{ processed: number; bonusesPaid: number }> {
    const { rows: due } = await dbQuery<{ id: string; user_id: string; amount_units: string; apy_bps: number; term_months: number }>(
        `SELECT id::text, user_id::text, amount_units::text, apy_bps, term_months
       FROM swyp_stakes
            WHERE status IN ('active', 'bonus_pending') AND matures_at <= now()
      ORDER BY matures_at ASC LIMIT $1`,
        [limit],
    );

    let processed = 0;
    let bonusesPaid = 0;
    let budget = await monthlyBonusBudgetUnits();

    for (const s of due) {
        const principal = BigInt(s.amount_units);
        const nominal = nominalBonusUnits(principal, s.apy_bps, s.term_months);
        const bonus = nominal <= budget ? nominal : 0n;

        // Fiecare stake se procesează într-o singură tranzacție, cu lock pe rând
        // (SKIP LOCKED): două rulări concurente ale cron-ului nu se calcă.
        // Stările sunt explicite — nu mai facem trucul matured→active, care
        // lăsa rândul într-o stare ruptă dacă procesul murea la mijloc.
        const paidBonus = await withTransaction(async (q) => {
            const locked = await q<{ id: string }>(
                `SELECT id FROM swyp_stakes
                  WHERE id = $1 AND status IN ('active', 'bonus_pending')
                  FOR UPDATE SKIP LOCKED`,
                [s.id],
            );
            if (!locked.rows[0]) return 0n; // alt proces îl are; îl reia data viitoare

            // Principalul: idempotent pe stake id — la reprocesare e no-op.
            await swypTransfer({
                from: { pool: "staking" },
                to: { userId: s.user_id },
                amountUnits: principal,
                kind: "transfer",
                refType: "stake_release",
                refId: s.id,
                description: `Stake ${s.term_months} luni — principal returnat`,
            });

            if (bonus > 0n) {
                await swypTransfer({
                    from: { pool: "rewards" },
                    to: { userId: s.user_id },
                    amountUnits: bonus,
                    kind: "reward",
                    refType: "stake_bonus",
                    refId: s.id,
                    description: `Bonus staking ${s.apy_bps / 100}% APY`,
                });
                await q(
                    `UPDATE swyp_stakes SET status = 'matured', closed_at = now(), bonus_units = $2
                      WHERE id = $1`,
                    [s.id, bonus.toString()],
                );
                return bonus;
            }

            // Fără buget luna asta: principalul e deja returnat, bonusul rămâne
            // de plătit. Stare explicită, reluată la următoarea rulare.
            await q(
                `UPDATE swyp_stakes SET status = $2 WHERE id = $1`,
                [s.id, nominal > 0n ? "bonus_pending" : "matured"],
            );
            if (nominal === 0n) {
                await q(`UPDATE swyp_stakes SET closed_at = now(), bonus_units = 0 WHERE id = $1`, [s.id]);
            }
            return 0n;
        });

        if (paidBonus > 0n) {
            budget -= paidBonus;
            bonusesPaid++;
        }
        processed++;
    }

    if (processed > 0) log.info({ processed, bonusesPaid }, "stakes matured");
    return { processed, bonusesPaid };
}

/** Retragere anticipată: principal integral, bonus 0. */
export async function withdrawEarly(userId: string, stakeId: string): Promise<boolean> {
    const { rows } = await dbQuery<{ amount_units: string }>(
        `UPDATE swyp_stakes SET status = 'withdrawn_early', closed_at = now(), bonus_units = 0
      WHERE id = $1 AND user_id = $2 AND status = 'active'
      RETURNING amount_units::text`,
        [stakeId, userId],
    );
    if (!rows[0]) return false;
    await swypTransfer({
        from: { pool: "staking" },
        to: { userId },
        amountUnits: BigInt(rows[0].amount_units),
        kind: "transfer",
        refType: "stake_release",
        refId: stakeId,
        description: "Retragere anticipată — principal integral, fără bonus",
    });
    return true;
}

/** Stake-urile userului + statistici globale. */
export async function getStakingOverview(userId: string) {
    const [{ rows: mine }, { rows: global }] = await Promise.all([
        dbQuery(
            `SELECT id::text, amount_units::text, term_months, apy_bps, status,
              started_at::text, matures_at::text, bonus_units::text
         FROM swyp_stakes WHERE user_id = $1 ORDER BY started_at DESC LIMIT 20`,
            [userId],
        ),
        dbQuery<{ total_staked: string; stakers: string }>(
            `SELECT COALESCE(SUM(amount_units), 0)::text AS total_staked,
              COUNT(DISTINCT user_id)::text AS stakers
         FROM swyp_stakes WHERE status = 'active'`,
        ),
    ]);
    return { stakes: mine, totalStakedUnits: global[0].total_staked, stakers: Number(global[0].stakers) };
}
