/**
 * GET|POST /api/cron/verify-supply — verificare orară a economiei SWYP.
 *
 *  1. Invariantul de supply (swyp_verify_supply()) — diff trebuie să fie 0.
 *  2. Integritatea hash-chain-ului swyp_ledger_entries (incremental: doar
 *     intrările noi de la ultimul checkpoint, memorat în platform_config).
 *
 * Orice abatere → ops alert CRITIC (webhook + ops_alert_log) și răspuns 500,
 * ca să apară și în monitorizarea cron-worker-ului.
 *
 * Auth: x-cron-secret / Bearer CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { withErrorHandling } from "@/lib/api-handler";
import { dbQuery } from "@/lib/db";
import { verifySupplyInvariant } from "@/lib/swyp/ledger";
import { notifyOps } from "@/lib/ops/alerts";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ cron: "verify-supply" });

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

type Checkpoint = { last_id: string; last_hash: string };

async function getCheckpoint(): Promise<Checkpoint> {
    const { rows } = await dbQuery<{ value: Checkpoint }>(
        `SELECT value FROM platform_config WHERE key = 'swyp_hashchain_checkpoint'`,
        [],
    );
    return rows[0]?.value ?? { last_id: "0", last_hash: "genesis" };
}

async function saveCheckpoint(cp: Checkpoint): Promise<void> {
    await dbQuery(
        `INSERT INTO platform_config (key, value)
     VALUES ('swyp_hashchain_checkpoint', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(cp)],
    );
}

/** Verifică hash-chain-ul incremental de la checkpoint. Returnează id-ul primei intrări corupte sau null. */
async function verifyChainIncremental(): Promise<{ badId: string | null; checked: number }> {
    const cp = await getCheckpoint();
    let lastHash = cp.last_hash;
    let lastId = BigInt(cp.last_id);
    let checked = 0;
    for (; ;) {
        const { rows } = await dbQuery<{
            id: string; from_pool: string | null; from_user_id: string | null;
            to_pool: string | null; to_user_id: string | null; amount_units: string;
            kind: string; ref_type: string; ref_id: string; prev_hash: string; entry_hash: string;
        }>(
            `SELECT id::text, from_pool, from_user_id::text, to_pool, to_user_id::text,
              amount_units::text, kind, ref_type, ref_id, prev_hash, entry_hash
         FROM swyp_ledger_entries WHERE id > $1 ORDER BY id ASC LIMIT 1000`,
            [lastId.toString()],
        );
        if (rows.length === 0) break;
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
            if (r.prev_hash !== lastHash || r.entry_hash !== expected) {
                return { badId: r.id, checked };
            }
            lastHash = r.entry_hash;
            lastId = BigInt(r.id);
            checked++;
        }
    }
    await saveCheckpoint({ last_id: lastId.toString(), last_hash: lastHash });
    return { badId: null, checked };
}

async function handle(req: Request) {
    if (!authorized(req)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const problems: string[] = [];

    // 1. Invariant supply.
    let diff = 0n;
    try {
        diff = await verifySupplyInvariant();
        if (diff !== 0n) problems.push(`supply invariant diff=${diff}`);
    } catch (err) {
        log.error({ err }, "verify-supply: invariant query failed");
        problems.push("invariant check failed (query error)");
    }

    // 2. Hash chain (incremental).
    let chain: { badId: string | null; checked: number } = { badId: null, checked: 0 };
    try {
        chain = await verifyChainIncremental();
        if (chain.badId) problems.push(`hash chain broken at entry id=${chain.badId}`);
    } catch (err) {
        log.error({ err }, "verify-supply: hash chain check failed");
        problems.push("hash chain check failed (query error)");
    }

    if (problems.length > 0) {
        await notifyOps({
            key: "swyp_supply_integrity",
            severity: "critical",
            title: "🚨 SWYP: integritate ledger compromisă",
            detail: problems.join("\n"),
            payload: { diff: diff.toString(), badId: chain.badId },
            cooldownMin: 30,
        });
        return NextResponse.json(
            { ok: false, problems, diff: diff.toString(), chain },
            { status: 500 },
        );
    }

    log.info({ checked: chain.checked }, "verify-supply: OK");
    return NextResponse.json({
        ok: true,
        diff: "0",
        chainCheckedEntries: chain.checked,
    });
}

export const GET = withErrorHandling(handle);
export const POST = withErrorHandling(handle);
