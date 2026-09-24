import { dbQuery } from "@/lib/db";
import { getStripe } from "@/lib/stripe/checkout";
import { creditUser } from "@/lib/wallet/ledger";
import { logger } from "@/lib/logger";
import { artistShareCents, albumPriceCents } from "./pricing";

export type UnlockIntentResult =
    | { ok: true; alreadyUnlocked: true }
    | { ok: true; alreadyUnlocked: false; clientSecret: string; amountCents: number }
    | { ok: false; reason: "not_found" | "not_premium" | "not_published" | "price_not_set" };

export function musicUnlockRefId(userId: string, target: { trackId: string } | { albumId: string }): string {
    return "trackId" in target
        ? `music_unlock:${userId}:track:${target.trackId}`
        : `music_unlock:${userId}:album:${target.albumId}`;
}

type PendingUnlockRow = { id: string; status: string };

async function upsertPendingTrackUnlock(userId: string, trackId: string, amountCents: number): Promise<PendingUnlockRow> {
    const { rows } = await dbQuery<PendingUnlockRow>(
        `INSERT INTO music_unlocks (user_id, track_id, album_id, units_paid, artist_share_units, amount_cents, currency, status)
         VALUES ($1, $2, NULL, 0, 0, $3, 'RON', 'pending')
         ON CONFLICT (user_id, track_id) WHERE track_id IS NOT NULL
         DO UPDATE SET amount_cents = EXCLUDED.amount_cents
         RETURNING id, status`,
        [userId, trackId, amountCents],
    );
    return rows[0];
}

async function upsertPendingAlbumUnlock(userId: string, albumId: string, amountCents: number): Promise<PendingUnlockRow> {
    const { rows } = await dbQuery<PendingUnlockRow>(
        `INSERT INTO music_unlocks (user_id, track_id, album_id, units_paid, artist_share_units, amount_cents, currency, status)
         VALUES ($1, NULL, $2, 0, 0, $3, 'RON', 'pending')
         ON CONFLICT (user_id, album_id) WHERE album_id IS NOT NULL
         DO UPDATE SET amount_cents = EXCLUDED.amount_cents
         RETURNING id, status`,
        [userId, albumId, amountCents],
    );
    return rows[0];
}

async function createIntentForUnlock(args: {
    unlockId: string;
    amountCents: number;
    userId: string;
    kind: "music_track_unlock" | "music_album_unlock";
    trackId: string | null;
    albumId: string | null;
}): Promise<string> {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create(
        {
            amount: args.amountCents,
            currency: "ron",
            automatic_payment_methods: { enabled: true },
            metadata: {
                kind: args.kind,
                trackId: args.trackId ?? "",
                albumId: args.albumId ?? "",
                userId: args.userId,
                unlockId: args.unlockId,
            },
        },
        { idempotencyKey: `music_unlock_pi:${args.unlockId}` },
    );
    await dbQuery(
        `UPDATE music_unlocks SET payment_intent_id = $2, amount_cents = $3, status = 'pending' WHERE id = $1 AND status <> 'paid'`,
        [args.unlockId, intent.id, args.amountCents],
    );
    if (!intent.client_secret) throw new Error("stripe_intent_missing_client_secret");
    return intent.client_secret;
}

export async function createTrackUnlockIntent(args: { userId: string; trackId: string }): Promise<UnlockIntentResult> {
    const { rows } = await dbQuery<{ id: string; artist_user_id: string; status: string; is_premium: boolean; price_cents: string | number | null }>(
        `SELECT t.id, t.artist_user_id, t.status, t.is_premium, t.price_cents::text AS price_cents FROM music_tracks t WHERE t.id = $1`,
        [args.trackId],
    );
    const track = rows[0];
    if (!track) return { ok: false, reason: "not_found" };
    if (track.status !== "published") return { ok: false, reason: "not_published" };
    if (!track.is_premium) return { ok: false, reason: "not_premium" };
    const amountCents = track.price_cents === null ? null : Number(track.price_cents);
    if (amountCents === null) return { ok: false, reason: "price_not_set" };

    const pending = await upsertPendingTrackUnlock(args.userId, args.trackId, amountCents);
    if (pending.status === "paid") return { ok: true, alreadyUnlocked: true };

    const clientSecret = await createIntentForUnlock({
        unlockId: pending.id,
        amountCents,
        userId: args.userId,
        kind: "music_track_unlock",
        trackId: args.trackId,
        albumId: null,
    });
    return { ok: true, alreadyUnlocked: false, clientSecret, amountCents };
}

