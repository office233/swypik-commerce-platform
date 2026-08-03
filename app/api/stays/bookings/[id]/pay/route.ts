/**
 * POST /api/stays/bookings/[id]/pay — plătește rezervarea din wallet.
 *
 * Doar rezervarea proprie, doar status pending. Debit idempotent pe booking id;
 * la succes: confirmed/paid + credit gazdă (minus comision STAYS_COMMISSION_PCT).
 * Fonduri insuficiente → 402 (clientul poate alimenta wallet-ul și reveni).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { debitUser, creditUser, InsufficientFundsError } from "@/lib/wallet/ledger";
import { commissionPct } from "@/lib/stays/booking";
import { notifyHostNewBooking, notifyGuestBookingConfirmed } from "@/lib/stays/notifications";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getAuthSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;

    const { rows } = await dbQuery<{
        id: string; total_cents: number; status: string; payment_status: string;
        title: string; check_in: string; check_out: string; host_user_id: string | null;
    }>(
        `SELECT b.id::text, b.total_cents, b.status, b.payment_status,
                p.title, b.check_in::text, b.check_out::text,
                p.metadata->>'host_user_id' AS host_user_id
           FROM stay_bookings b
           JOIN marketplace_products p ON p.id = b.product_id
          WHERE b.id = $1::uuid AND b.guest_user_id = $2`,
        [id, session.userId],
    );
    const b = rows[0];
    if (!b) return NextResponse.json({ error: "Rezervare inexistentă" }, { status: 404 });
    if (b.payment_status === "paid") return NextResponse.json({ ok: true, alreadyPaid: true });
    if (b.status !== "pending") {
        return NextResponse.json({ error: `Rezervarea e ${b.status} — nu se mai poate plăti.` }, { status: 409 });
    }

    try {
        await debitUser({
            userId: session.userId,
            amountCents: b.total_cents,
            refType: "stay_booking",
            refId: b.id,
            description: `Cazare: ${b.title} (${b.check_in} → ${b.check_out})`,
        });
    } catch (err) {
        if (err instanceof InsufficientFundsError) {
            return NextResponse.json(
                { error: "Fonduri insuficiente în wallet.", code: "insufficient_funds" },
                { status: 402 },
            );
        }
        logger.error({ err, bookingId: b.id }, "stay pay: debit failed");
        return NextResponse.json({ error: "Plata a eșuat." }, { status: 500 });
    }

    // Guard concurență (audit extern 2026-08-03): două cereri paralele treceau
    // amândouă de check-ul de mai sus → dublu UPDATE + notificări duble.
    // Debit-ul e idempotent (ledger), deci e suficient să câștige un singur UPDATE.
    const upd = await dbQuery(
        `UPDATE stay_bookings SET status='confirmed', payment_status='paid'
          WHERE id=$1::uuid AND payment_status <> 'paid'`,
        [b.id],
    );
    if ((upd.rowCount ?? 0) === 0) {
        return NextResponse.json({ ok: true, alreadyPaid: true });
    }

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
            logger.error({ err, bookingId: b.id }, "stay pay: host credit failed (de reluat manual)");
            // P0 audit 2026-08-03: nu doar log — inregistram issue de reconciliere
            // ca banii gazdei sa nu se piarda tacut (cron reconcile-wallets alerteaza).
            await dbQuery(
                `INSERT INTO reconciliation_issues (kind, ref_id, details)
                 VALUES ('stay_host_credit_failed', $1, $2)
                 ON CONFLICT (kind, ref_id) WHERE resolved = false DO NOTHING`,
                [b.id, JSON.stringify({ host_user_id: b.host_user_id, amount_cents: b.total_cents - commission })],
            ).catch((e) => logger.error({ err: e }, "stay pay: reconciliation issue insert failed"));
        }
    }

    logger.info({ bookingId: b.id, totalCents: b.total_cents }, "stay booking paid (wallet)");

    // Notificări best-effort — nu blocăm răspunsul.
    void notifyHostNewBooking(b.id);
    void notifyGuestBookingConfirmed(b.id);

    return NextResponse.json({ ok: true, status: "confirmed" });
}
