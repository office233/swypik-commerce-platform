/**
 * GET /api/rides/[id] — detaliu cursă (rider, șoferul atribuit sau admin).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { loadRide, resolveRole } from "@/lib/rides/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const authUser = await getAuthUser().catch(() => null);
  const role = await resolveRole(ride, session.userId, Boolean(authUser?.isAdmin));
  if (!role) return NextResponse.json({ error: "Acces interzis." }, { status: 403 });

  let driver: Record<string, unknown> | null = null;
  if (ride.driver_id) {
    const { rows } = await dbQuery(
      `SELECT full_name, vehicle_type, vehicle_make, vehicle_model, vehicle_color,
              vehicle_plate, rating, phone,
              current_lat, current_lng, location_updated_at
         FROM couriers WHERE id = $1`,
      [ride.driver_id],
    );
    driver = rows[0] ?? null;
    // Riderul nu are nevoie de telefonul complet decât după accept.
    if (driver && role === "rider" && !["accepted", "arriving", "in_progress"].includes(ride.status)) {
      delete (driver as Record<string, unknown>).phone;
    }
  }

  const { rows: ratings } = await dbQuery(
    `SELECT rater_role, stars, comment FROM ride_ratings WHERE ride_id = $1`,
    [id],
  );

  return NextResponse.json({ ride, driver, ratings, role });
}
