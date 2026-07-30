/**
 * POST /api/eats/quote — estimarea taxei de livrare ÎNAINTE de plasarea comenzii.
 *
 * Inputul clientului conține DOAR merchant_id + coordonatele de livrare
 * (opțional subtotal_cents pentru afișarea totalului estimat). Taxa se
 * calculează exclusiv server-side prin pricing engine, cu fallback la taxa
 * fixă a merchantului — identic cu logica din POST /api/local-orders,
 * ca UI-ul să afișeze exact ce va fi facturat.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { resolveDeliveryFee } from "@/lib/pricing/delivery";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "/api/eats/quote" });

const QuoteSchema = z.object({
    merchant_id: z.string().uuid(),
    delivery_lat: z.coerce.number().min(-90).max(90).optional(),
    delivery_lng: z.coerce.number().min(-180).max(180).optional(),
    subtotal_cents: z.coerce.number().int().min(0).max(100_000_00).optional(),
    tip_cents: z.coerce.number().int().min(0).max(10_000_00).optional(),
});

type MerchantRow = {
    id: string;
    status: string;
    min_order_cents: number | null;
    delivery_fee_cents: number | null;
    avg_prep_minutes: number | null;
    location_city: string | null;
    location_country: string | null;
    location_lat: number | null;
    location_lng: number | null;
};

export async function POST(req: Request) {
    try {
        const session = await getAuthSession();
        const rl = await rateLimit(
            "localOrders",
            session?.userId ?? req.headers.get("cf-connecting-ip") ?? "anon",
        );
        if (!rl.success) {
            return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
        }

        const raw = await req.json().catch(() => null);
        const parsed = QuoteSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: parsed.error.issues[0]?.message ?? "invalid_input" },
                { status: 400 },
            );
        }
        const d = parsed.data;

        const { rows } = await dbQuery<MerchantRow>(
                        `SELECT id, status, min_order_cents, delivery_fee_cents, avg_prep_minutes,
              location_city, location_country, location_lat, location_lng
         FROM local_merchants WHERE id = $1`,
            [d.merchant_id],
        );
        const merchant = rows[0];
        if (!merchant || merchant.status !== "active") {
            return NextResponse.json(
                { success: false, error: "Restaurantul nu e disponibil." },
                { status: 404 },
            );
        }

        const fee = await resolveDeliveryFee({
            merchant,
            dropoff: { lat: d.delivery_lat ?? null, lng: d.delivery_lng ?? null },
        });

        const subtotal = d.subtotal_cents ?? 0;
        const tip = d.tip_cents ?? 0;
        const minOrder = merchant.min_order_cents ?? 0;

        return NextResponse.json({
            success: true,
            quote: {
                merchant_id: merchant.id,
                delivery_fee_cents: fee.fee_cents,
                source: fee.source,
                zone_id: fee.zone_id,
                distance_km: fee.distance_km,
                surge_multiplier: fee.surge_multiplier,
                breakdown: fee.breakdown,
                subtotal_cents: subtotal,
                tip_cents: tip,
                total_cents: subtotal + fee.fee_cents + tip,
                min_order_cents: minOrder,
                min_order_met: subtotal >= minOrder,
                eta_minutes: (merchant.avg_prep_minutes ?? 20) + 25,
                currency: "RON",
            },
        });
    } catch (err) {
        log.error({ err }, "eats quote failed");
        return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
    }
}
