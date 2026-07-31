/**
 * Anulări rezervări Stays + refund în wallet.
 *
 * Politica (STAYS_FREE_CANCEL_DAYS, default 5 zile înainte de check-in):
 *   - anulare de CLIENT cu ≥N zile înainte → refund 100%
 *   - anulare de CLIENT cu <N zile        → refund 50% (gazda păstrează 50%
 *     din partea ei; comisionul Swypik pe partea reținută rămâne)
 *   - anulare de GAZDĂ, oricând           → refund 100% client, gazda pierde
 *     tot (și e debitată cu ce primise)
 *
 * Contabilitate: refund client = credit wallet client; partea gazdei se
 * debitează corespunzător (idempotent pe refId derivat din bookingId).
 */
import { dbQuery } from "@/lib/db";
import { creditUser, debitUser } from "@/lib/wallet/ledger";
import { commissionPct } from "./booking";
import { logger } from "@/lib/logger";

export function freeCancelDays(): number {
    const v = Number(process.env.STAYS_FREE_CANCEL_DAYS ?? 5);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : 5;
}

type BookingRow = {
    id: string;
    product_id: string;
    guest_user_id: string | null;
    check_in: string;
    total_cents: number;
    status: string;
    payment_status: string;
    title: string;
    host_user_id: string | null;
};

async function loadBooking(bookingId: string): Promise<BookingRow | null> {
    const { rows } = await dbQuery<BookingRow>(
        `SELECT b.id::text, b.product_id::text, b.guest_user_id::text, b.check_in::text,
                b.total_cents, b.status, b.payment_status,
                p.title, p.metadata->>'host_user_id' AS host_user_id
           FROM stay_bookings b
           JOIN marketplace_products p ON p.id = b.product_id
          WHERE b.id = $1::uuid`,
        [bookingId],
    );
    return rows[0] ?? null;
}

export type CancelResult =
    | { ok: true; refundCents: number; refundPct: 100 | 50 | 0 }
    | { ok: false; error: string; status: number };

/**
 * Anulare de către client. `byUserId` trebuie să fie guest-ul rezervării.
 */
export async function cancelByGuest(bookingId: string, byUserId: string): Promise<CancelResult> {
    const b = await loadBooking(bookingId);
    if (!b || b.guest_user_id !== byUserId) return { ok: false, error: "Rezervare inexistentă.", status: 404 };
    if (b.status === "cancelled") return { ok: false, error: "Deja anulată.", status: 409 };
    if (b.status === "completed") return { ok: false, error: "Sejur încheiat — nu se poate anula.", status: 409 };
    if (new Date(b.check_in) <= new Date(new Date().toISOString().slice(0, 10))) {
        return { ok: false, error: "Check-in-ul a început — contactează gazda.", status: 409 };
    }

    // Anulare atomică: doar dacă statusul e încă pending/confirmed (anti-dublu-click).
    const upd = await dbQuery<{ id: string }>(
        `UPDATE stay_bookings SET status='cancelled'
          WHERE id=$1::uuid AND status IN ('pending','confirmed') RETURNING id::text`,
        [bookingId],
    );
    if (!upd.rows.length) return { ok: false, error: "Deja procesată.", status: 409 };

    // Nu s-a plătit → nimic de refundat.
    if (b.payment_status !== "paid") return { ok: true, refundCents: 0, refundPct: 0 };

    const daysBefore = Math.floor((new Date(b.check_in).getTime() - Date.now()) / 86400000);
    const refundPct: 100 | 50 = daysBefore >= freeCancelDays() ? 100 : 50;
    const refundCents = Math.round((b.total_cents * refundPct) / 100);

    // 1. Refund client (idempotent).
    if (b.guest_user_id && refundCents > 0) {
        await creditUser({
            userId: b.guest_user_id,
            amountCents: refundCents,
            refType: "stay_refund",
            refId: b.id,
            description: `Refund ${refundPct}%: ${b.title}`,
        });
    }

    // 2. Recuperare de la gazdă: primise total - comision; îi rămâne doar
    //    partea proporțională cu ce s-a reținut de la client.
    if (b.host_user_id) {
        const commission = Math.round((b.total_cents * commissionPct()) / 100);
        const hostReceived = b.total_cents - commission;
        const keptFromClient = b.total_cents - refundCents; // 0% sau 50%
        const hostKeeps = Math.round((hostReceived * keptFromClient) / b.total_cents);
        const clawback = hostReceived - hostKeeps;
        if (clawback > 0) {
            await debitUser({
                userId: b.host_user_id,
                amountCents: clawback,
                refType: "stay_refund_clawback",
                refId: b.id,
                description: `Anulare client (${refundPct}% refund): ${b.title}`,
                allowNegative: true, // gazda poate intra temporar pe minus
            }).catch((err) => {
                logger.error({ err, bookingId }, "stays cancel: clawback gazdă eșuat — de recuperat manual");
            });
        }
    }

    await dbQuery(`UPDATE stay_bookings SET payment_status='refunded' WHERE id=$1::uuid`, [bookingId]);
    logger.info({ bookingId, refundPct, refundCents }, "stay cancelled by guest");
    return { ok: true, refundCents, refundPct };
}

/**
 * Anulare de către gazdă → refund integral client, gazda pierde tot.
 */
export async function cancelByHost(bookingId: string, hostUserId: string): Promise<CancelResult> {
    const b = await loadBooking(bookingId);
    if (!b || b.host_user_id !== hostUserId) return { ok: false, error: "Rezervare inexistentă.", status: 404 };
    if (b.status === "cancelled") return { ok: false, error: "Deja anulată.", status: 409 };
    if (b.status === "completed") return { ok: false, error: "Sejur încheiat.", status: 409 };

    const upd = await dbQuery<{ id: string }>(
        `UPDATE stay_bookings SET status='cancelled'
          WHERE id=$1::uuid AND status IN ('pending','confirmed') RETURNING id::text`,
        [bookingId],
    );
    if (!upd.rows.length) return { ok: false, error: "Deja procesată.", status: 409 };

    if (b.payment_status !== "paid") return { ok: true, refundCents: 0, refundPct: 0 };

    if (b.guest_user_id) {
        await creditUser({
            userId: b.guest_user_id,
            amountCents: b.total_cents,
            refType: "stay_refund",
            refId: b.id,
            description: `Refund integral (anulare gazdă): ${b.title}`,
        });
    }
    const commission = Math.round((b.total_cents * commissionPct()) / 100);
    const hostReceived = b.total_cents - commission;
    if (hostReceived > 0) {
        await debitUser({
            userId: hostUserId,
            amountCents: hostReceived,
            refType: "stay_refund_clawback",
            refId: b.id,
            description: `Anulare de către tine: ${b.title}`,
            allowNegative: true,
        }).catch((err) => {
            logger.error({ err, bookingId }, "stays cancel(host): clawback eșuat — de recuperat manual");
        });
    }

    await dbQuery(`UPDATE stay_bookings SET payment_status='refunded' WHERE id=$1::uuid`, [bookingId]);
    logger.info({ bookingId }, "stay cancelled by host (full refund)");
    return { ok: true, refundCents: b.total_cents, refundPct: 100 };
}
