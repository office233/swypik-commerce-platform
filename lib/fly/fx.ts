/**
 * FX pentru Swypik Fly — convertim prețurile furnizorilor (EUR/GBP/USD…) în
 * RON, ca tot ce vede și plătește clientul român să fie în lei.
 *
 * - Sursă: frankfurter.app (cursuri ECB, gratuit, fără cheie).
 * - Cache: memorie 6h + fallback Redis 24h + fallback static (dacă totul pică).
 * - Buffer de siguranță FLY_FX_BUFFER_PCT (default 1.5%) — acoperă fluctuația
 *   de curs între afișare și plata către furnizor, ca să nu vindem în pierdere.
 */
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

export const DISPLAY_CURRENCY = "RON";

// Fallback static (actualizat manual periodic) — doar dacă API + Redis pică.
const STATIC_RATES: Record<string, number> = {
    EUR: 4.97,
    GBP: 5.85,
    USD: 4.55,
    CHF: 5.2,
    RON: 1,
};

type RateTable = { rates: Record<string, number>; fetchedAt: number };
let memRates: RateTable | null = null;
const MEM_TTL_MS = 6 * 60 * 60 * 1000;
const REDIS_KEY = "fly:fx:ron";
const REDIS_TTL_S = 24 * 60 * 60;

function bufferMultiplier(): number {
    const pct = Number(process.env.FLY_FX_BUFFER_PCT ?? "1.5");
    return 1 + (Number.isFinite(pct) ? pct : 1.5) / 100;
}

async function fetchLiveRates(): Promise<Record<string, number> | null> {
    try {
        const r = await fetch("https://api.frankfurter.app/latest?from=RON&to=EUR,GBP,USD,CHF", {
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) return null;
        const j = (await r.json()) as { rates?: Record<string, number> };
        if (!j.rates) return null;
        // frankfurter dă RON→X; noi vrem X→RON, deci inversăm.
        const out: Record<string, number> = { RON: 1 };
        for (const [cur, v] of Object.entries(j.rates)) {
            if (v > 0) out[cur] = 1 / v;
        }
        return out;
    } catch (err) {
        logger.warn({ err }, "fly fx: live rate fetch failed");
        return null;
    }
}

async function getRates(): Promise<Record<string, number>> {
    if (memRates && Date.now() - memRates.fetchedAt < MEM_TTL_MS) return memRates.rates;

    const live = await fetchLiveRates();
    if (live) {
        memRates = { rates: live, fetchedAt: Date.now() };
        if (process.env.REDIS_URL) {
            try {
                await getRedis().set(REDIS_KEY, JSON.stringify(live), "EX", REDIS_TTL_S);
            } catch { /* non-fatal */ }
        }
        return live;
    }

    if (process.env.REDIS_URL) {
        try {
            const raw = await getRedis().get(REDIS_KEY);
            if (raw) {
                const cached = JSON.parse(raw) as Record<string, number>;
                memRates = { rates: cached, fetchedAt: Date.now() };
                return cached;
            }
        } catch { /* non-fatal */ }
    }

    logger.warn("fly fx: using STATIC fallback rates");
    return STATIC_RATES;
}

/**
 * Convertește cenți dintr-o monedă furnizor în bani (RON cents), cu buffer.
 * RON→RON trece nemodificat (fără buffer).
 */
export async function toRonCents(cents: number, currency: string): Promise<number> {
    const cur = currency.toUpperCase();
    if (cur === "RON") return cents;
    const rates = await getRates();
    const rate = rates[cur] ?? STATIC_RATES[cur];
    if (!rate) {
        logger.error({ currency: cur }, "fly fx: unknown currency, refusing conversion");
        throw new Error(`fx: unknown currency ${cur}`);
    }
    return Math.ceil(cents * rate * bufferMultiplier());
}
