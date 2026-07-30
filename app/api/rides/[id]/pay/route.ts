/**
 * FRONT R5 — Plata unei curse.
 *
 * POST /api/rides/[id]/pay
 *   { action: "authorize" }        — rider, card: creează pre-autorizarea Stripe
 *                                    → { client_secret } pentru confirmare în UI.
 *   { action: "collect_cash" }     — driver, cash: marchează banii încasați
 *                                    (doar pe cursă 'completed').
 *
 * GET — starea plății (rider/driver/admin).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { loadRide, resolveRole } from "@/lib/rides/service";
import { authorizeRidePayment } from "@/lib/payments/mobility-stripe";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "rides/pay" });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  }
  const ride = await loadRide(id);
  if (!ride) return NextResponse.json({ error: "Cursa nu există." }, { status: 404 });

  const user = await getAuthUser();
  const role = await resolveRole(ride, session.userId, user?.role === "admin");
  if (!role) return NextResponse.json({ error: "Nu ai acces la această cursă." }, { status: 403 });

  const { rows } = await dbQuery(
    `SELECT payment_method, payment_status, tip_cents, final_fare_cents, estimated_fare_cents, settled_at
       FROM rides WHERE id = $1`,
    [id],
  );
  return NextResponse.json({ payment: rows[0] ?? null });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "authorize" && action !== "collect_cash") {
    return NextResponse.json({ error: "action invalid (authorize | collect_cash)." }, { status: 400 });
  }

  const ride = await loadRide(id);
  if (!ride) return NextResponse.json({ error: "Cursa nu există." }, { status: 404 });

  const user = await getAuthUser();
  const role = await resolveRole(ride, session.userId, user?.role === "admin");
  if (!role) return NextResponse.json({ error: "Nu ai acces la această cursă." }, { status: 403 });

  try {
    if (action === "authorize") {
      if (role !== "rider" && role !== "admin") {
        return NextResponse.json({ error: "Doar pasagerul poate autoriza plata." }, { status: 403 });
      }
      const result = await authorizeRidePayment(id);
      if (!result) return NextResponse.json({ error: "Pre-autorizarea a eșuat." }, { status: 409 });
      return NextResponse.json({
        payment_intent_id: result.payment_intent_id,
        client_secret: result.client_secret,
        amount_cents: result.amount_cents,
      });
    }

    // collect_cash — șoferul confirmă încasarea cash pe cursa finalizată.
    if (role !== "driver" && role !== "admin") {
      return NextResponse.json({ error: "Doar șoferul poate marca încasarea cash." }, { status: 403 });
    }
    const { rows } = await dbQuery<{ status: string; payment_method: string; payment_status: string }>(
      `SELECT status, payment_method, payment_status FROM rides WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    if (r.payment_method !== "cash") {
      return NextResponse.json({ error: "Cursa nu e cu plata cash." }, { status: 409 });
    }
    if (r.status !== "completed") {
      return NextResponse.json({ error: "Cursa nu e finalizată." }, { status: 409 });
    }
    await dbQuery(
      `UPDATE rides SET payment_status = 'collected_cash', updated_at = now()
        WHERE id = $1 AND payment_status IN ('unpaid', 'collected_cash')`,
      [id],
    );
    return NextResponse.json({ payment_status: "collected_cash" });
  } catch (err) {
    log.error({ err, rideId: id, action }, "ride pay failed");
    return NextResponse.json({ error: "Operațiunea de plată a eșuat." }, { status: 500 });
  }
}
