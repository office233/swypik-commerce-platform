/**
 * Dispatch — oferă comanda curierilor online din oraș, cel mai apropiat primul.
 *
 * POST /api/local-orders/[id]/dispatch   (merchant/admin) → creează oferte
 * PATCH /api/local-orders/[id]/dispatch  (curier) → accept/refuz ofertă
 *
 * Atribuirea folosește SELECT ... FOR UPDATE într-o tranzacție, ca doi curieri
 * să nu poată accepta aceeași comandă simultan.
 */
import { NextResponse } from "next/server";
import { dbQuery, withTransaction } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFER_TTL_SECONDS = 45;
const MAX_COURIERS_PER_WAVE = 5;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const sellerId = await getSellerSessionId();
        if (!sellerId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        // Comanda trebuie să aparțină merchantului acestui seller și să fie gata de ridicat.
        const { rows: orders } = await dbQuery(
            `SELECT lo.id, lo.status, lo.dispatch_status, lo.courier_id,
              m.location_city, m.location_lat, m.location_lng, m.seller_id
         FROM local_orders lo
         JOIN local_merchants m ON m.id = lo.merchant_id
        WHERE lo.id = $1`,
            [id],
        );
        const order = orders[0];
        if (!order || order.seller_id !== sellerId) {
            return NextResponse.json({ success: false, error: "Comanda nu există." }, { status: 404 });
        }
        if (order.courier_id) {
            return NextResponse.json({ success: false, error: "Comanda are deja curier." }, { status: 409 });
        }
        if (!["accepted", "preparing", "ready"].includes(order.status)) {
            return NextResponse.json(
                { success: false, error: "Comanda nu e în stadiul potrivit pentru dispatch." },
                { status: 409 },
            );
        }

        // Curieri online, aprobați, în același oraș, ordonați după distanță.
        // Distanța: aproximare haversine simplă (suficient pentru un oraș).
        const { rows: couriers } = await dbQuery(
            `SELECT id,
              CASE WHEN current_lat IS NULL OR $2::float8 IS NULL THEN 999999
                   ELSE 6371 * acos(LEAST(1, GREATEST(-1,
                     cos(radians($2)) * cos(radians(current_lat)) *
                     cos(radians(current_lng) - radians($3)) +
                     sin(radians($2)) * sin(radians(current_lat))
                   )))
              END AS distance_km
         FROM couriers
        WHERE is_online = true
          AND verification_status = 'approved'
          AND kind = 'courier'
          AND lower(city) = lower($1)
          AND id NOT IN (SELECT courier_id FROM dispatch_offers WHERE order_id = $4)
          AND id NOT IN (
            SELECT courier_id FROM local_orders
             WHERE courier_id IS NOT NULL
               AND status IN ('picked_up','delivering')
          )
        ORDER BY distance_km ASC
        LIMIT $5`,
            [order.location_city, order.location_lat, order.location_lng, id, MAX_COURIERS_PER_WAVE],
        );

        if (!couriers.length) {
            await dbQuery(
                `UPDATE local_orders SET dispatch_status = 'no_courier', updated_at = now() WHERE id = $1`,
                [id],
            );
            return NextResponse.json({ success: true, offered: 0, dispatch_status: "no_courier" });
        }

        await withTransaction(async (q) => {
            for (const c of couriers) {
                await q(
                    `INSERT INTO dispatch_offers (order_id, courier_id, expires_at)
           VALUES ($1, $2, now() + make_interval(secs => $3))
           ON CONFLICT (order_id, courier_id) DO NOTHING`,
                    [id, c.id, OFFER_TTL_SECONDS],
                );
            }
            await q(
                `UPDATE local_orders SET dispatch_status = 'offered', updated_at = now() WHERE id = $1`,
                [id],
            );
        });

        return NextResponse.json({
            success: true,
            offered: couriers.length,
            expires_in_seconds: OFFER_TTL_SECONDS,
        });
    } catch (error: unknown) {
        logger.error({ err: error }, "[dispatch] POST error");
        return NextResponse.json({ success: false, error: "Eroare la dispatch." }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await getAuthSession();
        if (!session?.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json().catch(() => null);
        const accept = body?.accept === true;

        const { rows: cRows } = await dbQuery(
            `SELECT id FROM couriers WHERE user_id = $1 AND verification_status = 'approved'`,
            [session.userId],
        );
        const courierId = cRows[0]?.id;
        if (!courierId) {
            return NextResponse.json({ success: false, error: "Nu ești curier aprobat." }, { status: 403 });
        }

        if (!accept) {
            await dbQuery(
                `UPDATE dispatch_offers SET response = 'declined', responded_at = now()
          WHERE order_id = $1 AND courier_id = $2 AND response IS NULL`,
                [id, courierId],
            );
            return NextResponse.json({ success: true, accepted: false });
        }

        // Atribuire atomică: blochează rândul comenzii cât verificăm și scriem.
        const result = await withTransaction(async (q) => {
            const { rows: locked } = await q(
                `SELECT id, courier_id, status FROM local_orders WHERE id = $1 FOR UPDATE`,
                [id],
            );
            const o = locked[0];
            if (!o) return { ok: false as const, error: "Comanda nu există.", code: 404 };
            if (o.courier_id) return { ok: false as const, error: "Comanda a fost deja preluată.", code: 409 };

            const { rows: offer } = await q(
                `SELECT id FROM dispatch_offers
          WHERE order_id = $1 AND courier_id = $2 AND response IS NULL AND expires_at > now()`,
                [id, courierId],
            );
            if (!offer.length) return { ok: false as const, error: "Oferta a expirat.", code: 410 };

            await q(
                `UPDATE dispatch_offers SET response = 'accepted', responded_at = now()
          WHERE order_id = $1 AND courier_id = $2`,
                [id, courierId],
            );
            await q(
                `UPDATE local_orders
            SET courier_id = $2, dispatch_status = 'assigned', updated_at = now()
          WHERE id = $1`,
                [id, courierId],
            );
            // Ceilalți curieri nu mai pot accepta.
            await q(
                `UPDATE dispatch_offers SET response = 'expired', responded_at = now()
          WHERE order_id = $1 AND courier_id <> $2 AND response IS NULL`,
                [id, courierId],
            );
            return { ok: true as const };
        });

        if (!result.ok) {
            return NextResponse.json({ success: false, error: result.error }, { status: result.code });
        }

        const { rows } = await dbQuery(
            `SELECT lo.order_number, lo.delivery_address, lo.delivery_lat, lo.delivery_lng,
              lo.customer_name, lo.customer_phone, lo.items, lo.total_cents, lo.payment_method,
              m.name AS merchant_name, m.address AS pickup_address,
              m.location_lat AS pickup_lat, m.location_lng AS pickup_lng
         FROM local_orders lo JOIN local_merchants m ON m.id = lo.merchant_id
        WHERE lo.id = $1`,
            [id],
        );

        return NextResponse.json({ success: true, accepted: true, delivery: rows[0] });
    } catch (error: unknown) {
        logger.error({ err: error }, "[dispatch] PATCH error");
        return NextResponse.json({ success: false, error: "Eroare." }, { status: 500 });
    }
}
