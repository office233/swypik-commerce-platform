/**
 * POST /api/payments/pi/approve
 *
 * Called by the client's onReadyForServerApproval callback with { paymentId }.
 * We:
 *   1. fetch the payment from the Pi Platform API
 *   2. re-derive the expected Pi amount from the cart server-side and verify
 *      it matches what the user is about to pay (anti-tamper)
 *   3. persist a pi_payments row (status='approved')
 *   4. call Pi /approve so the user can proceed to sign in their wallet
 *
 * Security: the client never dictates the price. The amount the user signs is
 * fixed by Pi.createPayment on the client, but we still cross-check it here
 * against the authoritative cart total; if it doesn't match we refuse to
 * approve, so a tampered client can't get us to greenlight an underpayment.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import {
  approvePiPayment,
  getPiPayment,
  isPiConfigured,
} from "@/lib/pi/platform-api";
import { computePiCartQuote } from "@/lib/pi/quote";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = logger.child({ route: "/api/payments/pi/approve" });

// Pi amounts are floating; allow a tiny tolerance for rounding when comparing.
const AMOUNT_TOLERANCE_PI = 0.0000001;

export async function POST(req: Request) {
  if (!isPiConfigured()) {
    return NextResponse.json({ error: "Pi payments not configured" }, { status: 503 });
  }

  const ip = getClientIP(req);
  const { success } = await rateLimit("checkout", ip);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const auth = await getAuthUser();
  if (!auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const paymentId = String(body?.paymentId || "").trim();
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId required" }, { status: 400 });
  }

  let piPayment;
  try {
    piPayment = await getPiPayment(paymentId);
  } catch (err) {
    log.error({ err: String(err), paymentId }, "fetch pi payment failed");
    return NextResponse.json({ error: "Could not verify payment with Pi" }, { status: 502 });
  }

  // Re-derive the authoritative amount from the cart server-side.
  let quote;
  try {
    quote = await computePiCartQuote(items);
  } catch (err) {
    log.error({ err: String(err) }, "cart quote failed");
    return NextResponse.json({ error: "Invalid cart" }, { status: 400 });
  }

  if (Math.abs(piPayment.amount - quote.amountPi) > AMOUNT_TOLERANCE_PI) {
    log.warn(
      { paymentId, piAmount: piPayment.amount, expected: quote.amountPi },
      "pi amount mismatch — refusing approval",
    );
    return NextResponse.json({ error: "Payment amount mismatch" }, { status: 409 });
  }

  // Persist before approving so we never approve something we didn't record.
  await dbQuery(
    `INSERT INTO pi_payments
        (payment_id, user_id, pi_uid, amount_pi, amount_ron_cents, pi_to_ron_rate, memo, metadata, status, pi_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'pending',$9::jsonb)
     ON CONFLICT (payment_id) DO UPDATE
        SET amount_pi = EXCLUDED.amount_pi,
            amount_ron_cents = EXCLUDED.amount_ron_cents,
            pi_to_ron_rate = EXCLUDED.pi_to_ron_rate,
            updated_at = now()`,
    [
      paymentId,
      auth.userId,
      piPayment.user_uid,
      piPayment.amount,
      quote.amountRonCents,
      quote.piToRonRate,
      piPayment.memo || "Swypik order",
      JSON.stringify({ items: quote.normalizedItems }),
      JSON.stringify(piPayment.status),
    ],
  );

  try {
    const approved = await approvePiPayment(paymentId);
    await dbQuery(
      `UPDATE pi_payments
          SET status='approved', approved_at=now(), pi_status=$2::jsonb, updated_at=now()
        WHERE payment_id=$1`,
      [paymentId, JSON.stringify(approved.status)],
    );
    log.info({ paymentId, userId: auth.userId }, "pi payment approved");
    return NextResponse.json({ ok: true });
  } catch (err) {
    await dbQuery(
      `UPDATE pi_payments SET status='error', updated_at=now() WHERE payment_id=$1`,
      [paymentId],
    ).catch(() => {});
    log.error({ err: String(err), paymentId }, "pi approve failed");
    return NextResponse.json({ error: "Approval failed" }, { status: 502 });
  }
}
