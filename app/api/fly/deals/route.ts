/**
 * GET /api/fly/deals?origin=OTP — prețuri "de la X€" pentru destinațiile
 * populare, ca oamenii să vadă instant cât costă și să dea click.
 *
 * Interoghează Duffel pentru fiecare destinație (plecare peste ~30 zile,
 * one-way, 1 adult) și cache-uiește rezultatul în Redis 12h — deci utilizatorii
 * primesc răspuns instant, iar noi nu ardem rate-limit-ul furnizorului.
 */
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { duffelProvider } from "@/lib/fly/duffel";
import { POPULAR_DESTINATIONS } from "@/lib/fly/destinations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SECONDS = 12 * 60 * 60;
const IATA = /^[A-Za-z]{3}$/;

export type Deal = {
    iata: string;
    city: string;
    country: string;
    image: string;
    fromCents: number | null;
    currency: string;
};

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const originRaw = (searchParams.get("origin") ?? "OTP").toUpperCase();
    const origin = IATA.test(originRaw) ? originRaw : "OTP";

    // Plecare peste 30 de zile — fereastră tipică pentru prețuri bune.
    const departDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    // v2 = prețuri în RON (bust cache-ul vechi în EUR/GBP).
    const cacheKey = `fly:deals:v2:${origin}:${departDate}`;

if (process.env.REDIS_URL) {
    try {
      const redis = getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json({ origin, deals: JSON.parse(cached) as Deal[], cached: true });
      }
    } catch (err) {
      logger.warn({ err }, "fly deals: cache read failed");
    }
    }

    const targets = POPULAR_DESTINATIONS.filter((d) => d.iata !== origin);
    const results = await Promise.allSettled(
        targets.map(async (d) => {
            const offers = await duffelProvider.search({
                origin,
                destination: d.iata,
                departDate,
                adults: 1,
                cabin: "economy",
                currency: "EUR",
                maxResults: 5,
            });
            const cheapest = offers.reduce<number | null>(
                (min, o) => (min === null || o.totalCents < min ? o.totalCents : min),
                null,
            );
            return {
                iata: d.iata,
                city: d.city,
                country: d.country,
                image: d.image,
                fromCents: cheapest,
                currency: offers[0]?.currency ?? "RON",
            } satisfies Deal;
        }),
    );

    const deals: Deal[] = results
        .map((r, i) =>
            r.status === "fulfilled"
                ? r.value
                : ({ ...targets[i], fromCents: null, currency: "RON" } satisfies Deal),
        )
        // Cele cu preț găsit primele, sortate crescător.
        .sort((a, b) => {
            if (a.fromCents === null) return 1;
            if (b.fromCents === null) return -1;
            return a.fromCents - b.fromCents;
        });

if (process.env.REDIS_URL) {
    try {
      const redis = getRedis();
      await redis.set(cacheKey, JSON.stringify(deals), "EX", TTL_SECONDS);
    } catch (err) {
      logger.warn({ err }, "fly deals: cache write failed");
    }
    }

    return NextResponse.json({ origin, departDate, deals, cached: false });
}
