/**
 * Curieri — online/offline + poziție GPS (PWA trimite la ~10s când e online).
 *
 * POST /api/couriers/status  { online: boolean, lat?, lng? }
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { CourierStatusSchema, parseBody } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";
import { publishJobEvent } from "@/lib/dispatch/engine";
import { DEFAULT_CURRENCY } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const session = await getAuthSession();
        if (!session?.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const rl = await rateLimit("courierStatus", session.userId);
        if (!rl.success) {
            return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
        }

        const raw = await req.json().catch(() => null);
        const parsed = parseBody(CourierStatusSchema, raw);
        if (!parsed.ok) {
            return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
        }
        const d = parsed.data;

        const { rows } = await dbQuery(
            `UPDATE couriers
          SET is_online = $2,
              current_lat = COALESCE($3, current_lat),
              current_lng = COALESCE($4, current_lng),
              location_updated_at = CASE WHEN $3 IS NOT NULL THEN now() ELSE location_updated_at END,
              updated_at = now()
        WHERE user_id = $1 AND verification_status = 'approved'
        RETURNING id, is_online`,
            [session.userId, d.online, d.lat ?? null, d.lng ?? null],
        );

        if (!rows.length) {
            return NextResponse.json(
                { success: false, error: "Contul de curier nu e aprobat încă." },
                { status: 403 },
            );
        }

        // Istoric GPS (retenție 30 zile — vezi migrarea
        // 20260730_0003_courier_location_history.sql). Best-effort: nu
        // blocăm răspunsul dacă insert-ul de istoric eșuează.
        if (d.lat != null && d.lng != null) {
            try {
                await dbQuery(
                    `INSERT INTO courier_location_history (courier_id, lat, lng, speed_kmh, heading)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [rows[0].id, d.lat, d.lng, d.speed_kmh ?? null, d.heading ?? null],
                );
            } catch (histErr) {
                logger.error({ err: histErr }, "[couriers/status] history insert failed");
            }

            // Heartbeat GPS pentru clientul care își urmărește comanda:
            // publicăm locația pe canalul job-ului asignat (SSE dispatch stream).
            try {
                const { rows: jobs } = await dbQuery(
                    `SELECT id FROM dispatch_jobs
                      WHERE assigned_courier_id = $1 AND status = 'assigned'`,
                    [rows[0].id],
                );
                for (const j of jobs) {
                    await publishJobEvent(j.id, {
                        type: "location",
                        lat: d.lat,
                        lng: d.lng,
                        speed_kmh: d.speed_kmh ?? null,
                        heading: d.heading ?? null,
                        at: new Date().toISOString(),
                    });
                }
            } catch (pubErr) {
                logger.error({ err: pubErr }, "[couriers/status] location publish failed");
            }
        }

        // Dacă tocmai a trecut online, îi returnăm ofertele pending.
        let offers: unknown[] = [];
        if (d.online) {
            const { rows: pending } = await dbQuery(
                // Ofertele pending includ AMBELE tipuri de job: livrări (local_orders)
                // și curse Swypik Go (rides) — PWA-ul le distinge prin `kind`.
                `SELECT o.id AS offer_id, j.kind, o.expires_at,
                    o.order_id, j.ride_id,
                        lo.order_number,
                        COALESCE(lo.delivery_address, r.dropoff_address) AS delivery_address,
                        COALESCE(m.name, 'Swypik Go')                    AS merchant_name,
                        COALESCE(m.address, r.pickup_address)            AS pickup_address,
                        COALESCE(lo.delivery_fee_cents, r.estimated_fare_cents) AS delivery_fee_cents,
                        COALESCE(lo.currency, r.currency, $2)           AS currency
           FROM dispatch_offers o
           JOIN dispatch_jobs j          ON j.id = o.job_id
           LEFT JOIN local_orders lo     ON lo.id = o.order_id
           LEFT JOIN local_merchants m   ON m.id = lo.merchant_id
           LEFT JOIN rides r             ON r.id = j.ride_id
          WHERE o.courier_id = $1 AND o.response IS NULL AND o.expires_at > now()`,
              [rows[0].id, DEFAULT_CURRENCY],
            );
            offers = pending;
        }

        return NextResponse.json({ success: true, online: rows[0].is_online, offers });
    } catch (error: unknown) {
        logger.error({ err: error }, "[couriers/status] error");
        return NextResponse.json({ success: false, error: "Eroare." }, { status: 500 });
    }
}
