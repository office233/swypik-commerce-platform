/**
 * POST /api/swyp/transfer — P2P on-chain: SWYP din portofelul custodial al
 * userului către ORICE adresă Swypik Chain.
 *   { toAddress: "0x...", amountSwyp: number }
 *
 * Siguranță:
 *  - validare adresă EVM strictă; interzis transfer către propria adresă;
 *  - minim 0.01 SWYP; verificare sold on-chain (sumă + gas) înainte de emitere;
 *  - jurnal complet în swyp_p2p_transfers (pending → submitted → sent/failed);
 *  - hash-ul se persistă IMEDIAT după emitere (fără fereastră de dublare);
 *  - rate limit strâns.
 *
 * GET — istoricul transferurilor P2P ale userului.
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getOrCreateChainWallet, getPrivateKey } from "@/lib/swyp/wallet";
import { submitUserTransfer, waitForChainReceipt, InsufficientChainBalanceError } from "@/lib/swyp/chain";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const MIN_UNITS = 1n; // 0.01 SWYP

export const POST = withErrorHandling(async (req: Request) => {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

    const limited = await rateLimit("swypTransfer", session.userId);
    if (!limited.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const toAddress = String(body?.toAddress ?? "").trim();
    const amountSwyp = Number(body?.amountSwyp);

    if (!ADDRESS_RE.test(toAddress)) {
        return NextResponse.json({ success: false, error: "invalid_address" }, { status: 400 });
    }
    if (!Number.isFinite(amountSwyp) || amountSwyp <= 0) {
        return NextResponse.json({ success: false, error: "invalid_amount" }, { status: 400 });
    }
    const units = BigInt(Math.round(amountSwyp * 100));
    if (units < MIN_UNITS) {
        return NextResponse.json({ success: false, error: "min_amount" }, { status: 400 });
    }
    const wei = (units * 10n ** 18n) / 100n;

    const wallet = await getOrCreateChainWallet(session.userId);
    if (wallet.address.toLowerCase() === toAddress.toLowerCase()) {
        return NextResponse.json({ success: false, error: "self_transfer" }, { status: 400 });
    }
    const pk = await getPrivateKey(session.userId);
    if (!pk) {
        return NextResponse.json({ success: false, error: "wallet_unavailable" }, { status: 500 });
    }

    const { rows } = await dbQuery<{ id: string }>(
        `INSERT INTO swyp_p2p_transfers (user_id, from_address, to_address, amount_units)
     VALUES ($1, $2, $3, $4) RETURNING id::text`,
        [session.userId, wallet.address, toAddress, units.toString()],
    );
    const transferId = rows[0].id;

    let txHash: `0x${string}` | null = null;
    try {
        txHash = await submitUserTransfer(pk as `0x${string}`, toAddress as `0x${string}`, wei);
        await dbQuery(
            `UPDATE swyp_p2p_transfers SET status='submitted', tx_hash=$2, updated_at=now() WHERE id=$1`,
            [transferId, txHash],
        );
        await waitForChainReceipt(txHash);
        await dbQuery(
            `UPDATE swyp_p2p_transfers SET status='sent', updated_at=now() WHERE id=$1`,
            [transferId],
        );
        logger.info({ userId: session.userId, transferId, txHash, toAddress }, "swyp.transfer.sent");
        return NextResponse.json({
            success: true,
            txHash,
            explorerUrl: `https://scan.swypik.com/tx/${txHash}`,
        });
    } catch (err) {
        if (txHash) {
            // emisă dar neconfirmată în timeout — rămâne 'submitted', nu e eșec
            logger.error({ err, transferId, txHash }, "swyp.transfer.receipt_timeout");
            return NextResponse.json({
                success: true,
                pending: true,
                txHash,
                explorerUrl: `https://scan.swypik.com/tx/${txHash}`,
            });
        }
        const reason = err instanceof InsufficientChainBalanceError ? "insufficient_chain_balance" : "chain_failed";
        await dbQuery(
            `UPDATE swyp_p2p_transfers SET status='failed', error=$2, updated_at=now() WHERE id=$1`,
            [transferId, reason],
        );
        logger.error({ err, transferId }, "swyp.transfer.failed");
        const status = reason === "insufficient_chain_balance" ? 400 : 502;
        return NextResponse.json({ success: false, error: reason }, { status });
    }
});

export const GET = withErrorHandling(async () => {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

    const { rows } = await dbQuery(
        `SELECT id::text, from_address, to_address, amount_units::text, status, tx_hash, created_at
       FROM swyp_p2p_transfers
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
        [session.userId],
    );
    return NextResponse.json({ success: true, transfers: rows });
});
