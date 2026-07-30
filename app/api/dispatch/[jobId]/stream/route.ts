/**
 * GET /api/dispatch/[jobId]/stream — SSE cu evenimentele unui job de dispatch.
 *
 * Se abonează la canalul Redis `dispatch:job:<id>` și retransmite fiecare
 * payload ca `data: <json>\n\n`. Evenimente: {type:"status",...} la schimbări
 * de status și {type:"location",...} la heartbeat-ul GPS al curierului asignat.
 *
 * Autorizare: clientul comenzii/cursei, curierul asignat sau admin.
 * Pattern copiat din /api/dm/stream/[id].
 */
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { createSubscriber } from "@/lib/redis";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAuthorized(jobId: string): Promise<boolean> {
  const authUser = await getAuthUser().catch(() => null);
  if (authUser?.isAdmin) return true;

  const session = await getAuthSession();
  if (!session?.userId) return false;

  const { rows } = await dbQuery<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM dispatch_jobs j
         LEFT JOIN local_orders lo ON lo.id = j.order_id
         LEFT JOIN rides r ON r.id = j.ride_id
         LEFT JOIN couriers c ON c.id = j.assigned_courier_id
        WHERE j.id = $1
          AND (
            lo.customer_user_id = $2
            OR r.rider_user_id = $2
            OR c.user_id = $2
          )
     ) AS ok`,
    [jobId, session.userId],
  );
  return rows[0]?.ok === true;
}

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return new Response("Bad Request", { status: 400 });
  }
  if (!(await isAuthorized(jobId))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const channel = `dispatch:job:${jobId}`;
  const encoder = new TextEncoder();
  const subscriber = createSubscriber();

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

      const onMessage = (chan: string, message: string) => {
        if (chan !== channel) return;
        safeEnqueue(`data: ${message}\n\n`);
      };

      subscriber.on("message", onMessage);
      subscriber.on("error", (err) => {
        logger.error({ err: err instanceof Error ? err.message : err }, "[dispatch/stream] subscriber error:");
      });

      try {
        await subscriber.subscribe(channel);
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : err }, "[dispatch/stream] subscribe failed:");
        safeEnqueue(`event: error\ndata: ${JSON.stringify({ error: "subscribe_failed" })}\n\n`);
      }

      // Snapshot inițial cu statusul curent, ca UI-ul să nu aștepte primul event.
      try {
        const { rows } = await dbQuery(
          `SELECT status, wave, assigned_courier_id FROM dispatch_jobs WHERE id = $1`,
          [jobId],
        );
        if (rows[0]) {
          safeEnqueue(
            `data: ${JSON.stringify({
              type: "status",
              status: rows[0].status,
              wave: rows[0].wave,
              courier_id: rows[0].assigned_courier_id,
            })}\n\n`,
          );
        }
      } catch {
        // best-effort
      }

      heartbeat = setInterval(() => safeEnqueue(`: ping\n\n`), 25_000);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      subscriber.quit().catch(() => undefined);
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
