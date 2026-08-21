/**
 * GET|POST /api/cron/swyp-reconcile — reconciliere on-chain ↔ identități.
 *
 * Transparență user↔bani: scanează blocurile noi și verifică fiecare transfer
 * nativ SWYP. Orice adresă care PRIMEȘTE fonduri trebuie să fie:
 *   a) portofel de utilizator (swyp_chain_wallets), sau
 *   b) trezoreria, sau
 *   c) etichetată manual în swyp_known_addresses.
 * Altfel → ops alert (warning) cu tx-ul și adresa, ca să fie etichetată imediat.
 *
 * Cursor propriu (platform_config.swyp_reconcile_cursor) — independent de
 * scanner-ul de depozite.
 *
 * Auth: x-cron-secret / Bearer CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { withErrorHandling } from "@/lib/api-handler";
import { dbQuery } from "@/lib/db";
import { publicClient, treasuryAddress } from "@/lib/swyp/chain";
import { notifyOps } from "@/lib/ops/alerts";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ cron: "swyp-reconcile" });
const MAX_BLOCKS_PER_RUN = 600;

function authorized(req: Request): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const header =
        req.headers.get("x-cron-secret") ??
        req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
        "";
    const a = Buffer.from(header);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
}

async function getCursor(): Promise<bigint> {
    const { rows } = await dbQuery<{ value: { last_block: string } }>(
        `SELECT value FROM platform_config WHERE key = 'swyp_reconcile_cursor'`,
    );
    return BigInt(rows[0]?.value?.last_block ?? "0");
}

async function saveCursor(block: bigint): Promise<void> {
    await dbQuery(
        `INSERT INTO platform_config (key, value)
     VALUES ('swyp_reconcile_cursor', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify({ last_block: block.toString() })],
    );
}

async function handle(req: Request) {
    if (!authorized(req)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const pub = publicClient();
    const treasury = treasuryAddress().toLowerCase();
    const head = await pub.getBlockNumber();
    const from = (await getCursor()) + 1n;
    if (from > head) return NextResponse.json({ ok: true, scanned: 0, unknown: [] });
    const to = head - from >= BigInt(MAX_BLOCKS_PER_RUN) ? from + BigInt(MAX_BLOCKS_PER_RUN) - 1n : head;

    // Seturi de adrese permise
    const [{ rows: wallets }, { rows: known }] = await Promise.all([
        dbQuery<{ address: string }>(`SELECT lower(address) AS address FROM swyp_chain_wallets`),
        dbQuery<{ address: string }>(`SELECT address FROM swyp_known_addresses`),
    ]);
    const allowed = new Set<string>([treasury, ...wallets.map((w) => w.address), ...known.map((k) => k.address)]);

    const unknownRecipients: { address: string; txHash: string; block: string; amountWei: string; from: string }[] = [];
    let scannedTx = 0;

    for (let bn = from; bn <= to; bn++) {
        const block = await pub.getBlock({ blockNumber: bn, includeTransactions: true });
        for (const tx of block.transactions) {
            if (typeof tx === "string") continue;
            if (!tx.to || tx.value <= 0n) continue;
            scannedTx++;
            const dest = tx.to.toLowerCase();
            if (!allowed.has(dest)) {
                unknownRecipients.push({
                    address: dest,
                    txHash: tx.hash,
                    block: bn.toString(),
                    amountWei: tx.value.toString(),
                    from: tx.from.toLowerCase(),
                });
            }
        }
    }

    await saveCursor(to);

    if (unknownRecipients.length > 0) {
        const lines = unknownRecipients
            .slice(0, 10)
            .map((u) => `${u.address} a primit ${(Number(u.amountWei) / 1e18).toFixed(2)} SWYP (tx ${u.txHash.slice(0, 14)}…, block ${u.block})`);
        await notifyOps({
            key: "swyp_unknown_recipient",
            severity: "warning",
            title: "⚠️ SWYP: fonduri către adrese neidentificate",
            detail:
                `${unknownRecipients.length} transfer(uri) către adrese din afara registrului user/trezorerie/etichete:\n` +
                lines.join("\n") +
                "\nEtichetați-le în swyp_known_addresses pentru trasabilitate 100%.",
            payload: { unknown: unknownRecipients.slice(0, 25) },
            cooldownMin: 60,
        });
        log.warn({ count: unknownRecipients.length }, "swyp-reconcile: unknown recipients");
    } else {
        log.info({ from: from.toString(), to: to.toString(), scannedTx }, "swyp-reconcile: OK");
    }

    return NextResponse.json({
        ok: true,
        fromBlock: from.toString(),
        toBlock: to.toString(),
        scannedTx,
        unknownCount: unknownRecipients.length,
        unknown: unknownRecipients.slice(0, 25),
    });
}

export const GET = withErrorHandling(handle);
export const POST = withErrorHandling(handle);