export async function createAlbumUnlockIntent(args: { userId: string; albumId: string }): Promise<UnlockIntentResult> {
    const { rows } = await dbQuery<{ id: string; artist_user_id: string; status: string; price_cents: string | number | null }>(
        `SELECT al.id, al.artist_user_id, al.status, al.price_cents::text AS price_cents FROM music_albums al WHERE al.id = $1`,
        [args.albumId],
    );
    const album = rows[0];
    if (!album) return { ok: false, reason: "not_found" };
    if (album.status !== "published") return { ok: false, reason: "not_published" };

    const { rows: tracks } = await dbQuery<{ is_premium: boolean; price_cents: string | number | null }>(
        `SELECT is_premium, price_cents::text AS price_cents FROM music_tracks WHERE album_id = $1 AND status = 'published'`,
        [args.albumId],
    );
    const amountCents = albumPriceCents(
        { price_cents: album.price_cents === null ? null : Number(album.price_cents) },
        tracks.map((t) => ({ is_premium: t.is_premium, price_cents: t.price_cents === null ? null : Number(t.price_cents) })),
    );
    if (amountCents === null) return { ok: false, reason: "price_not_set" };
    if (amountCents === 0) return { ok: false, reason: "not_premium" };

    const pending = await upsertPendingAlbumUnlock(args.userId, args.albumId, amountCents);
    if (pending.status === "paid") return { ok: true, alreadyUnlocked: true };

    const clientSecret = await createIntentForUnlock({
        unlockId: pending.id,
        amountCents,
        userId: args.userId,
        kind: "music_album_unlock",
        trackId: null,
        albumId: args.albumId,
    });
    return { ok: true, alreadyUnlocked: false, clientSecret, amountCents };
}

/**
 * Webhook `payment_intent.succeeded` (kind `music_track_unlock`/`music_album_unlock`):
 * marchează deblocarea plătită (idempotent — no-op dacă rândul e deja `paid`
 * sau `payment_intent_id` nu se mai potrivește niciunui rând) și creditează
 * cota artistului în cenți RON pe `lib/wallet/ledger.ts` (idempotent după
 * `refType`+`refId`=id-ul rândului de unlock).
 */
export async function markMusicUnlockPaid(paymentIntentId: string): Promise<void> {
    const { rows } = await dbQuery<{
        id: string;
        user_id: string;
        track_id: string | null;
        album_id: string | null;
        amount_cents: string | null;
        artist_user_id: string;
    }>(
        `UPDATE music_unlocks u
            SET status = 'paid'
           FROM (
                SELECT id, artist_user_id FROM music_tracks
                UNION ALL
                SELECT id, artist_user_id FROM music_albums
            ) owner(id, artist_user_id)
          WHERE owner.id = COALESCE(u.track_id, u.album_id) AND u.payment_intent_id = $1 AND u.status <> 'paid'
          RETURNING u.id, u.user_id, u.track_id, u.album_id, u.amount_cents::text AS amount_cents, owner.artist_user_id`,
        [paymentIntentId],
    );
    const row = rows[0];
    if (!row) return; // deja procesat (retry Stripe) sau intent necunoscut

    const amountCents = Number(row.amount_cents ?? 0);
    const share = artistShareCents(amountCents, row.artist_user_id, row.user_id);
    await dbQuery(`UPDATE music_unlocks SET units_paid = $2, artist_share_units = $3 WHERE id = $1`, [row.id, amountCents, share]);

    if (share > 0) {
        await creditUser({
            userId: row.artist_user_id,
            amountCents: share,
            refType: "music_artist_share",
            refId: row.id,
            description: "Swypik Music — cotă artist",
            metadata: { trackId: row.track_id, albumId: row.album_id },
        }).catch((err) => logger.error({ err, unlockId: row.id }, "[music/unlock] artist share credit failed"));
    }
}
