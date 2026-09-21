import { withTransaction, type TxQuery } from "@/lib/db";
import { swypTransferInTx, SwypInsufficientFundsError } from "@/lib/swyp/ledger";
import { logger } from "@/lib/logger";
import { isFreeEpisode } from "./access";
import { creatorShareUnits, seasonPriceUnits } from "./pricing";
import type { MovieSeriesRow } from "./types";

export type UnlockResult =
    | { ok: true; alreadyApplied: boolean; unitsPaid: number; creatorShareUnits: number }
    | { ok: false; reason: "not_found" | "already_free" | "series_not_published" | "insufficient_balance" };

export function unlockRefId(userId: string, target: { episodeId: string } | { seriesId: string }): string {
    return "episodeId" in target
        ? `movie_unlock:${userId}:episode:${target.episodeId}`
        : `movie_unlock:${userId}:season:${target.seriesId}`;
}

type SeriesLite = Pick<MovieSeriesRow, "id" | "owner_user_id" | "status" | "free_episodes"> & { episode_price_units: string | number };

/**
 * Mută banii și scrie rândul de unlock în ACEEAȘI tranzacție:
 *   1. INSERT movie_unlocks … ON CONFLICT DO NOTHING — garda de idempotență (dublu-tap, retry);
 *   2. spend viewer → pool rewards (refId determinist ⇒ ledger-ul e și el idempotent);
 *   3. reward pool → creator (cota), sărit când e 0;
 *   4. UPDATE movie_unlocks cu suma/cota/ref.
 * Sold insuficient ⇒ SwypInsufficientFundsError ⇒ ROLLBACK (rândul din 1 dispare).
 */
async function settle(
    q: TxQuery,
    args: { userId: string; series: SeriesLite; episodeId: string | null; amountUnits: number; refId: string },
): Promise<UnlockResult> {
    const { rows } = await q<{ id: string }>(
        `INSERT INTO movie_unlocks (user_id, series_id, episode_id, units_paid, creator_share_units)
         VALUES ($1, $2, $3, 0, 0)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [args.userId, args.series.id, args.episodeId],
    );
    const unlockId = rows[0]?.id;
    if (!unlockId) return { ok: true, alreadyApplied: true, unitsPaid: 0, creatorShareUnits: 0 };

    const spend = await swypTransferInTx(q, {
        from: { userId: args.userId },
        to: { pool: "rewards" },
        amountUnits: BigInt(args.amountUnits),
        kind: "spend",
        refType: "movie_unlock",
        refId: args.refId,
        description: "Swypik Movies unlock",
        metadata: { series_id: args.series.id, episode_id: args.episodeId },
    });

    const share = creatorShareUnits(args.amountUnits, args.series.owner_user_id, args.userId);
    if (share > 0) {
        await swypTransferInTx(q, {
            from: { pool: "rewards" },
            to: { userId: args.series.owner_user_id },
            amountUnits: BigInt(share),
            kind: "reward",
            refType: "movie_creator_share",
            refId: args.refId,
            description: "Swypik Movies creator share",
            metadata: { series_id: args.series.id, episode_id: args.episodeId, viewer_id: args.userId },
        });
    }

    await q(
        `UPDATE movie_unlocks SET units_paid = $2, creator_share_units = $3, ledger_ref = $4 WHERE id = $1`,
        [unlockId, args.amountUnits, share, spend.entry.id],
    );
    return { ok: true, alreadyApplied: false, unitsPaid: args.amountUnits, creatorShareUnits: share };
}

async function run(fn: (q: TxQuery) => Promise<UnlockResult>): Promise<UnlockResult> {
    try {
        return await withTransaction(fn);
    } catch (err) {
        if (err instanceof SwypInsufficientFundsError) return { ok: false, reason: "insufficient_balance" };
        logger.error({ err }, "[movies/unlock] failed");
        throw err;
    }
}

export async function unlockEpisode(args: { userId: string; episodeId: string }): Promise<UnlockResult> {
    return run(async (q) => {
        const { rows } = await q<SeriesLite & { episode_number: number; series_id: string }>(
            `SELECT e.episode_number, e.series_id, s.id, s.owner_user_id, s.status, s.free_episodes, s.episode_price_units::text
               FROM movie_episodes e JOIN movie_series s ON s.id = e.series_id
              WHERE e.id = $1 AND e.status = 'published'`,
            [args.episodeId],
        );
        const row = rows[0];
        if (!row) return { ok: false, reason: "not_found" };
        if (row.status !== "published") return { ok: false, reason: "series_not_published" };
        if (isFreeEpisode(row, row)) return { ok: false, reason: "already_free" };
        return settle(q, {
            userId: args.userId,
            series: row,
            episodeId: args.episodeId,
            amountUnits: Number(row.episode_price_units),
            refId: unlockRefId(args.userId, { episodeId: args.episodeId }),
        });
    });
}

export async function unlockSeason(args: { userId: string; seriesId: string }): Promise<UnlockResult> {
    return run(async (q) => {
        const { rows } = await q<SeriesLite>(
            `SELECT id, owner_user_id, status, free_episodes, episode_price_units::text
               FROM movie_series WHERE id = $1 FOR UPDATE`,
            [args.seriesId],
        );
        const series = rows[0];
        if (!series) return { ok: false, reason: "not_found" };
        if (series.status !== "published") return { ok: false, reason: "series_not_published" };
        const { rows: cnt } = await q<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM movie_episodes WHERE series_id = $1 AND status = 'published'`,
            [args.seriesId],
        );
        const amount = seasonPriceUnits(
            { free_episodes: series.free_episodes, episode_price_units: Number(series.episode_price_units) },
            Number(cnt[0]?.count ?? 0),
        );
        if (amount === 0) return { ok: false, reason: "already_free" };
        return settle(q, {
            userId: args.userId,
            series,
            episodeId: null,
            amountUnits: amount,
            refId: unlockRefId(args.userId, { seriesId: args.seriesId }),
        });
    });
}
