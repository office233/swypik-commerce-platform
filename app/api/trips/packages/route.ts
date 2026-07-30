/**
 * GET /api/trips/packages?origin=OTP — pachete de vacanță pe destinații.
 *
 * Acum: zbor live (Duffel, prețuri finale RON din sistemul Fly) + status
 * cazare (Duffel Stays — "curând" până se activează pe cont). Când Stays
 * devine activ, prețul pachetului devine zbor+hotel real, tot merchant Swypik.
 * Zero afiliere, zero linkuri externe.
 */
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { POPULAR_DESTINATIONS } from "@/lib/fly/destinations";
import { isStaysConfigured } from "@/lib/stays/duffel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Zile de vacanță tipice pe destinație (city-break vs sejur). */
const TRIP_NIGHTS: Record<string, number> = {
    VIE: 3, ROM: 4, FCO: 4, PAR: 4, CDG: 4, BCN: 4, MAD: 4, LIS: 5,
    ATH: 5, IST: 4, DXB: 6, JFK: 7, AMS: 3, LON: 4, LHR: 4,
};

export async function GET(req: Request) {
    const origin = (new URL(req.url).searchParams.get("origin") ?? "OTP").toUpperCase();

    // Refolosim cache-ul deals (prețuri zbor live, RON) — nu lovim Duffel de 2 ori.
    const departDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    let deals: any[] = [];
    try {
        const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const r = await fetch(`${base}/api/fly/deals?origin=${origin}`, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(50000),
        });
        if (r.ok) deals = (await r.json()).deals ?? [];
    } catch (err) {
        logger.warn({ err }, "trips: deals fetch failed");
    }

    const packages = deals.map((d) => ({
        iata: d.iata,
        city: d.city,
        country: d.country,
        image: d.image,
        nights: TRIP_NIGHTS[d.iata] ?? 4,
        flightFromCents: d.fromCents, // preț final RON, dus, markup inclus
        currency: "RON",
        staysAvailable: isStaysConfigured() && false, // TODO: true la activarea Duffel Stays
        departDate,
    }));

    return NextResponse.json({ origin, packages, staysComingSoon: true });
}
