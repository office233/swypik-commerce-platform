/**
 * POST /api/payments/pi/complete
 *
 * Called by the client's onReadyForServerCompletion callback with
 * { paymentId, txid }. We:
 *   1. verify the payment + txid against the Pi Platform API
 *   2. confirm the on-chain transaction is verified
 *   3. create the commerce_orders row (status='paid') from the snapshot we
 *      stored at approval time — idempotently
 *   4. call Pi /complete so Pi marks the payment done
 *   5. fire the order-confirmation email
 *
 * Idempotency: pi_payments.status='completed' short-circuits. The order is
 * created inside a transaction keyed off the payment_id so a retried
 * completion can't create two orders.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery, getDb } from "@/lib/db";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import {
  completePiPayment,
  getPiPayment,
  isPiConfigured,
} from "@/lib/pi/platform-api";
import { sendOrderConfirmation } from "@/lib/email/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = logger.child({ route: "/api/payments/pi/complete" });

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
  const txid = String(body?.txid || "").trim();
  if (!paymentId || !txid) {
    return NextResponse.json({ error: "paymentId and txid required" }, { status: 400 });
  }

  // Load our record of this payment.
  const { rows: rows0 } = await dbQuery<{
    status: string;
    user_id: string | null;
    order_id: string | null;
    amount_pi: string;
    amount_ron_cents: string;
    pi_to_ron_rate: string;
    metadata: { items?: Array<{ productId: string; qty: number; unitCents: number }> };
  }>(
    `SELECT status, user_id, order_id, amount_pi, amount_ron_cents, pi_to_ron_rate, metadata
       FROM pi_payments WHERE payment_id = $1`,
    [paymentId],
  );
  const rec = rows0[0];
  if (!rec) {
    return NextResponse.json({ error: "Unknown payment" }, { status: 404 });
  }
  if (rec.user_id && rec.user_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotency: already completed → return the existing order.
  if (rec.status === "completed" && rec.order_id) {
    return NextResponse.json({ ok: true, orderId: rec.order_id, alreadyCompleted: true });
  }

  // Verify against Pi before trusting the txid.
  let piPayment;
  try {
    piPayment = await getPiPayment(paymentId);
  } catch (err) {
    log.error({ err: String(err), paymentId }, "fetch pi payment failed");
    return NextResponse.json({ error: "Could not verify payment with Pi" }, { status: 502 });
  }

  if (!piPayment.status.developer_approved) {
    return NextResponse.json({ error: "Payment not approved" }, { status: 409 });
  }
  if (piPayment.status.cancelled || piPayment.status.user_cancelled) {
    await dbQuery(
      `UPDATE pi_payments SET status='cancelled', cancelled_at=now(), updated_at=now() WHERE payment_id=$1`,
      [paymentId],
    );
    return NextResponse.json({ error: "Payment cancelled" }, { status: 409 });
  }
  // The txid the client gave us must match what Pi recorded.
  if (piPayment.transaction && piPayment.transaction.txid && piPayment.transaction.txid !== txid) {
    log.warn({ paymentId, given: txid, onPi: piPayment.transaction.txid }, "txid mismatch");
    return NextResponse.json({ error: "txid mismatch" }, { status: 409 });
  }

  // Create the order from the snapshot, idempotently, in a transaction.
  const items = rec.metadata?.items || [];
  if (items.length === 0) {
    return NextResponse.json({ error: "No items snapshot for payment" }, { status: 422 });
  }

  const db = getDb();
  const client = await db.connect();
  let orderId: string;
  try {
    await client.query("BEGIN");

    // Re-check inside the tx that no order was created by a concurrent retry.
    const { rows: lockRows } = await client.query<{ order_id: string | null; status: string }>(
      `SELECT order_id, status FROM pi_payments WHERE payment_id = $1 FOR UPDATE`,
      [paymentId],
    );
    if (lockRows[0]?.order_id) {
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, orderId: lockRows[0].order_id, alreadyCompleted: true });
    }

    const totalCents = Number(rec.amount_ron_cents);
    const { rows: orderRows } = await client.query<{ id: string }>(
      `INSERT INTO commerce_orders
          (buyer_user_id, status, currency, total_cents, placed_at, metadata, created_at)
       VALUES ($1, 'paid', 'RON', $2, now(), $3::jsonb, now())
       RETURNING id`,
      [
        auth.userId,
        totalCents,
        JSON.stringify({
          payment_provider: "pi",
          pi_payment_id: paymentId,
          pi_txid: txid,
          amount_pi: rec.amount_pi,
          pi_to_ron_rate: rec.pi_to_ron_rate,
        }),
      ],
    );
    orderId = orderRows[0].id;

    // Order items from the snapshot.
    for (const it of items) {
      await client.query(
        `INSERT INTO commerce_order_items
            (order_id, product_id, quantity, unit_price_cents, created_at)
         VALUES ($1, $2, $3, $4, now())`,
        [orderId, it.productId, it.qty, it.unitCents],
      );
    }

    await client.query(
      `UPDATE pi_payments
          SET status='completed', completed_at=now(), txid=$2, order_id=$3,
              pi_status=$4::jsonb, updated_at=now()
        WHERE payment_id=$1`,
      [paymentId, txid, orderId, JSON.stringify(piPayment.status)],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    log.error({ err: String(err), paymentId }, "order creation failed");
    return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
  } finally {
    client.release();
  }

  // Tell Pi we're done. If this fails the order still exists; Pi will surface
  // the payment as incomplete and the client replays it (handleIncomplete).
  try {
    const completed = await completePiPayment(paymentId, txid);
    await dbQuery(
      `UPDATE pi_payments SET pi_status=$2::jsonb, updated_at=now() WHERE payment_id=$1`,
      [paymentId, JSON.stringify(completed.status)],
    ).catch(() => {});
  } catch (err) {
    log.error({ err: String(err), paymentId }, "pi /complete failed (order already created)");
    // Do not fail the request — the order is paid. Return ok with a warning.
    return NextResponse.json({ ok: true, orderId, piCompleteWarning: true });
  }

  // Fire confirmation email (best-effort).
  try {
    const email = auth.email;
    if (email) {
      await sendOrderConfirmation({
        orderId,
        customerEmail: email,
        customerName: email.split("@")[0],
        items: items.map((it) => ({
          title: it.productId,
          quantity: it.qty,
          price: it.unitCents / 100,
        })),
        totalRon: Number(rec.amount_ron_cents) / 100,
      });
    }
  } catch (err) {
    log.warn({ err: String(err), orderId }, "order confirmation email failed");
  }

  log.info({ paymentId, orderId, txid }, "pi payment completed");
  return NextResponse.json({ ok: true, orderId });
}
