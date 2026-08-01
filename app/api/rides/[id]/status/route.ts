/**
 * PATCH /api/rides/[id]/status — mașină de stări STRICTĂ cu rol per tranziție.
 *
 *   driver:        accepted → arriving → in_progress → completed
 *   rider/driver:  requested|searching|accepted|arriving → cancelled
 *     (gratuit înainte de 'accepted' sau în primele 2 min după; altfel
 *      cancel_fee din zona de pricing)
 *
 * 'accepted' NU trece pe aici — o setează exclusiv dispatch engine (acceptOffer).
 * La 'completed': recalculăm tariful final pe distanța reală GPS
 * (courier_location_history) → final_fare_cents + fare_breakdown.
 */
import { NextResponse } from "next/server";
import { dbQuery, withTransaction } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { findZone } from "@/lib/pricing/engine";
import {
  loadRide,
  resolveRole,
  canTransition,
  cancelFeeCents,
  computeFinalFare,
  publishRideEvent,
} from "@/lib/rides/service";
import { RideStatusPatchSchema } from "@/lib/validation/rides";
import { parseBody } from "@/lib/validation/schemas";
import { settleRide } from "@/lib/payments/mobility";
import { captureRidePayment, cancelRideAuthorization } from "@/lib/payments/mobility-stripe";
import { sendPushToUser } from "@/lib/push/send";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "rides/status" });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseBody(RideStatusPatchSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { status: to, reason, cancel_reason: cancelReason } = parsed.data;

  const ride = await loadRide(id);
  if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });

  const authUser = await getAuthUser().catch(() => null);
  const role = await resolveRole(ride, session.userId, Boolean(authUser?.isAdmin));
  if (!role) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const check = canTransition(ride.status, to, role);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.code });

  const result = await withTransaction(async (q) => {
    // Re-citim cu lock — statusul se poate schimba concurent.
    const { rows: locked } = await q<typeof ride>(
      `SELECT * FROM rides WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const fresh = locked[0];
    const recheck = canTransition(fresh.status, to, role);
    if (!recheck.ok) return { error: recheck.error, code: recheck.code };

    if (to === "arriving") {
      await q(`UPDATE rides SET status='arriving', arrived_at = now(), updated_at = now() WHERE id = $1`, [id]);
      return { status: "arriving" };
    }

    if (to === "in_progress") {
      await q(`UPDATE rides SET status='in_progress', started_at = now(), updated_at = now() WHERE id = $1`, [id]);
      return { status: "in_progress" };
    }

    if (to === "completed") {
      const fare = await computeFinalFare(fresh);
      await q(
        `UPDATE rides
            SET status='completed', completed_at = now(), updated_at = now(),
                final_fare_cents = $2, distance_km = $3, duration_min = $4,
                fare_breakdown = $5,
                share_expires_at = now() + interval '1 hour'
          WHERE id = $1`,
        [id, fare.final_fare_cents, fare.distance_km, fare.duration_min, JSON.stringify(fare.breakdown)],
      );
      if (fresh.driver_id) {
        await q(
          `UPDATE couriers SET completed_deliveries = completed_deliveries + 1, updated_at = now() WHERE id = $1`,
          [fresh.driver_id],
        );
        // Eliberăm jobul de dispatch, ca șoferul să poată primi altă cursă.
        await q(
          `UPDATE dispatch_jobs SET status = 'cancelled', updated_at = now()
            WHERE ride_id = $1 AND status = 'assigned'`,
          [id],
        );
      }
      return {
        status: "completed",
        final_fare_cents: fare.final_fare_cents,
        distance_km: fare.distance_km,
        duration_min: fare.duration_min,
        distance_source: fare.distance_source,
      };
    }

    // cancelled
    const zone = await findZone(fresh.city, "ride", fresh.vehicle_class).catch(() => null);
    const fee = role === "rider" ? cancelFeeCents(fresh, zone) : 0;
    // Motivul: cod structurat (enum) + eventual text liber pentru 'other'.
    const reasonText = [cancelReason, reason].filter(Boolean).join(": ") || null;
    await q(
      `UPDATE rides
          SET status='cancelled', cancelled_at = now(), updated_at = now(),
              cancel_reason = $2, cancelled_by = $3, cancel_fee_cents = $4,
              share_expires_at = now() + interval '1 hour'
        WHERE id = $1`,
      [id, reasonText, role === "admin" ? "system" : role, fee],
    );
    await q(
      `UPDATE dispatch_jobs SET status = 'cancelled', updated_at = now()
        WHERE ride_id = $1 AND status IN ('searching','assigned')`,
      [id],
    );
    return { status: "cancelled", cancel_fee_cents: fee };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.code as number });
  }

    // FRONT R5 — decontare la completed: capture card + split în wallet ledger.
    if (result.status === "completed") {
      try {
        await captureRidePayment(id);
      } catch (err) {
        log.error({ err, rideId: id }, "capture ride payment failed (settlement continues)");
      }
      try {
        await settleRide(id);
      } catch (err) {
        log.error({ err, rideId: id }, "settle ride failed");
      }
    } else if (result.status === "cancelled") {
      // Eliberează pre-autorizarea Stripe dacă exista.
      cancelRideAuthorization(id).catch((err) =>
        log.warn({ err, rideId: id }, "cancel ride authorization failed"),
      );
    }

    // Push best-effort către rider la 'arriving' (șoferul a ajuns la pickup).
    if (result.status === "arriving" && ride.rider_user_id) {
      void sendPushToUser(ride.rider_user_id, {
        title: "Șoferul a ajuns 🚗",
        body: "Te așteaptă la punctul de plecare.",
        url: `/go/${id}`,
      }).catch((err) => log.warn({ err, rideId: id }, "push arriving failed"));
    }

  await publishRideEvent(ride, { type: "status", ride_id: id, ...result });
  log.info({ rideId: id, to, role }, "ride status changed");
  return NextResponse.json(result);
}
