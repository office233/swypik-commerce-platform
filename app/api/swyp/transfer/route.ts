/**
 * POST /api/swyp/transfer — P2P on-chain: SWYP din portofelul custodial al
 * userului către UN ALT UTILIZATOR SWYPIK (transparență totală user↔bani).
 *   { toUsername: "nume", amountSwyp: number }  SAU  { toAddress: "0x...", amountSwyp: number }
 *
 * REGULĂ (2026-08-09): adresa destinație TREBUIE să aparțină unui utilizator
 * înregistrat (swyp_chain_wallets). Transferurile către adrese externe sunt
 * refuzate — fiecare unitate SWYP rămâne atribuibilă unui cont de pe site.
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
import { dbQuery, withTransaction } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getOrCreateChainWallet, getPrivateKey } from "@/lib/swyp/wallet";
import { submitUserTransfer, waitForChainReceipt, InsufficientChainBalanceError } from "@/lib/swyp/chain";
import { SWYP_EXPLORER_URL } from "@/lib/swyp/chain-public";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const MIN_UNITS = 1n; // 0.01 SWYP

export const POST = withErrorHandling(async (req: Request) => {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

    const limited = await rateLimit("swypTransfer", session.userId);
    if (!limited.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    let toAddress = String(body?.toAddress ?? "").trim();
    const toUsername = String(body?.toUsername ?? "").trim().replace(/^@/, "");
    const amountSwyp = Number(body?.amountSwyp);

    // Rezolvare username -> adresă (calea preferată, transparentă)
    let recipientUserId: string | null = null;
    let recipientUsername: string | null = null;
    if (toUsername) {
        const { rows: urows } = await dbQuery<{ id: string; username: string; address: string | null }>(
            `SELECT u.id::text, u.username, w.address
               FROM users u
               LEFT JOIN swyp_chain_wallets w ON w.user_id = u.id
              WHERE lower(u.username) = lower($1)`,
            [toUsername],
        );
        if (urows.length === 0) {
            return NextResponse.json({ success: false, error: "user_not_found" }, { status: 404 });
        }
        if (!urows[0].address) {
            return NextResponse.json({ success: false, error: "recipient_no_wallet" }, { status: 400 });
        }
        recipientUserId = urows[0].id;
        recipientUsername = urows[0].username;
        toAddress = urows[0].address;
    } else {
        if (!ADDRESS_RE.test(toAddress)) {
            return NextResponse.json({ success: false, error: "invalid_address" }, { status: 400 });
        }
        // Transparență: adresa TREBUIE să aparțină unui utilizator înregistrat.
        const { rows: wrows } = await dbQuery<{ user_id: string; username: string }>(
            `SELECT w.user_id::text, u.username
               FROM swyp_chain_wallets w
               JOIN users u ON u.id = w.user_id
              WHERE lower(w.address) = lower($1)`,
            [toAddress],
        );
        if (wrows.length === 0) {
            return NextResponse.json({ success: false, error: "unknown_recipient_address" }, { status: 400 });
        }
        recipientUserId = wrows[0].user_id;
        recipientUsername = wrows[0].username;
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

    // P1-02: serializăm transferurile ACELUIAȘI user. Fără lock, două cereri
    // concurente citeau amândouă același sold on-chain în `submitUserTransfer`
    // (TOCTOU) și derivau ACELAȘI nonce prin `getTransactionCount` — una era
    // respinsă cu "nonce too low", sau ambele treceau cu sold insuficient
    // pentru a doua. Lock-ul e legat de tranzacția-santinelă: se eliberează
    // garantat la COMMIT/ROLLBACK, deci nu rămâne blocat dacă procesul moare.
    //
    // Tranzacția ține DOAR lock-ul; scrierile de stare merg prin `dbQuery` pe
    // alte conexiuni, ca să fie vizibile imediat (hash-ul persistat înainte de
    // wait rămâne recuperabil chiar dacă santinela cade).
    return withTransaction(async (q) => {
        await q(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`swyp_p2p:${session.userId}`]);

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

            // P1-02: o tranzacție poate fi minată ȘI `reverted`. Înainte, orice
            // receipt însemna succes, deci transferul se marca 'sent' chiar dacă
            // on-chain eșuase — userul vedea confirmare pentru bani netrimiși.
            const receipt = await waitForChainReceipt(txHash);
            if (receipt.status !== "success") {
                await dbQuery(
                    `UPDATE swyp_p2p_transfers SET status='failed', error='reverted', updated_at=now() WHERE id=$1`,
                    [transferId],
                );
                logger.error({ transferId, txHash, status: receipt.status }, "swyp.transfer.reverted");
                return NextResponse.json(
                    { success: false, error: "tx_reverted", txHash, explorerUrl: `${SWYP_EXPLORER_URL}/tx/${txHash}` },
                    { status: 502 },
                );
            }

            await dbQuery(
                `UPDATE swyp_p2p_transfers SET status='sent', updated_at=now() WHERE id=$1`,
                [transferId],
            );
            logger.info({ userId: session.userId, transferId, txHash, toAddress }, "swyp.transfer.sent");
            return NextResponse.json({
                success: true,
                txHash,
                recipient: recipientUsername,
                explorerUrl: `${SWYP_EXPLORER_URL}/tx/${txHash}`,
            });
        } catch (err) {
            if (txHash) {
                // emisă dar neconfirmată în timeout — rămâne 'submitted', nu e eșec
                logger.error({ err, transferId, txHash }, "swyp.transfer.receipt_timeout");
                return NextResponse.json({
                    success: true,
                    pending: true,
                    txHash,
                    explorerUrl: `${SWYP_EXPLORER_URL}/tx/${txHash}`,
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
});

export const GET = withErrorHandling(async () => {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

    const { rows } = await dbQuery(
        `SELECT t.id::text, t.from_address, t.to_address, t.amount_units::text, t.status, t.tx_hash, t.created_at,
                                uf.username AS from_username,
                                ut.username AS to_username
             FROM swyp_p2p_transfers t
             LEFT JOIN swyp_chain_wallets wf ON lower(wf.address) = lower(t.from_address)
             LEFT JOIN users uf ON uf.id = wf.user_id
             LEFT JOIN swyp_chain_wallets wt ON lower(wt.address) = lower(t.to_address)
             LEFT JOIN users ut ON ut.id = wt.user_id
            WHERE t.user_id = $1
            ORDER BY t.created_at DESC
            LIMIT 50`,
        [session.userId],
    );
    return NextResponse.json({ success: true, transfers: rows });
});
