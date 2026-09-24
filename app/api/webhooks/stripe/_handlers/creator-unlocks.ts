import type Stripe from "stripe";
import { logger } from "@/lib/logger";
import { markMovieUnlockPaid } from "@/lib/movies/unlock";
import { markMusicUnlockPaid } from "@/lib/music/unlock";

/** `metadata.kind` values that this handler owns (routed from `route.ts`). */
export const CREATOR_UNLOCK_KINDS = new Set(["movie_unlock", "music_track_unlock", "music_album_unlock"]);

/**
 * `payment_intent.succeeded` pentru deblocările Movies/Music (card, RON).
 * Idempotent pe `payment_intent.id` — `markMovieUnlockPaid`/`markMusicUnlockPaid`
 * fac UPDATE ... WHERE status <> 'paid' și ies fără efect dacă rândul e deja plătit.
 */
export async function handleCreatorUnlockPaymentSucceeded(event: Stripe.Event): Promise<void> {
    const intent = event.data.object as Stripe.PaymentIntent;
    const kind = intent.metadata?.kind;
    logger.info({ intentId: intent.id, kind }, "[Stripe Webhook] creator unlock payment succeeded");
    if (kind === "movie_unlock") {
        await markMovieUnlockPaid(intent.id);
        return;
    }
    if (kind === "music_track_unlock" || kind === "music_album_unlock") {
        await markMusicUnlockPaid(intent.id);
        return;
    }
    logger.warn({ intentId: intent.id, kind }, "[Stripe Webhook] creator unlock handler invoked with unknown kind");
}
