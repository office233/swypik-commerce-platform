/**
 * GET /api/rides/[id]/stream — SSE pentru o cursă: status + poziție șofer.
 *
 * Reutilizează canalul Redis al jobului de dispatch (`dispatch:job:<jobId>`,
 * engine R2) — nu duplicăm infrastructura de pub/sub. Peste evenimentele
 * jobului, trimitem un snapshot inițial cu starea cursei + poziția șoferului.
 */
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { createSseResponse } from "@/lib/realtime/sse";
import { realtimeChannels } from "@/lib/realtime";
import { loadRide, resolveRole } from "@/lib/rides/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new Response("Bad Request", { status: 400 });
  }

  const session = await getAuthSession();
  if (!session?.userId) return new Response("Unauthorized", { status: 401 });

  const ride = await loadRide(id);
  if (!ride) return new Response("Not Found", { status: 404 });

  const authUser = await getAuthUser().catch(() => null);
  const role = await resolveRole(ride, session.userId, Boolean(authUser?.isAdmin));
  if (!role) return new Response("Forbidden", { status: 403 });

  return createSseResponse({
    logTag: "rides/stream",
    channels: ride.job_id ? [realtimeChannels.dispatchJob(ride.job_id)] : [],
    signal: req.signal,
    // Snapshot inițial: status cursă + poziția curentă a șoferului (din DB —
    // sursa de adevăr, deci corect indiferent pe ce replică se reconectează clientul).
    onOpen: async (send) => {
      const fresh = await loadRide(id);
      let driverPos: { lat: number | null; lng: number | null } | null = null;
      if (fresh?.driver_id) {
        const { rows } = await dbQuery<{ current_lat: number | null; current_lng: number | null }>(
          `SELECT current_lat, current_lng FROM couriers WHERE id = $1`,
          [fresh.driver_id],
        );
        if (rows[0]?.current_lat != null) {
          driverPos = { lat: rows[0].current_lat, lng: rows[0].current_lng };
        }
      }
      send({ type: "snapshot", status: fresh?.status, driver_id: fresh?.driver_id, driver_position: driverPos });
    },
  });
}
