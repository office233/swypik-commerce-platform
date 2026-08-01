/**
 * PATCH /api/rides/[id]/dispatch — șoferul acceptă/refuză oferta cursei.
 * Body: { accept: boolean }. Atribuire atomică prin dispatch engine (R2);
 * acceptOffer setează rides.driver_id + status='accepted' în tranzacție.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { acceptOffer, declineOffer, getJobForRide } from "@/lib/dispatch/engine";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const accept = body?.accept === true;

    const { rows: cRows } = await dbQuery<{ id: string }>(
      `SELECT id FROM couriers
        WHERE user_id = $1 AND kind = 'driver' AND verification_status = 'approved'`,
      [session.userId],
    );
    const driverId = cRows[0]?.id;
    if (!driverId) {
      return NextResponse.json({ success: false, error: "Not an approved driver." }, { status: 403 });
    }

    const job = await getJobForRide(id);
    if (!job) {
      return NextResponse.json({ success: false, error: "Ride is no longer searching for a driver." }, { status: 404 });
    }

    if (!accept) {
      await declineOffer(job.id, driverId);
      return NextResponse.json({ success: true, accepted: false });
    }

    const result = await acceptOffer(job.id, driverId);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.code });
    }

    await dbQuery(`UPDATE rides SET accepted_at = now(), updated_at = now() WHERE id = $1`, [id]);

    const { rows } = await dbQuery(
      `SELECT pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat,
              dropoff_lng, estimated_fare_cents, currency, vehicle_class, payment_method
         FROM rides WHERE id = $1`,
      [id],
    );
    return NextResponse.json({ success: true, accepted: true, ride: rows[0] });
  } catch (error: unknown) {
    logger.error({ err: error }, "[rides/dispatch] PATCH error");
    return NextResponse.json({ success: false, error: "Eroare." }, { status: 500 });
  }
}
