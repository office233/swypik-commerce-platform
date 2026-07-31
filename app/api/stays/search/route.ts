/**
 * POST /api/stays/search — căutare cazări (public, rate-limited).
 * Body: { city: slug, checkIn, checkOut, adults, rooms? }.
 * Prețuri finale în RON (marja Swypik inclusă) — costul net NU se expune.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
    searchExternalStays,
    StaysAccessError,
    isExternalStaysConfigured,
} from "@/lib/stays/provider";
import { cityBySlug } from "@/lib/stays/cities";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
    city: z.string().min(2).max(64),
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    adults: z.number().int().min(1).max(8).default(2),
    rooms: z.number().int().min(1).max(4).default(1),
});

export async function POST(req: Request) {
    const rl = await rateLimit("stays:search", getClientIP(req), { limit: 20, window: 60 });
    if (!rl.success) {
        return NextResponse.json({ error: "Prea multe căutări. Încearcă peste un minut." }, { status: 429 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "date invalide" }, { status: 400 });
    }
    const p = parsed.data;

    const city = cityBySlug(p.city);
    if (!city) return NextResponse.json({ error: "Oraș necunoscut" }, { status: 400 });
    if (new Date(p.checkOut) <= new Date(p.checkIn)) {
        return NextResponse.json({ error: "Check-out trebuie să fie după check-in" }, { status: 400 });
    }
    if (!isExternalStaysConfigured()) {
        return NextResponse.json({ error: "Serviciul de cazări nu e configurat" }, { status: 503 });
    }

    try {
        const results = await searchExternalStays({
            lat: city.lat,
            lng: city.lng,
            checkIn: p.checkIn,
            checkOut: p.checkOut,
            adults: p.adults,
            rooms: p.rooms,
        });
        // Public: doar preț final — fără cost net/marjă (aceeași regulă ca la Fly).
        const pub = results
            .sort((a, b) => a.totalCents - b.totalCents)
            .map(({ providerTotalCents, providerCurrency, markupCents, ...r }) => r);
        return NextResponse.json({ city: city.name, results: pub });
    } catch (err) {
        if (err instanceof StaysAccessError) {
            return NextResponse.json(
                { error: "stays_not_enabled", message: "Cazările se activează în curând." },
                { status: 503 },
            );
        }
        logger.error({ err }, "stays search failed");
        return NextResponse.json({ error: "Căutarea a eșuat" }, { status: 502 });
    }
}
