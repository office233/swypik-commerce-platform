/**
 * Ledger SWYP — primitivul UNIC de mutare a subunităților SWYP.
 *
 * Modelul: supply fix pre-mintat în pool-uri de trezorerie; orice recompensă,
 * cheltuială sau cumpărare e un TRANSFER pool↔user, niciodată emisie.
 *
 * Garanții (aceeași disciplină ca lib/wallet/ledger.ts — bani reali):
 *  - tranzacție unică; FOR UPDATE pe ambele părți (pool și/sau user), în
 *    ordine deterministă (pool-uri alfabetic, apoi useri după uuid) → fără
 *    deadlock la transferuri concurente încrucișate;
 *  - idempotent după (ref_type, ref_id, kind): duplicatul e no-op;
 *  - hash-chain: fiecare intrare include sha256 peste intrarea precedentă →
 *    ledger auditabil public și reconciliabil la migrarea on-chain;
 *  - soldul (pool sau user) nu coboară niciodată sub zero (CHECK în DB +
 *    verificare explicită aici).
 *
 * Unitate: 1 SWYP = 100 units (bigint). Folosim `bigint` JS pentru sume.
 */
import { createHash } from "crypto";
import { dbQuery, withTransaction } from "@/lib/db";
import { logger } from "@/lib/logger";

export type SwypParty =
    | { pool: "rewards" | "ecosystem" | "company" | "team" | "reserve" | "staking" }
    | { userId: string };

export type SwypLedgerEntry = {
    id: string;
    from_pool: string | null;
    from_user_id: string | null;
    to_pool: string | null;
    to_user_id: string | null;
    amount_units: string;
    kind: string;
    ref_type: string;
    ref_id: string;
    description: string | null;
    entry_hash: string;
    created_at: string;
};

export type SwypTransferResult = {
    entry: SwypLedgerEntry;
    alreadyApplied: boolean;
};

export class SwypDailyCapError extends Error {
    constructor(public readonly refType: string, public readonly capUnits: bigint) {
        super(`swyp_daily_cap_reached: refType=${refType} cap=${capUnits}`);
        this.name = "SwypDailyCapError";
    }
}

export class SwypInsufficientFundsError extends Error {
    constructor(
        public readonly party: string,
        public readonly balanceUnits: bigint,
        public readonly requestedUnits: bigint,
    ) {
        super(`swyp_insufficient_funds: party=${party} balance=${balanceUnits} requested=${requestedUnits}`);
        this.name = "SwypInsufficientFundsError";
    }
}

export type SwypTransferArgs = {
    from: SwypParty;
    to: SwypParty;
    amountUnits: bigint | number;
    kind: "reward" | "spend" | "purchase" | "transfer" | "adjustment" | "payment_redeem";
    refType: string;
    refId: string;
    description?: string;
    metadata?: Record<string, unknown>;
    /** Cap zilnic per destinatar (user) pentru acest refType. Verificat ÎN
     *  tranzacție, după FOR UPDATE pe soldul userului → fără TOCTOU. */
    dailyCapUnits?: bigint;
};

const ENTRY_COLS = `id::text, from_pool, from_user_id::text, to_pool, to_user_id::text,
       amount_units::text, kind, ref_type, ref_id, description, entry_hash, created_at::text`;

function isPool(p: SwypParty): p is { pool: string } & SwypParty {
    return "pool" in p;
}

/**
 * Transfer atomic SWYP între două părți (pool sau user).
 * Idempotent după (refType, refId, kind).
 */
