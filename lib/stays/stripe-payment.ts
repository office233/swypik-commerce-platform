/**
 * Confirmarea rezervării de cazare după plata cu CARDUL (webhook Stripe).
 * Oglindește logica din /api/stays/bookings/[id]/pay (wallet), dar fără debit
 * de wallet — banii au venit prin Stripe.
 * Idempotent: dacă payment_status e deja 'paid', nu face nimic.
 */
import { dbQuery } from "@/lib/db";
import { creditUser } from "@/lib/wallet/ledger";
import { commissionPct } from "@/lib/stays/booking";
import { notifyHostNewBooking, notifyGuestBookingConfirmed } from "@/lib/stays/notifications";
import { logger } from "@/lib/logger";

export async function markStayBookingPaidByCard(bookingId: string): Promise<void> {
  const { rows } = await dbQuery<{
    id: string;
    total_cents: number;
    payment_status: string;
    status: string;
    host_user_id: string | null;
    title: string;
  }>(
    `SELECT b.id::text, b.total_cents, b.payment_status, b.status,
            p.host_user_id, p.title
       FROM stay_bookings b
       JOIN marketplace_products p ON p.id = b.product_id
      WHERE b.id = $1::uuid
      FOR UPDATE OF b`,
    [bookingId],
  );
  const b = rows[0];
  if (!b) {
    logger.error({ bookingId }, "stay webhook: booking inexistent");
    return;
  }
  if (b.payment_status === "paid") return; // idempotent

  await dbQuery(
    `UPDATE stay_bookings SET status='confirmed', payment_status='paid' WHERE id=$1::uuid`,
    [b.id],
  );

  if (b.host_user_id) {
    const commission = Math.round((b.total_cents * commissionPct()) / 100);
    try {
      await creditUser({
        userId: b.host_user_id,
        amountCents: b.total_cents - commission,
        refType: "stay_payout",
        refId: b.id,
        description: `Încasare cazare: ${b.title} (comision ${commissionPct()}%)`,
      });
    } catch (err) {
      logger.error({ err, bookingId: b.id }, "stay webhook: host credit failed (de reluat manual)");
    }
  }

  logger.info({ bookingId: b.id, totalCents: b.total_cents }, "stay booking paid (card)");
  void notifyHostNewBooking(b.id);
  void notifyGuestBookingConfirmed(b.id);
}

export async function markStayBookingCardFailed(bookingId: string): Promise<void> {
  await dbQuery(
    `UPDATE stay_bookings SET payment_status='failed'
      WHERE id=$1::uuid AND payment_status <> 'paid'`,
    [bookingId],
  );
}
