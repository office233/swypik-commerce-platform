/**
 * FRONT R5 — Payout curier.
 *
 * POST /api/couriers/payouts { amount_cents, iban? } — cerere de retragere.
 *   Min. 50 RON (5000 cenți). Suma se DEBITEAZĂ imediat din wallet
 *   (ref 'payout:{id}') ca să nu poată fi cerută de două ori; la 'rejected'
 *   adminul recreditează (ref 'payout_refund:{id}').
 * GET — cererile proprii.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { debitUser, getBalanceCents, InsufficientFundsError } from "@/lib/wallet/ledger";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "couriers/payouts" });

const MIN_PAYOUT_CENTS = 5000; // 50 RON

export async function GET() {
  const session = await getAuthSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  }
  const { rows } = await dbQuery(
    `SELECT id, amount_cents::int8 AS amount_cents, currency, status, iban,
            admin_note, requested_at, resolved_at
       FROM payout_requests
      WHERE user_id = $1
      ORDER BY requested_at DESC
      LIMIT 50`,
    [session.userId],
  );
  return NextResponse.json({ payouts: rows });
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  }

  const { rows: courierRows } = await dbQuery<{ id: string }>(
    `SELECT id FROM couriers WHERE user_id = $1 AND verification_status = 'approved'`,
    [session.userId],
  );
  if (!courierRows[0]) {
    return NextResponse.json({ error: "Doar curierii aprobați pot cere payout." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const amount = Number(body?.amount_cents);
  const iban = typeof body?.iban === "string" ? body.iban.replace(/\s+/g, "").toUpperCase() : null;

  if (!Number.isInteger(amount) || amount < MIN_PAYOUT_CENTS) {
    return NextResponse.json(
      { error: `Suma minimă de retragere este ${MIN_PAYOUT_CENTS / 100} RON.` },
      { status: 400 },
    );
  }
  if (iban && !/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban)) {
    return NextResponse.json({ error: "IBAN invalid." }, { status: 400 });
  }

  // Cerere pending existentă → nu permitem alta în paralel.
  const { rows: pending } = await dbQuery(
    `SELECT id FROM payout_requests WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
    [session.userId],
  );
  if (pending[0]) {
    return NextResponse.json({ error: "Ai deja o cerere de retragere în așteptare." }, { status: 409 });
  }

  // Creăm cererea, apoi debităm soldul cu ref pe id-ul cererii (idempotent).
  const { rows: created } = await dbQuery<{ id: string }>(
    `INSERT INTO payout_requests (user_id, amount_cents, iban)
     VALUES ($1, $2, $3) RETURNING id`,
    [session.userId, amount, iban],
  );
  const payoutId = created[0].id;

  try {
    await debitUser({
      userId: session.userId,
      amountCents: amount,
      refType: "payout",
      refId: payoutId,
      description: `Cerere retragere ${amount / 100} RON`,
    });
  } catch (err) {
    // Sold insuficient → anulăm cererea (nu rămâne pending fără bani blocați).
    await dbQuery(
      `UPDATE payout_requests SET status = 'rejected', admin_note = 'sold insuficient', resolved_at = now(), resolved_by = 'system'
        WHERE id = $1`,
      [payoutId],
    );
    if (err instanceof InsufficientFundsError) {
      const balance = await getBalanceCents(session.userId);
      return NextResponse.json(
        { error: `Sold insuficient (${(balance / 100).toFixed(2)} RON disponibil).` },
        { status: 409 },
      );
    }
    log.error({ err, payoutId }, "payout debit failed");
    return NextResponse.json({ error: "Cererea a eșuat." }, { status: 500 });
  }

  return NextResponse.json({ success: true, payout_id: payoutId, status: "pending" });
}
