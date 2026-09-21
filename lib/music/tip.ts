import { withTransaction, type TxQuery } from "@/lib/db";
import { swypTransferInTx, SwypInsufficientFundsError } from "@/lib/swyp/ledger";
import { platformShareUnits } from "@/lib/swyp/share";
import { logger } from "@/lib/logger";
import { MUSIC_ARTIST_SHARE_BPS } from "./config";
import { isValidTipUnits } from "./pricing";

export type TipResult =
    | { ok: true; alreadyApplied: boolean; units: number; artistShareUnits: number }
    | { ok: false; reason: "invalid_units" | "artist_not_found" | "insufficient_balance" };

export function tipRefId(userId: string, idempotencyKey: string): string {
    return `music_tip:${userId}:${idempotencyKey}`;
}

/**
 * Tip artist, idempotent după (user_id, idempotency_key) — vezi Review Focus #1:
 * un retry de rețea cu aceeași cheie nu debitează a doua oară.
 *   1. INSERT music_tips … ON CONFLICT (user_id, idempotency_key) DO NOTHING — garda;
 *   2. spend viewer → pool rewards;
 *   3. reward pool → artist (cota), sărit la self-tip sau cont oficial (cota 0);
 *   4. UPDATE music_tips cu suma/cota/ref.
 * Sold insuficient ⇒ SwypInsufficientFundsError ⇒ ROLLBACK (rândul din 1 dispare).
 */
export async function tipArtist(args: {
    userId: string;
    artistUserId: string;
    trackId: string | null;
    units: number;
    idempotencyKey: string;
}): Promise<TipResult> {
    if (!isValidTipUnits(args.units)) return { ok: false, reason: "invalid_units" };
    try {
        return await withTransaction(async (q: TxQuery) => {
            const { rows: artists } = await q(`SELECT 1 FROM music_artists WHERE user_id = $1`, [args.artistUserId]);
            if (!artists[0]) return { ok: false, reason: "artist_not_found" };

            const refId = tipRefId(args.userId, args.idempotencyKey);
            const { rows } = await q<{ id: string }>(
                `INSERT INTO music_tips (user_id, artist_user_id, track_id, idempotency_key, units, artist_share_units)
                 VALUES ($1, $2, $3, $4, $5, 0)
                 ON CONFLICT (user_id, idempotency_key) DO NOTHING
                 RETURNING id`,
                [args.userId, args.artistUserId, args.trackId, args.idempotencyKey, args.units],
            );
            const tipId = rows[0]?.id;
            if (!tipId) return { ok: true, alreadyApplied: true, units: 0, artistShareUnits: 0 };

            const spend = await swypTransferInTx(q, {
                from: { userId: args.userId },
                to: { pool: "rewards" },
                amountUnits: BigInt(args.units),
                kind: "spend",
                refType: "music_tip",
                refId,
                description: "Swypik Music tip",
                metadata: { artist_user_id: args.artistUserId, track_id: args.trackId },
            });

            const share = platformShareUnits(args.units, args.artistUserId, args.userId, MUSIC_ARTIST_SHARE_BPS);
            if (share > 0) {
                await swypTransferInTx(q, {
                    from: { pool: "rewards" },
                    to: { userId: args.artistUserId },
                    amountUnits: BigInt(share),
                    kind: "reward",
                    refType: "music_artist_share",
                    refId,
                    description: "Swypik Music artist share",
                    metadata: { artist_user_id: args.artistUserId, track_id: args.trackId, viewer_id: args.userId },
                });
            }

            await q(
                `UPDATE music_tips SET units = $2, artist_share_units = $3, ledger_ref = $4 WHERE id = $1`,
                [tipId, args.units, share, spend.entry.id],
            );
            return { ok: true, alreadyApplied: false, units: args.units, artistShareUnits: share };
        });
    } catch (err) {
        if (err instanceof SwypInsufficientFundsError) return { ok: false, reason: "insufficient_balance" };
        logger.error({ err }, "[music/tip] failed");
        throw err;
    }
}
