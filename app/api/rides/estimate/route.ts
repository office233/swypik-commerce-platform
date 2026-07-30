/**
 * POST /api/rides/estimate — estimare tarif FĂRĂ a crea cursă.
 * Body: { pickup, dropoff, vehicle_class?, city? } → pricing engine (R3).
 */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { estimate } from "@/lib/pricing/engine";
import { RideEstimateSchema } from "@/lib/validation/rides";
import { parseBody } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "rides/estimate" });

export async function POST(req: Request) {
    const session = await getAuthSession();
    if (!session?.userId) {
        return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
    }
    const rl = await rateLimit("rideEstimate", session.userId);
    if (!rl.success) {
        return NextResponse.json({ error: "Prea multe cereri." }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const parsed = parseBody(RideEstimateSchema, body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.data;

    try {
        const result = await estimate({
            city: input.city,
            country: input.country,
            kind: "ride",
            vehicle_class: input.vehicle_class,
            pickup: { lat: input.pickup.lat, lng: input.pickup.lng },
            dropoff: { lat: input.dropoff.lat, lng: input.dropoff.lng },
        });
        return NextResponse.json({ estimate: result });
    } catch (err) {
        if ((err as Error).message === "no_zone") {
            return NextResponse.json(
                { error: "Swypik Go nu e încă disponibil în orașul tău." },
                { status: 422 },
            );
        }
        log.error({ err }, "estimate failed");
        return NextResponse.json({ error: "Eroare la estimare." }, { status: 500 });
    }
}
