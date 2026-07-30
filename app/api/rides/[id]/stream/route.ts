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
import { createSubscriber } from "@/lib/redis";
import { loadRide, resolveRole } from "@/lib/rides/service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
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

  const channel = ride.job_id ? `dispatch:job:${ride.job_id}` : null;
  const encoder = new TextEncoder();
  const subscriber = channel ? createSubscriber() : null;

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller closed
        }
      };

      if (subscriber && channel) {
        subscriber.on("message", (chan: string, message: string) => {
          if (chan !== channel) return;
          safeEnqueue(`data: ${message}\n\n`);
        });
        subscriber.on("error", (err) => {
          logger.error({ err: err instanceof Error ? err.message : err }, "[rides/stream] subscriber error:");
        });
        try {
          await subscriber.subscribe(channel);
        } catch (err) {
          logger.error({ err: err instanceof Error ? err.message : err }, "[rides/stream] subscribe failed:");
        }
      }

      // Snapshot inițial: status cursă + poziția curentă a șoferului.
      try {
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
        safeEnqueue(
          `data: ${JSON.stringify({
            type: "snapshot",
            status: fresh?.status,
            driver_id: fresh?.driver_id,
            driver_position: driverPos,
          })}\n\n`,
        );
      } catch {
        // best-effort
      }

      heartbeat = setInterval(() => safeEnqueue(`: ping\n\n`), 25_000);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      subscriber?.quit().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
