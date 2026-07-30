/**
 * Swypik Go — curse.
 *
 * POST /api/rides — creează cursa (status 'requested'), pornește dispatch
 *   (kind='ride', engine R2) → status 'searching'. Prețul e calculat EXCLUSIV
 *   server-side prin pricing engine (R3); clientul nu trimite niciodată preț.
 * GET  /api/rides — istoric curse ale riderului logat (paginat).
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { estimate } from "@/lib/pricing/engine";
import { resolveRideCity, NoZoneError } from "@/lib/rides/city";
import { createJob } from "@/lib/dispatch/engine";
import { RideCreateSchema } from "@/lib/validation/rides";
import { parseBody } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "rides" });

export async function POST(req: Request) {
    const session = await getAuthSession();
    if (!session?.userId) {
        return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
    }
    const rl = await rateLimit("rideCreate", session.userId);
    if (!rl.success) return NextResponse.json({ error: "Prea multe cereri." }, { status: 429 });

    const body = await req.json().catch(() => null);
    const parsed = parseBody(RideCreateSchema, body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.data;

    // O singură cursă activă per rider.
    const { rows: active } = await dbQuery<{ id: string }>(
        `SELECT id FROM rides
      WHERE rider_user_id = $1
        AND status NOT IN ('completed','cancelled')
      LIMIT 1`,
        [session.userId],
    );
    if (active.length) {
        return NextResponse.json(
            { error: "Ai deja o cursă activă.", ride_id: active[0].id },
            { status: 409 },
        );
    }

    let est;
    let city: string;
    try {
        city = await resolveRideCity(input.pickup, input.vehicle_class, input.country);
        est = await estimate({
            city,
            country: input.country,
            kind: "ride",
            vehicle_class: input.vehicle_class,
            pickup: { lat: input.pickup.lat, lng: input.pickup.lng },
            dropoff: { lat: input.dropoff.lat, lng: input.dropoff.lng },
        });
    } catch (err) {
        if (err instanceof NoZoneError || (err as Error).message === "no_zone") {
            return NextResponse.json(
                { error: "Swypik Go nu e disponibil încă în zona ta.", code: "no_zone" },
                { status: 422 },
            );
        }
        throw err;
    }

    const { rows } = await dbQuery<{ id: string }>(
        `INSERT INTO rides
       (rider_user_id, city, vehicle_class,
        pickup_address, pickup_lat, pickup_lng,
        dropoff_address, dropoff_lat, dropoff_lng,
        status, estimated_fare_cents, currency,
        distance_km, duration_min, surge_multiplier, fare_breakdown,
          payment_method, share_token)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'requested',$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
        [
            session.userId,
            city,
            input.vehicle_class,
            input.pickup.address,
            input.pickup.lat,
            input.pickup.lng,
            input.dropoff.address,
            input.dropoff.lat,
            input.dropoff.lng,
            est.total_cents,
            est.currency,
            est.distance_km,
            est.duration_min,
            est.breakdown.surge_multiplier,
            JSON.stringify(est.breakdown),
            input.payment_method,
            randomBytes(16).toString("hex"),
        ],
    );
    const rideId = rows[0].id;

    // Dispatch: job kind='ride' + primul val de oferte (engine R2).
    const { job, offered } = await createJob({
        kind: "ride",
        rideId,
        city,
        pickupLat: input.pickup.lat,
        pickupLng: input.pickup.lng,
    });
    await dbQuery(`UPDATE rides SET job_id = $2, status = 'searching', updated_at = now() WHERE id = $1`, [
        rideId,
        job.id,
    ]);

    log.info({ rideId, jobId: job.id, offered }, "ride created + dispatch started");
    return NextResponse.json(
        {
            ride_id: rideId,
            job_id: job.id,
            status: "searching",
            estimated_fare_cents: est.total_cents,
            currency: est.currency,
            offered,
        },
        { status: 201 },
    );
}

export async function GET(req: Request) {
    const session = await getAuthSession();
    if (!session?.userId) {
        return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
    }
    const url = new URL(req.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    const { rows } = await dbQuery(
        `SELECT r.id, r.status, r.vehicle_class, r.pickup_address, r.dropoff_address,
            r.estimated_fare_cents, r.final_fare_cents, r.currency,
            r.distance_km, r.duration_min, r.requested_at, r.completed_at,
            c.full_name AS driver_name, c.rating AS driver_rating
       FROM rides r
       LEFT JOIN couriers c ON c.id = r.driver_id
      WHERE r.rider_user_id = $1
      ORDER BY r.requested_at DESC
      LIMIT $2 OFFSET $3`,
        [session.userId, limit, offset],
    );
    return NextResponse.json({ rides: rows });
}
