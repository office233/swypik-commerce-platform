/**
 * POST /api/payments/pi/cancel
 *
 * Called by the client's onCancel callback, or our own error handler, with
 * { paymentId }. Marks the local record cancelled and tells Pi to cancel.
 * Safe to call repeatedly.
 *
 * Note: if we have no row for this paymentId we DO NOT insert a synthetic
 * `amount_pi = 0, cancelled` row ??? that pollutes the table with stubs for
 * payments we never approved server-side (e.g. user cancelled before our
 * /approve was ever called). We still try to cancel at Pi so their side is
 * clean.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import { cancelPiPayment, isPiConfigured } from "@/lib/pi/platform-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = logger.child({ route: "/api/payments/pi/cancel" });

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
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId required" }, { status: 400 });
  }

  // Look up the local record (if any). We only mutate rows we already own;
  // we never INSERT a synthetic cancelled stub here.
  const { rows } = await dbQuery<{ status: string; user_id: string | null }>(
    `SELECT status, user_id FROM pi_payments WHERE payment_id = $1`,
    [paymentId],
  );
  const rec = rows[0];

  if (rec) {
    if (rec.user_id && rec.user_id !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (rec.status === "completed") {
      return NextResponse.json({ error: "Already completed" }, { status: 409 });
    }
    await dbQuery(
      `UPDATE pi_payments
          SET status='cancelled', cancelled_at=now(), updated_at=now()
        WHERE payment_id=$1`,
      [paymentId],
    );
  }

  // Always try to tell Pi, even if we have no local row ??? the user may have
  // been mid-flow before /approve ran.
  try {
    await cancelPiPayment(paymentId);
  } catch (err) {
    // Pi may already consider it cancelled; that's fine.
    log.warn({ err: String(err), paymentId }, "pi cancel returned error (ignored)");
  }

  return NextResponse.json({ ok: true });
}
