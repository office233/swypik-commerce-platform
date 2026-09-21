import { withTransaction, type TxQuery } from "@/lib/db";
import { swypTransferInTx, SwypInsufficientFundsError } from "@/lib/swyp/ledger";
import { platformShareUnits } from "@/lib/swyp/share";
import { logger } from "@/lib/logger";
import { MUSIC_ARTIST_SHARE_BPS } from "./config";
import { albumPriceUnits } from "./pricing";

export type UnlockResult =
    | { ok: true; alreadyApplied: boolean; unitsPaid: number; artistShareUnits: number }
    | { ok: false; reason: "not_found" | "not_premium" | "not_published" | "insufficient_balance" };

export function musicUnlockRefId(userId: string, target: { trackId: string } | { albumId: string }): string {
    return "trackId" in target
        ? `music_unlock:${userId}:track:${target.trackId}`
        : `music_unlock:${userId}:album:${target.albumId}`;
}

type UnlockTarget = { trackId: string; albumId: null } | { trackId: null; albumId: string };

/**
 * Mută banii și scrie rândul de unlock în ACEEAȘI tranzacție (tiparul Movies):
 *   1. INSERT music_unlocks … ON CONFLICT DO NOTHING — garda de idempotență;
 *   2. spend viewer → pool rewards (refId determinist ⇒ ledger-ul e idempotent);
 *   3. reward pool → artist (cota), sărit când e 0;
 *   4. UPDATE music_unlocks cu suma/cota/ref.
 * Sold insuficient ⇒ SwypInsufficientFundsError ⇒ ROLLBACK (rândul din 1 dispare).
 */
async function settle(
    q: TxQuery,
    args: { userId: string; artistUserId: string; target: UnlockTarget; amountUnits: number; refId: string },
): Promise<UnlockResult> {
    const { rows } = await q<{ id: string }>(
        `INSERT INTO music_unlocks (user_id, track_id, album_id, units_paid, artist_share_units)
         VALUES ($1, $2, $3, 0, 0)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [args.userId, args.target.trackId, args.target.albumId],
    );
    const unlockId = rows[0]?.id;
    if (!unlockId) return { ok: true, alreadyApplied: true, unitsPaid: 0, artistShareUnits: 0 };

    const spend = await swypTransferInTx(q, {
        from: { userId: args.userId },
        to: { pool: "rewards" },
        amountUnits: BigInt(args.amountUnits),
        kind: "spend",
        refType: "music_unlock",
        refId: args.refId,
        description: "Swypik Music unlock",
        metadata: { track_id: args.target.trackId, album_id: args.target.albumId },
    });

    const share = platformShareUnits(args.amountUnits, args.artistUserId, args.userId, MUSIC_ARTIST_SHARE_BPS);
    if (share > 0) {
        await swypTransferInTx(q, {
            from: { pool: "rewards" },
            to: { userId: args.artistUserId },
            amountUnits: BigInt(share),
            kind: "reward",
            refType: "music_artist_share",
            refId: args.refId,
            description: "Swypik Music artist share",
            metadata: { track_id: args.target.trackId, album_id: args.target.albumId, viewer_id: args.userId },
        });
    }

    await q(
        `UPDATE music_unlocks SET units_paid = $2, artist_share_units = $3, ledger_ref = $4 WHERE id = $1`,
        [unlockId, args.amountUnits, share, spend.entry.id],
    );
    return { ok: true, alreadyApplied: false, unitsPaid: args.amountUnits, artistShareUnits: share };
}

async function run(fn: (q: TxQuery) => Promise<UnlockResult>): Promise<UnlockResult> {
    try {
        return await withTransaction(fn);
    } catch (err) {
        if (err instanceof SwypInsufficientFundsError) return { ok: false, reason: "insufficient_balance" };
        logger.error({ err }, "[music/unlock] failed");
        throw err;
    }
}

export async function unlockTrack(args: { userId: string; trackId: string }): Promise<UnlockResult> {
    return run(async (q) => {
        const { rows } = await q<{ id: string; artist_user_id: string; status: string; is_premium: boolean; price_units: string | null; album_id: string | null }>(
            `SELECT t.id, t.artist_user_id, t.status, t.is_premium, t.price_units::text AS price_units, t.album_id
               FROM music_tracks t WHERE t.id = $1 FOR UPDATE`,
            [args.trackId],
        );
        const track = rows[0];
        if (!track) return { ok: false, reason: "not_found" };
        if (track.status !== "published") return { ok: false, reason: "not_published" };
        if (!track.is_premium) return { ok: false, reason: "not_premium" };
        const amount = Number(track.price_units ?? 0);
        if (amount === 0) return { ok: false, reason: "not_premium" };
        return settle(q, {
            userId: args.userId,
            artistUserId: track.artist_user_id,
            target: { trackId: args.trackId, albumId: null },
            amountUnits: amount,
            refId: musicUnlockRefId(args.userId, { trackId: args.trackId }),
        });
    });
}

export async function unlockAlbum(args: { userId: string; albumId: string }): Promise<UnlockResult> {
    return run(async (q) => {
        const { rows } = await q<{ id: string; artist_user_id: string; status: string; price_units: string | null }>(
            `SELECT al.id, al.artist_user_id, al.status, al.price_units::text AS price_units
               FROM music_albums al WHERE al.id = $1 FOR UPDATE`,
            [args.albumId],
        );
        const album = rows[0];
        if (!album) return { ok: false, reason: "not_found" };
        if (album.status !== "published") return { ok: false, reason: "not_published" };
        const { rows: tracks } = await q<{ is_premium: boolean; price_units: string | null }>(
            `SELECT is_premium, price_units::text AS price_units FROM music_tracks WHERE album_id = $1 AND status = 'published'`,
            [args.albumId],
        );
        const amount = albumPriceUnits(
            { price_units: album.price_units === null ? null : Number(album.price_units) },
            tracks.map((t) => ({ is_premium: t.is_premium, price_units: t.price_units === null ? null : Number(t.price_units) })),
        );
        if (amount === 0) return { ok: false, reason: "not_premium" };
        return settle(q, {
            userId: args.userId,
            artistUserId: album.artist_user_id,
            target: { trackId: null, albumId: args.albumId },
            amountUnits: amount,
            refId: musicUnlockRefId(args.userId, { albumId: args.albumId }),
        });
    });
}
