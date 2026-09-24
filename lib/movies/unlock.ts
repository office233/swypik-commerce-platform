import { dbQuery } from "@/lib/db";
import { getStripe } from "@/lib/stripe/checkout";
import { creditUser } from "@/lib/wallet/ledger";
import { logger } from "@/lib/logger";
import { isFreeEpisode } from "./access";
import { creatorShareCents, seasonPriceCents } from "./pricing";

export type UnlockIntentResult =
    | { ok: true; alreadyUnlocked: true }
    | { ok: true; alreadyUnlocked: false; clientSecret: string; amountCents: number }
    | { ok: false; reason: "not_found" | "already_free" | "series_not_published" | "price_not_set" };

export function unlockRefId(userId: string, target: { episodeId: string } | { seriesId: string }): string {
    return "episodeId" in target
        ? `movie_unlock:${userId}:episode:${target.episodeId}`
        : `movie_unlock:${userId}:season:${target.seriesId}`;
}

type PendingUnlockRow = { id: string; status: string };

async function upsertPendingEpisodeUnlock(userId: string, seriesId: string, episodeId: string, amountCents: number): Promise<PendingUnlockRow> {
    const { rows } = await dbQuery<PendingUnlockRow>(
        `INSERT INTO movie_unlocks (user_id, series_id, episode_id, units_paid, creator_share_units, amount_cents, currency, status)
         VALUES ($1, $2, $3, 0, 0, $4, 'RON', 'pending')
         ON CONFLICT (user_id, episode_id) WHERE episode_id IS NOT NULL
         DO UPDATE SET amount_cents = EXCLUDED.amount_cents
         RETURNING id, status`,
        [userId, seriesId, episodeId, amountCents],
    );
    return rows[0];
}

async function upsertPendingSeasonUnlock(userId: string, seriesId: string, amountCents: number): Promise<PendingUnlockRow> {
    const { rows } = await dbQuery<PendingUnlockRow>(
        `INSERT INTO movie_unlocks (user_id, series_id, episode_id, units_paid, creator_share_units, amount_cents, currency, status)
         VALUES ($1, $2, NULL, 0, 0, $3, 'RON', 'pending')
         ON CONFLICT (user_id, series_id) WHERE episode_id IS NULL
         DO UPDATE SET amount_cents = EXCLUDED.amount_cents
         RETURNING id, status`,
        [userId, seriesId, amountCents],
    );
    return rows[0];
}

async function createIntentForUnlock(args: {
    unlockId: string;
    amountCents: number;
    seriesId: string;
    episodeId: string | null;
    userId: string;
    kindMetadata: Record<string, string>;
}): Promise<string> {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create(
        {
            amount: args.amountCents,
            currency: "ron",
            automatic_payment_methods: { enabled: true },
            metadata: {
                kind: "movie_unlock",
                seriesId: args.seriesId,
                episodeId: args.episodeId ?? "",
                userId: args.userId,
                unlockId: args.unlockId,
                ...args.kindMetadata,
            },
        },
        { idempotencyKey: `movie_unlock_pi:${args.unlockId}` },
    );
    await dbQuery(
        `UPDATE movie_unlocks SET payment_intent_id = $2, amount_cents = $3, status = 'pending' WHERE id = $1 AND status <> 'paid'`,
        [args.unlockId, intent.id, args.amountCents],
    );
    if (!intent.client_secret) throw new Error("stripe_intent_missing_client_secret");
    return intent.client_secret;
}

export async function createEpisodeUnlockIntent(args: { userId: string; episodeId: string }): Promise<UnlockIntentResult> {
    const { rows } = await dbQuery<{
        episode_number: number;
        series_id: string;
        id: string;
        owner_user_id: string;
        status: string;
        free_episodes: number;
        episode_price_cents: string | number | null;
    }>(
        `SELECT e.episode_number, e.series_id, s.id, s.owner_user_id, s.status, s.free_episodes, s.episode_price_cents::text AS episode_price_cents
           FROM movie_episodes e JOIN movie_series s ON s.id = e.series_id
          WHERE e.id = $1 AND e.status = 'published'`,
        [args.episodeId],
    );
    const row = rows[0];
    if (!row) return { ok: false, reason: "not_found" };
    if (row.status !== "published") return { ok: false, reason: "series_not_published" };
    if (isFreeEpisode(row, row)) return { ok: false, reason: "already_free" };
    const amountCents = row.episode_price_cents === null ? null : Number(row.episode_price_cents);
    if (amountCents === null) return { ok: false, reason: "price_not_set" };

    const pending = await upsertPendingEpisodeUnlock(args.userId, row.series_id, args.episodeId, amountCents);
    if (pending.status === "paid") return { ok: true, alreadyUnlocked: true };

    try {
        const clientSecret = await createIntentForUnlock({
            unlockId: pending.id,
            amountCents,
            seriesId: row.series_id,
            episodeId: args.episodeId,
            userId: args.userId,
            kindMetadata: {},
        });
        return { ok: true, alreadyUnlocked: false, clientSecret, amountCents };
    } catch (err) {
        logger.error({ err, episodeId: args.episodeId, userId: args.userId }, "[movies/unlock] failed to create Stripe intent");
        throw err;
    }
}