export async function swypTransfer(args: SwypTransferArgs): Promise<SwypTransferResult> {
    const amount = BigInt(args.amountUnits);
    if (amount <= 0n) throw new Error("amount_units must be a positive integer");
    const { from, to, kind, refType, refId, description, metadata, dailyCapUnits } = args;

    return withTransaction(async (q) => {
        // 1. Idempotency check (în tx; duplicatele concurente se serializează pe UNIQUE).
        const existing = await q<SwypLedgerEntry>(
            `SELECT ${ENTRY_COLS} FROM swyp_ledger_entries
        WHERE ref_type = $1 AND ref_id = $2 AND kind = $3 LIMIT 1`,
            [refType, refId, kind],
        );
        if (existing.rows[0]) return { entry: existing.rows[0], alreadyApplied: true };

        // 2. Lock ambele părți în ordine deterministă (pool-urile înaintea userilor,
        //    apoi alfabetic/uuid) ca să evităm deadlock între transferuri opuse.
        const parties = [from, to].sort((a, b) => {
            const ka = isPool(a) ? `0:${a.pool}` : `1:${a.userId}`;
            const kb = isPool(b) ? `0:${b.pool}` : `1:${b.userId}`;
            return ka < kb ? -1 : 1;
        });

        const balances = new Map<string, bigint>();
        for (const p of parties) {
            if (isPool(p)) {
                const r = await q<{ balance_units: string }>(
                    `SELECT balance_units FROM swyp_treasury_pools WHERE pool = $1 FOR UPDATE`,
                    [p.pool],
                );
                if (!r.rows[0]) throw new Error(`unknown treasury pool: ${p.pool}`);
                balances.set(`pool:${p.pool}`, BigInt(r.rows[0].balance_units));
            } else {
                await q(
                    `INSERT INTO swyp_balances (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
                    [p.userId],
                );
                const r = await q<{ balance_units: string }>(
                    `SELECT balance_units FROM swyp_balances WHERE user_id = $1 FOR UPDATE`,
                    [p.userId],
                );
                balances.set(`user:${p.userId}`, BigInt(r.rows[0].balance_units));
            }
        }

        // 2b. Cap zilnic per destinatar — verificat DUPĂ lock (FOR UPDATE pe
        //     soldul userului serializează cererile concurente către același user).
        if (dailyCapUnits !== undefined && !isPool(to)) {
            const capRows = await q<{ total: string }>(
                `SELECT COALESCE(SUM(amount_units), 0)::text AS total
           FROM swyp_ledger_entries
          WHERE to_user_id = $1 AND kind = $2 AND ref_type = $3
            AND created_at >= date_trunc('day', now())`,
                [to.userId, kind, refType],
            );
            if (BigInt(capRows.rows[0].total) + amount > dailyCapUnits) {
                throw new SwypDailyCapError(refType, dailyCapUnits);
            }
        }

        const fromKey = isPool(from) ? `pool:${from.pool}` : `user:${from.userId}`;
        const fromBalance = balances.get(fromKey)!;
        if (fromBalance < amount) {
            throw new SwypInsufficientFundsError(fromKey, fromBalance, amount);
        }

        // 3. Hash-chain: citește ultima intrare (serializată de lock-urile de mai
        //    sus pe părțile implicate; pentru lanț global folosim advisory lock).
        await q(`SELECT pg_advisory_xact_lock(hashtext('swyp_ledger_chain'))`, []);
        const prev = await q<{ entry_hash: string }>(
            `SELECT entry_hash FROM swyp_ledger_entries ORDER BY id DESC LIMIT 1`,
            [],
        );
        const prevHash = prev.rows[0]?.entry_hash ?? "genesis";
        const hashPayload = [
            prevHash,
            isPool(from) ? from.pool : from.userId,
            isPool(to) ? to.pool : to.userId,
            amount.toString(),
            kind,
            refType,
            refId,
        ].join("|");
        const entryHash = createHash("sha256").update(hashPayload).digest("hex");

        // 4. Insert ledger entry (ON CONFLICT → duplicatul pierde cursa și devine no-op).
        const inserted = await q<SwypLedgerEntry>(
            `INSERT INTO swyp_ledger_entries
         (from_pool, from_user_id, to_pool, to_user_id, amount_units, kind,
          ref_type, ref_id, description, metadata, prev_hash, entry_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
       ON CONFLICT (ref_type, ref_id, kind) DO NOTHING
       RETURNING ${ENTRY_COLS}`,
            [
                isPool(from) ? from.pool : null,
                isPool(from) ? null : from.userId,
                isPool(to) ? to.pool : null,
                isPool(to) ? null : to.userId,
                amount.toString(),
                kind,
                refType,
                refId,
                description ?? null,
                JSON.stringify(metadata ?? {}),
                prevHash,
                entryHash,
            ],
        );
        if (!inserted.rows[0]) {
            const winner = await q<SwypLedgerEntry>(
                `SELECT ${ENTRY_COLS} FROM swyp_ledger_entries
          WHERE ref_type = $1 AND ref_id = $2 AND kind = $3 LIMIT 1`,
                [refType, refId, kind],
            );
            return { entry: winner.rows[0], alreadyApplied: true };
        }

        // 5. Actualizează soldurile în aceeași tranzacție.
        const applyDelta = async (p: SwypParty, delta: bigint) => {
            if (isPool(p)) {
                await q(
                    `UPDATE swyp_treasury_pools SET balance_units = balance_units + $2, updated_at = now() WHERE pool = $1`,
                    [p.pool, delta.toString()],
                );
            } else {
                await q(
                    `UPDATE swyp_balances SET balance_units = balance_units + $2, updated_at = now() WHERE user_id = $1`,
                    [p.userId, delta.toString()],
                );
            }
        };
        await applyDelta(from, -amount);
        await applyDelta(to, amount);

        logger.info(
            { from: fromKey, to: isPool(to) ? `pool:${to.pool}` : `user:${to.userId}`, amount: amount.toString(), kind, refType, refId },
            "swyp.ledger.applied",
        );
        return { entry: inserted.rows[0], alreadyApplied: false };
    });
}

/** Soldul SWYP al unui user, în subunități (0 dacă nu are wallet). */
export async function getSwypBalanceUnits(userId: string): Promise<bigint> {
    const { rows } = await dbQuery<{ balance_units: string }>(
        `SELECT balance_units FROM swyp_balances WHERE user_id = $1`,
        [userId],
    );
    return rows[0] ? BigInt(rows[0].balance_units) : 0n;
}

/** Verifică invariantul de supply. Returnează diferența (0n = sănătos). */
export async function verifySupplyInvariant(): Promise<bigint> {
    const { rows } = await dbQuery<{ diff: string }>(`SELECT swyp_verify_supply()::text AS diff`, []);
    return BigInt(rows[0].diff);
}

/** Verifică integritatea hash-chain-ului. Returnează id-ul primei intrări corupte sau null. */
export async function verifyHashChain(batchSize = 1000): Promise<string | null> {
    let lastHash = "genesis";
    let lastId = 0n;
    for (; ;) {
        const { rows } = await dbQuery<{
            id: string; from_pool: string | null; from_user_id: string | null;
            to_pool: string | null; to_user_id: string | null; amount_units: string;
            kind: string; ref_type: string; ref_id: string; prev_hash: string; entry_hash: string;
        }>(
            `SELECT id::text, from_pool, from_user_id::text, to_pool, to_user_id::text,
              amount_units::text, kind, ref_type, ref_id, prev_hash, entry_hash
         FROM swyp_ledger_entries WHERE id > $1 ORDER BY id ASC LIMIT $2`,
            [lastId.toString(), batchSize],
        );
        if (rows.length === 0) return null;
        for (const r of rows) {
            const payload = [
                lastHash,
                r.from_pool ?? r.from_user_id,
                r.to_pool ?? r.to_user_id,
                r.amount_units,
                r.kind,
                r.ref_type,
                r.ref_id,
            ].join("|");
            const expected = createHash("sha256").update(payload).digest("hex");
            if (r.prev_hash !== lastHash || r.entry_hash !== expected) return r.id;
            lastHash = r.entry_hash;
            lastId = BigInt(r.id);
        }
    }
}
