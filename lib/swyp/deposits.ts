/**
 * Deposit watcher: chain → aplicație (inversul withdraw-ului).
 *
 * Userul trimite SWYP nativ din portofelul lui on-chain către adresa
 * trezoreriei REWARDS. Scanner-ul (rulat de cron) parcurge blocurile noi,
 * găsește transferurile către trezorerie venite de la adrese de portofel
 * cunoscute (swyp_chain_wallets) și creditează ledger-ul intern
 * (pool rewards → user), idempotent după tx_hash.
 *
 * Simetrie economică: withdraw = user→pool intern + trezorerie→user on-chain;
 * deposit = user→trezorerie on-chain + pool→user intern. Supply-ul intern
 * rămâne invariant.
 */
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { publicClient, treasuryAddress } from "./chain";
import { swypTransfer } from "./ledger";

const MAX_BLOCKS_PER_RUN = 600; // ~50 min de chain la 5s/bloc — cron la 5 min e lejer

export type DepositScanResult = {
    fromBlock: bigint;
    toBlock: bigint;
    found: number;
    credited: number;
};

export async function scanChainDeposits(): Promise<DepositScanResult> {
    const pub = publicClient();
    const treasury = treasuryAddress().toLowerCase();

    const head = await pub.getBlockNumber();
    const { rows: cur } = await dbQuery<{ last_block: string }>(
        `SELECT last_block::text FROM swyp_chain_scan_cursor WHERE id = 1 FOR UPDATE`,
    );
    const from = BigInt(cur[0]?.last_block ?? "0") + 1n;
    if (from > head) return { fromBlock: from, toBlock: head, found: 0, credited: 0 };
    const to = head - from >= BigInt(MAX_BLOCKS_PER_RUN) ? from + BigInt(MAX_BLOCKS_PER_RUN) - 1n : head;

    // adresele de portofel cunoscute → user
    const { rows: wallets } = await dbQuery<{ user_id: string; address: string }>(
        `SELECT user_id::text, lower(address) AS address FROM swyp_chain_wallets`,
    );
    const walletToUser = new Map(wallets.map((w) => [w.address, w.user_id]));

    let found = 0;
    let credited = 0;

    for (let bn = from; bn <= to; bn++) {
        const block = await pub.getBlock({ blockNumber: bn, includeTransactions: true });
        for (const tx of block.transactions) {
            if (typeof tx === "string") continue;
            if (!tx.to || tx.to.toLowerCase() !== treasury || tx.value <= 0n) continue;
            const userId = walletToUser.get(tx.from.toLowerCase());
            if (!userId) continue; // transfer extern, nu e depozit de user
            found++;

            const units = (tx.value * 100n) / 10n ** 18n; // wei → subunități (1 SWYP = 100)
            const ins = await dbQuery<{ id: string }>(
                `INSERT INTO swyp_chain_deposits (user_id, from_address, tx_hash, block_number, amount_wei, amount_units)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tx_hash) DO NOTHING
         RETURNING id::text`,
                [userId, tx.from, tx.hash, bn.toString(), tx.value.toString(), units.toString()],
            );
            if (!ins.rows[0]) continue; // deja procesat

            if (units > 0n) {
                await swypTransfer({
                    from: { pool: "rewards" },
                    to: { userId },
                    amountUnits: units,
                    kind: "transfer",
                    refType: "chain_deposit",
                    refId: ins.rows[0].id,
                    description: `Depozit on-chain ${tx.hash.slice(0, 14)}…`,
                    metadata: { txHash: tx.hash, blockNumber: bn.toString() },
                });
                credited++;
            }
            await dbQuery(`UPDATE swyp_chain_deposits SET credited = true WHERE id = $1`, [ins.rows[0].id]);
            logger.info({ userId, txHash: tx.hash, units: units.toString() }, "swyp.deposit.credited");
        }
    }

    await dbQuery(
        `UPDATE swyp_chain_scan_cursor SET last_block = $1, updated_at = now() WHERE id = 1`,
        [to.toString()],
    );
    return { fromBlock: from, toBlock: to, found, credited };
}
