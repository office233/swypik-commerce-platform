/**
 * GET /api/go/track/[token] — snapshot PUBLIC al unei curse partajate.
 *
 * Fără autentificare, dar FĂRĂ date sensibile: nu expunem id-ul cursei,
 * telefonul șoferului, prețul sau user id-uri. Token-ul expiră la
 * share_expires_at (final cursă + 1h).
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { dbQuery } from "@/lib/db";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const rl = await rateLimit("geoSearch", getClientIP(req));
  if (!rl.success) {
    return NextResponse.json({ error: "Prea multe cereri." }, { status: 429 });
  }
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return NextResponse.json({ error: "Link invalid." }, { status: 404 });
  }

  const { rows } = await dbQuery<{
    status: string;
    pickup_address: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_address: string;
    dropoff_lat: number;
    dropoff_lng: number;
    driver_id: string | null;
    share_expires_at: string | null;
  }>(
    `SELECT status, pickup_address, pickup_lat, pickup_lng,
            dropoff_address, dropoff_lat, dropoff_lng, driver_id, share_expires_at
       FROM rides
      WHERE share_token = $1
        AND (share_expires_at IS NULL OR share_expires_at > now())`,
    [token],
  );
  const ride = rows[0];
  if (!ride) return NextResponse.json({ error: "Link expirat sau invalid." }, { status: 404 });

  let driver: { first_name: string; position: { lat: number; lng: number } | null } | null = null;
  if (ride.driver_id) {
    const { rows: d } = await dbQuery<{
      full_name: string;
      current_lat: number | null;
      current_lng: number | null;
    }>(`SELECT full_name, current_lat, current_lng FROM couriers WHERE id = $1`, [ride.driver_id]);
    if (d[0]) {
      driver = {
        first_name: d[0].full_name.split(" ")[0] ?? "",
        position:
          d[0].current_lat != null && d[0].current_lng != null
            ? { lat: Number(d[0].current_lat), lng: Number(d[0].current_lng) }
            : null,
      };
    }
  }

  return NextResponse.json({
    status: ride.status,
    pickup: { address: ride.pickup_address, lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) },
    dropoff: { address: ride.dropoff_address, lat: Number(ride.dropoff_lat), lng: Number(ride.dropoff_lng) },
    driver,
  });
});
