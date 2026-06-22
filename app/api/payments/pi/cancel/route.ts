/**
 * POST /api/payments/pi/cancel
 *
 * Called by the client's onCancel callback, or our own error handler, with
 * { paymentId }. Marks the local record cancelled and tells Pi to cancel.
 * Safe to call repeatedly.
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

  // Don't cancel an already-completed payment.
  const { rows } = await dbQuery<{ status: string; user_id: string | null }>(
    `SELECT status, user_id FROM pi_payments WHERE payment_id = $1`,
    [paymentId],
  );
  const rec = rows[0];
  if (rec && rec.user_id && rec.user_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (rec && rec.status === "completed") {
    return NextResponse.json({ error: "Already completed" }, { status: 409 });
  }

  await dbQuery(
    `INSERT INTO pi_payments (payment_id, user_id, amount_pi, status, cancelled_at)
     VALUES ($1, $2, 0, 'cancelled', now())
     ON CONFLICT (payment_id) DO UPDATE
        SET status='cancelled', cancelled_at=now(), updated_at=now()`,
    [paymentId, auth.userId],
  );

  try {
    await cancelPiPayment(paymentId);
  } catch (err) {
    // Pi may already consider it cancelled; that's fine.
    log.warn({ err: String(err), paymentId }, "pi cancel returned error (ignored)");
  }

  return NextResponse.json({ ok: true });
}
