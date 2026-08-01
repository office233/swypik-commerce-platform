/**
 * POST /api/swyp/withdraw — bridge: SWYP din aplicație → Swypik Chain.
 *   { amountSwyp: number }  → trimite către portofelul on-chain al userului.
 *
 * Siguranță:
 *  - minim 1 SWYP, maxim soldul disponibil;
 *  - debit intern idempotent (ledger, ref = withdrawal id) ÎNAINTE de chain;
 *  - la eșec on-chain: refund idempotent + status 'failed';
 *  - rate limit strâns (operațiune scumpă).
 *
 * GET — istoricul retragerilor userului.
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { swypTransfer, SwypInsufficientFundsError } from "@/lib/swyp/ledger";
import { getOrCreateChainWallet } from "@/lib/swyp/wallet";
import { submitFromTreasury, waitForChainReceipt } from "@/lib/swyp/chain";

export const dynamic = "force-dynamic";

const MIN_UNITS = 100n; // 1 SWYP

export const POST = withErrorHandling(async (req: Request) => {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

    const limited = await rateLimit("swypWithdraw", session.userId);
    if (!limited.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const amountSwyp = Number(body?.amountSwyp);
    if (!Number.isFinite(amountSwyp) || amountSwyp <= 0) {
        return NextResponse.json({ success: false, error: "invalid_amount" }, { status: 400 });
    }
    const units = BigInt(Math.round(amountSwyp * 100));
    if (units < MIN_UNITS) {
        return NextResponse.json({ success: false, error: "min_1_swyp" }, { status: 400 });
    }

    const wallet = await getOrCreateChainWallet(session.userId);

    // 1. Creează retragerea + debitează intern (user → pool rewards), idempotent.
    const { rows: wRows } = await dbQuery<{ id: string }>(
        `INSERT INTO swyp_withdrawals (user_id, to_address, amount_units)
     VALUES ($1, $2, $3) RETURNING id::text`,
        [session.userId, wallet.address, units.toString()],
    );
    const withdrawalId = wRows[0].id;

    try {
        await swypTransfer({
            from: { userId: session.userId },
            to: { pool: "rewards" },
            amountUnits: units,
            kind: "spend",
            refType: "withdraw_to_chain",
            refId: withdrawalId,
            description: `Retragere on-chain către ${wallet.address}`,
        });
    } catch (err) {
        await dbQuery(
            `UPDATE swyp_withdrawals SET status='failed', error=$2, completed_at=now() WHERE id=$1`,
            [withdrawalId, err instanceof SwypInsufficientFundsError ? "insufficient_funds" : "debit_failed"],
        );
        if (err instanceof SwypInsufficientFundsError) {
            return NextResponse.json({ success: false, error: "insufficient_funds" }, { status: 400 });
        }
        throw err;
    }

    // 2. Transfer on-chain din trezoreria REWARDS — în DOI pași ca să nu
    //    existe fereastră de dublare: (a) emitem tx și persistăm IMEDIAT
    //    hash-ul cu status 'submitted'; (b) așteptăm confirmarea → 'sent'.
    //    Dacă procesul moare după (a), retragerea rămâne 'submitted' cu
    //    tx_hash salvat — NU se emite refund, reconcilierea verifică chain-ul.
    let txHash: `0x${string}` | null = null;
    try {
        txHash = await submitFromTreasury(wallet.address as `0x${string}`, units);
        await dbQuery(
            `UPDATE swyp_withdrawals SET status='submitted', tx_hash=$2 WHERE id=$1`,
            [withdrawalId, txHash],
        );
        await waitForChainReceipt(txHash);
        await dbQuery(
            `UPDATE swyp_withdrawals SET status='sent', tx_hash=$2, completed_at=now() WHERE id=$1`,
            [withdrawalId, txHash],
        );
        logger.info({ userId: session.userId, withdrawalId, txHash }, "swyp.withdraw.sent");
        return NextResponse.json({
            success: true,
            txHash,
            explorerUrl: `https://scan.swypik.com/tx/${txHash}`,
            address: wallet.address,
        });
    } catch (err) {
        // 3a. Tx EMISĂ dar neconfirmată în timeout → NU refund (banii pot fi
        //     deja on-chain). Rămâne 'submitted'; reconcilierea decide.
        if (txHash) {
            logger.error({ err, withdrawalId, txHash }, "swyp.withdraw.receipt_timeout");
            return NextResponse.json({
                success: true,
                pending: true,
                txHash,
                explorerUrl: `https://scan.swypik.com/tx/${txHash}`,
                address: wallet.address,
            });
        }
        // 3b. Emiterea a eșuat complet → restituie intern (idempotent pe <id>).
        logger.error({ err, withdrawalId }, "swyp.withdraw.chain_failed");
        let refunded = true;
        try {
            await swypTransfer({
                from: { pool: "rewards" },
                to: { userId: session.userId },
                amountUnits: units,
                kind: "adjustment",
                refType: "withdraw_refund",
                refId: withdrawalId,
                description: "Refund retragere eșuată",
            });
        } catch (e) {
            refunded = false;
            logger.error({ err: e, withdrawalId }, "swyp.withdraw.refund_failed");
        }
        await dbQuery(
            `UPDATE swyp_withdrawals SET status=$2, error='chain_send_failed', completed_at=now() WHERE id=$1`,
            [withdrawalId, refunded ? "refunded" : "refund_failed"],
        );
        return NextResponse.json({ success: false, error: "chain_unavailable_refunded" }, { status: 502 });
    }
});

export const GET = withErrorHandling(async () => {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    const { rows } = await dbQuery(
        `SELECT id::text, to_address, amount_units::text, status, tx_hash, created_at::text
       FROM swyp_withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [session.userId],
    );
    return NextResponse.json({ success: true, withdrawals: rows });
});
