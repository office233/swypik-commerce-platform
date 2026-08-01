/**
 * POST /api/rides/estimate — estimare tarif FĂRĂ a crea cursă.
 * Body: { pickup, dropoff, vehicle_class? } → pricing engine (R3).
 *
 * ORAȘUL e derivat EXCLUSIV server-side din coordonatele de pickup
 * (reverse geocoding Nominatim, cache Redis 24h) — clientul nu îl poate
 * impune. Fără pricing_zone activă → 422 cu mesaj pentru UI.
 */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { estimate } from "@/lib/pricing/engine";
import { resolveRideCity, NoZoneError } from "@/lib/rides/city";
import { RideEstimateSchema } from "@/lib/validation/rides";
import { parseBody } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "rides/estimate" });

export async function POST(req: Request) {
    if (!isEnabled("go")) return frozenResponse("go");
    const session = await getAuthSession();
    if (!session?.userId) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const rl = await rateLimit("rideEstimate", session.userId);
    if (!rl.success) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const parsed = parseBody(RideEstimateSchema, body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.data;

    try {
        const city = await resolveRideCity(input.pickup, input.vehicle_class, input.country);
        const result = await estimate({
            city,
            country: input.country,
            kind: "ride",
            vehicle_class: input.vehicle_class,
            pickup: { lat: input.pickup.lat, lng: input.pickup.lng },
            dropoff: { lat: input.dropoff.lat, lng: input.dropoff.lng },
        });
        return NextResponse.json({ estimate: result, city });
    } catch (err) {
        if (err instanceof NoZoneError || (err as Error).message === "no_zone") {
            return NextResponse.json(
                { error: "Swypik Go is not available in your area yet.", code: "no_zone" },
                { status: 422 },
            );
        }
        log.error({ err }, "estimate failed");
        return NextResponse.json({ error: "Eroare la estimare." }, { status: 500 });
    }
}
