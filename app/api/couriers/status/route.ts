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

        // Dacă tocmai a trecut online, îi returnăm ofertele pending.
        let offers: unknown[] = [];
        if (d.online) {
            const { rows: pending } = await dbQuery(
                `SELECT o.id AS offer_id, o.expires_at, lo.order_number, lo.delivery_address,
                m.name AS merchant_name, m.address AS pickup_address,
                lo.delivery_fee_cents, lo.currency
           FROM dispatch_offers o
           JOIN local_orders lo ON lo.id = o.order_id
           JOIN local_merchants m ON m.id = lo.merchant_id
          WHERE o.courier_id = $1 AND o.response IS NULL AND o.expires_at > now()`,
                [rows[0].id],
            );
            offers = pending;
        }

        return NextResponse.json({ success: true, online: rows[0].is_online, offers });
    } catch (error: unknown) {
        logger.error({ err: error }, "[couriers/status] error");
        return NextResponse.json({ success: false, error: "Eroare." }, { status: 500 });
    }
}
