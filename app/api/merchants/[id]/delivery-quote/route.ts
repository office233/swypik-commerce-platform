/**
 * GET /api/merchants/[id]/delivery-quote?lat=&lng=
 *
 * Estimarea taxei de livrare ÎNAINTE de plasarea comenzii (checkout UI).
 * Folosește exact aceeași logică server-side ca POST /api/local-orders
 * (lib/pricing/delivery.ts), deci suma afișată = suma facturată.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { resolveDeliveryFee } from "@/lib/pricing/delivery";
import { rateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ success: false, error: "ID invalid" }, { status: 400 });
        }
        const ip = req.headers.get("cf-connecting-ip") ?? "anon";
        const rl = await rateLimit("deliveryQuote", ip, { limit: 60, window: 60 });
        if (!rl.success) {
            return NextResponse.json({ success: false, error: "Prea multe cereri." }, { status: 429 });
        }

        const url = new URL(req.url);
        const lat = Number(url.searchParams.get("lat"));
        const lng = Number(url.searchParams.get("lng"));
        const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

        const { rows } = await dbQuery(
            `SELECT delivery_fee_cents, min_order_cents, avg_prep_minutes,
              location_city, location_country, location_lat, location_lng
         FROM local_merchants WHERE id = $1 AND status = 'active'`,
            [id],
        );
        const merchant = rows[0];
        if (!merchant) {
            return NextResponse.json({ success: false, error: "Merchant inexistent." }, { status: 404 });
        }

        const quote = await resolveDeliveryFee({
            merchant,
            dropoff: hasCoords ? { lat, lng } : { lat: null, lng: null },
        });

        return NextResponse.json({
            success: true,
            quote: {
                fee_cents: quote.fee_cents,
                source: quote.source,
                distance_km: quote.distance_km,
                surge_multiplier: quote.surge_multiplier,
                min_order_cents: merchant.min_order_cents,
                avg_prep_minutes: merchant.avg_prep_minutes,
            },
        });
    } catch (error: unknown) {
        logger.error({ err: error }, "[delivery-quote] GET error");
        return NextResponse.json({ success: false, error: "Eroare internă." }, { status: 500 });
    }
}
