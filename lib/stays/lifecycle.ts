/**
 * Job-ul periodic Stays (/api/cron/stays-lifecycle, la 5 minute):
 *  1. 'pending' expirate (neplătite la timp) → 'expired' (+ anulare PI rămas)
 *  2. 'requested' fără răspuns de la gazdă → 'expired' + hold eliberat
 *  3. 'confirmed' cu check-out trecut → 'completed'
 * Fiecare tranziție e atomică pe rând (UPDATE … RETURNING), deci rularea e
 * idempotentă și sigură la suprapuneri.
 */
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { Q } from "./booking";
import { loadBooking } from "./bookings-repo";
import { releaseHold, voidCardHold } from "./money";
import { notifyGuestDeclined } from "./notifications";

const db: Q = (text, params) => dbQuery(text, params ?? []);
const BATCH = 200;

export type LifecycleResult = { expiredPending: number; expiredRequests: number; completed: number; errors: number };

export async function runStaysLifecycle(): Promise<LifecycleResult> {
    const result: LifecycleResult = { expiredPending: 0, expiredRequests: 0, completed: 0, errors: 0 };

    const pending = await dbQuery<{ id: string; stripe_payment_intent_id: string | null }>(
        `UPDATE stay_bookings SET status = 'expired', updated_at = now()
          WHERE id IN (SELECT id FROM stay_bookings
                        WHERE status = 'pending' AND expires_at <= now()
                        ORDER BY expires_at LIMIT ${BATCH})
            AND status = 'pending'
          RETURNING id::text, stripe_payment_intent_id`,
    );
    result.expiredPending = pending.rows.length;
    for (const r of pending.rows) {
        await voidCardHold(r.id, r.stripe_payment_intent_id).catch(() => {
            result.errors++;
        });
    }

    const requests = await dbQuery<{ id: string }>(
        `UPDATE stay_bookings SET status = 'expired', updated_at = now()
          WHERE id IN (SELECT id FROM stay_bookings
                        WHERE status = 'requested' AND decided_at IS NULL AND expires_at <= now()
                        ORDER BY expires_at LIMIT ${BATCH})
            AND status = 'requested' AND decided_at IS NULL
          RETURNING id::text`,
    );
    for (const r of requests.rows) {
        try {
            const b = await loadBooking(db, r.id);
            if (!b) continue;
            const released = await releaseHold(b);
            await dbQuery(
                `UPDATE stay_bookings SET payment_status = $2, refund_cents = $3, updated_at = now() WHERE id = $1::uuid`,
                [b.id, released.paymentStatus, released.refundCents],
            );
            void notifyGuestDeclined(b.id, "expired");
            result.expiredRequests++;
        } catch (err) {
            result.errors++;
            logger.error({ err, bookingId: r.id }, "stays lifecycle: release after host timeout failed");
        }
    }

    const done = await dbQuery<{ id: string }>(
        `UPDATE stay_bookings SET status = 'completed', completed_at = now(), updated_at = now()
          WHERE status = 'confirmed' AND check_out <= CURRENT_DATE
          RETURNING id::text`,
    );
    result.completed = done.rows.length;

    if (result.expiredPending || result.expiredRequests || result.completed || result.errors) {
        logger.info(result, "stays lifecycle run");
    }
    return result;
}
