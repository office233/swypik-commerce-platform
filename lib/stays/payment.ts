/**
 * Plata unei rezervări 'pending' → 'requested' (bani ținuți, gazda decide).
 *
 * Card (principal): PaymentIntent cu capture_method=manual — banii sunt doar
 *   autorizați; capture la acceptul gazdei, cancel la refuz/expirare. Clientul
 *   confirmă în Payment Element, apoi apelează confirm-card (sync verificat la
 *   Stripe); webhook-ul payment_intent.amount_capturable_updated e plasa de
 *   siguranță.
 * Wallet (secundar): suma se debitează acum și se rambursează la refuz.
 */
import type Stripe from "stripe";
import { dbQuery } from "@/lib/db";
import { getStripe } from "@/lib/stripe/checkout";
import { debitUser, creditUser, InsufficientFundsError } from "@/lib/wallet/ledger";
import { logger } from "@/lib/logger";
import type { Q } from "./booking";
import { loadBooking, type BookingRow } from "./bookings-repo";
import { staysConfig } from "./config";
import { StaysError } from "./errors";
import { voidCardHold } from "./money";
import { notifyHostNewRequest } from "./notifications";

const db: Q = (text, params) => dbQuery(text, params ?? []);

async function ownPendingBooking(bookingId: string, userId: string): Promise<BookingRow> {
    const b = await loadBooking(db, bookingId);
    if (!b || b.guest_user_id !== userId) throw new StaysError("not_found");
    if (b.status !== "pending" || (b.expires_at && Date.parse(b.expires_at) <= Date.now())) {
        throw new StaysError("bad_state");
    }
    return b;
}

/** pending → requested (o singură dată); notifică gazda. */
export async function markRequested(bookingId: string, method: "card" | "wallet"): Promise<boolean> {
    const { rows } = await dbQuery<{ id: string }>(
        `UPDATE stay_bookings
            SET status = 'requested', payment_status = 'authorized', payment_method = $2,
                requested_at = now(), updated_at = now(),
                expires_at = now() + ($3::int * interval '1 hour')
          WHERE id = $1::uuid AND status = 'pending'
          RETURNING id::text`,
        [bookingId, method, staysConfig.hostResponseTtlHours()],
    );
    if (!rows.length) return false;
    logger.info({ bookingId, method }, "stays: booking requested (payment held)");
    void notifyHostNewRequest(bookingId);
    return true;
}

const REUSABLE: Stripe.PaymentIntent.Status[] = ["requires_payment_method", "requires_confirmation", "requires_action"];

/** Creează (sau refolosește) hold-ul pe card. */
export async function startCardPayment(bookingId: string, userId: string): Promise<{ clientSecret: string; amountCents: number }> {
    const b = await ownPendingBooking(bookingId, userId);
    if (!Number.isInteger(b.total_cents) || b.total_cents < staysConfig.minCardAmountCents()) {
        throw new StaysError("amount_too_small");
    }
    if (!process.env.STRIPE_SECRET_KEY) throw new StaysError("card_unavailable");
    const stripe = getStripe();

    if (b.stripe_payment_intent_id) {
        const existing = await stripe.paymentIntents.retrieve(b.stripe_payment_intent_id).catch(() => null);
        if (existing && REUSABLE.includes(existing.status) && existing.amount === b.total_cents && existing.client_secret) {
            return { clientSecret: existing.client_secret, amountCents: b.total_cents };
        }
    }

    const intent = await stripe.paymentIntents.create(
        {
            amount: b.total_cents,
            currency: (b.currency || "RON").toLowerCase(),
            capture_method: "manual",
            payment_method_types: ["card"],
            metadata: { kind: "stay_booking", stay_booking_id: b.id, user_id: userId },
            description: `Swypik Stays ${b.id}`,
        },
        { idempotencyKey: `stay:${b.id}:authorize:${b.total_cents}` },
    );
    await dbQuery(
        `UPDATE stay_bookings SET stripe_payment_intent_id = $2, payment_method = 'card', updated_at = now()
          WHERE id = $1::uuid`,
        [b.id, intent.id],
    );
    if (!intent.client_secret) throw new StaysError("payment_failed");
    return { clientSecret: intent.client_secret, amountCents: b.total_cents };
}

/**
 * Verifică la Stripe că plata e autorizată și trece rezervarea în 'requested'.
 * Idempotent; apelat de client după confirmPayment și de webhook.
 * Dacă între timp rezervarea a expirat/anulat, hold-ul e eliberat.
 */
export async function syncCardAuthorization(bookingId: string, userId?: string): Promise<{ status: string }> {
    const b = await loadBooking(db, bookingId);
    if (!b || (userId && b.guest_user_id !== userId)) throw new StaysError("not_found");
    if (!b.stripe_payment_intent_id) throw new StaysError("payment_not_authorized");
    if (b.status === "requested" || b.status === "confirmed") return { status: b.status };

    const pi = await getStripe().paymentIntents.retrieve(b.stripe_payment_intent_id);
    if (pi.metadata?.stay_booking_id !== b.id || pi.status !== "requires_capture" || pi.amount !== b.total_cents) {
        throw new StaysError("payment_not_authorized");
    }
    if (b.status !== "pending" || !(await markRequested(b.id, "card"))) {
        // Autorizare venită după expirare/anulare: nu ținem banii clientului.
        await voidCardHold(b.id, pi.id).catch(() => undefined);
        throw new StaysError("bad_state");
    }
    return { status: "requested" };
}

/** Plata din wallet: debit acum, refund automat la refuz/expirare. */
export async function payWithWallet(bookingId: string, userId: string): Promise<{ status: string }> {
    const b = await ownPendingBooking(bookingId, userId);
    try {
        await debitUser({
            userId,
            amountCents: b.total_cents,
            refType: "stay_booking",
            refId: b.id,
            description: `stay_booking ${b.title}`,
        });
    } catch (err) {
        if (err instanceof InsufficientFundsError) throw new StaysError("insufficient_funds");
        logger.error({ err, bookingId }, "stays: wallet debit failed");
        throw new StaysError("payment_failed");
    }
    if (!(await markRequested(b.id, "wallet"))) {
        // A expirat între timp → banii înapoi (idempotent pe refId).
        await creditUser({
            userId,
            amountCents: b.total_cents,
            refType: "stay_refund",
            refId: b.id,
            description: `stay_refund ${b.title}`,
        });
        throw new StaysError("bad_state");
    }
    return { status: "requested" };
}