export async function createSeasonUnlockIntent(args: { userId: string; seriesId: string }): Promise<UnlockIntentResult> {
    const { rows } = await dbQuery<{ id: string; owner_user_id: string; status: string; free_episodes: number; episode_price_cents: string | number | null }>(
        `SELECT id, owner_user_id, status, free_episodes, episode_price_cents::text AS episode_price_cents FROM movie_series WHERE id = $1`,
        [args.seriesId],
    );
    const series = rows[0];
    if (!series) return { ok: false, reason: "not_found" };
    if (series.status !== "published") return { ok: false, reason: "series_not_published" };

    const { rows: cnt } = await dbQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM movie_episodes WHERE series_id = $1 AND status = 'published'`,
        [args.seriesId],
    );
    const priceCents = series.episode_price_cents === null ? null : Number(series.episode_price_cents);
    const amountCents = seasonPriceCents({ free_episodes: series.free_episodes, episode_price_cents: priceCents }, Number(cnt[0]?.count ?? 0));
    if (amountCents === null) return { ok: false, reason: "price_not_set" };
    if (amountCents === 0) return { ok: false, reason: "already_free" };

    const pending = await upsertPendingSeasonUnlock(args.userId, args.seriesId, amountCents);
    if (pending.status === "paid") return { ok: true, alreadyUnlocked: true };

    try {
        const clientSecret = await createIntentForUnlock({
            unlockId: pending.id,
            amountCents,
            seriesId: args.seriesId,
            episodeId: null,
            userId: args.userId,
            kindMetadata: {},
        });
        return { ok: true, alreadyUnlocked: false, clientSecret, amountCents };
    } catch (err) {
        logger.error({ err, seriesId: args.seriesId, userId: args.userId }, "[movies/unlock] failed to create Stripe intent");
        throw err;
    }
}

/**
 * Webhook `payment_intent.succeeded` (kind `movie_unlock`): marchează
 * deblocarea plătită (idempotent — no-op dacă rândul e deja `paid` sau
 * `payment_intent_id` nu se mai potrivește niciunui rând) și creditează cota
 * creatorului în cenți RON pe `lib/wallet/ledger.ts` (idempotent după
 * `refType`+`refId`=id-ul rândului de unlock).
 */
export async function markMovieUnlockPaid(paymentIntentId: string): Promise<void> {
    const { rows } = await dbQuery<{
        id: string;
        user_id: string;
        series_id: string;
        episode_id: string | null;
        amount_cents: string | null;
        owner_user_id: string;
    }>(
        `UPDATE movie_unlocks u
            SET status = 'paid'
           FROM movie_series s
          WHERE u.series_id = s.id AND u.payment_intent_id = $1 AND u.status <> 'paid'
          RETURNING u.id, u.user_id, u.series_id, u.episode_id, u.amount_cents::text AS amount_cents, s.owner_user_id`,
        [paymentIntentId],
    );
    const row = rows[0];
    if (!row) return; // deja procesat (retry Stripe) sau intent necunoscut

    const amountCents = Number(row.amount_cents ?? 0);
    const share = creatorShareCents(amountCents, row.owner_user_id, row.user_id);
    await dbQuery(`UPDATE movie_unlocks SET units_paid = $2, creator_share_units = $3 WHERE id = $1`, [row.id, amountCents, share]);

    if (share > 0) {
        await creditUser({
            userId: row.owner_user_id,
            amountCents: share,
            refType: "movie_creator_share",
            refId: row.id,
            description: "Swypik Movies — cotă creator",
            metadata: { seriesId: row.series_id, episodeId: row.episode_id },
        }).catch((err) => logger.error({ err, unlockId: row.id }, "[movies/unlock] creator share credit failed"));
    }
}
