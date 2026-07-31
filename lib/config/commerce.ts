/**
 * Ratele comerciale ale platformei — configurabile prin env, cu default-uri
 * documentate într-un singur loc (înainte erau literale împrăștiate în cod:
 * order-router.ts avea 0.10, process-payouts avea 0.05).
 *
 * Valorile sunt exprimate în bps (basis points, 1% = 100 bps) pentru a evita
 * erorile de virgulă mobilă la calculele pe bani.
 */

function bpsFromEnv(name: string, defaultBps: number): number {
    const raw = process.env[name];
    if (!raw) return defaultBps;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) return defaultBps;
    return Math.round(parsed);
}

/** Comisionul platformei pe vânzările seller-ilor locali (default 10%). */
export const PLATFORM_COMMISSION_BPS = bpsFromEnv("PLATFORM_COMMISSION_BPS", 1000);

/** Comisionul creatorului din vânzările atribuite lui (default 5%). */
export const CREATOR_COMMISSION_BPS = bpsFromEnv("CREATOR_COMMISSION_BPS_RATE", 500);

/** Aplică un comision exprimat în bps pe o sumă în cenți (rotunjire bancară simplă). */
export function applyBps(amountCents: number, bps: number): number {
    return Math.round((amountCents * bps) / 10000);
}
