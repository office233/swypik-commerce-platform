/**
 * GET/POST /api/cron/daily-maintenance — ORCHESTRATOR de mentenanță zilnică.
 * Protejat cu header x-cron-secret = env CRON_SECRET.
 *
 * Rulare (crontab, o dată pe zi la 04:15):
 *   15 4 * * * curl -s -o /dev/null -H "x-cron-secret: $CRON_SECRET" https://swypik.com/api/cron/daily-maintenance
 *
 * Rulează în serie joburile zilnice idempotente. Fiecare e izolat la erori —
 * un job picat NU le oprește pe celelalte. Înainte, singurul job programat
 * zilnic era retrogradarea founding drivers; restul endpoint-urilor existau
 * în cod dar nu le apela nimeni.
 */
import { NextResponse } from "next/server";
import { demoteInactiveFoundingDrivers } from "@/lib/drivers/tiers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = logger.child({ mod: "cron/daily-maintenance" });

/** Joburi delegate — apelate intern, cu același secret. */
const DAILY_JOBS = [
    "cleanup-tokens",       // tokene/sesiuni expirate + anonimizare IP (GDPR)
    "reconcile-wallets",    // integritate ledger
    "strikes-decay",        // expirare strikes moderare
    "suspend-unverified",   // selleri neverificați
    "abandoned-cart",       // emailuri coș abandonat
    "refresh-fx",           // cursuri valutare
    "aggregate-video-stats",
    "detect-trends",
] as const;

async function handle(req: Request) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("x-cron-secret") !== secret) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const results: Record<string, unknown> = {};

    // 1. Job istoric, inline.
    try {
        results["founding-demotion"] = { demoted: await demoteInactiveFoundingDrivers() };
    } catch (err) {
        log.error({ err }, "founding demotion failed");
        results["founding-demotion"] = { error: String((err as Error)?.message ?? err) };
    }

    // 2. Joburile delegate, în serie (evită vârf de DB la 4 dimineața).
    const base = process.env.CRON_INTERNAL_BASE || "http://127.0.0.1:3000";
    for (const job of DAILY_JOBS) {
        try {
            const r = await fetch(`${base}/api/cron/${job}`, {
                headers: { "x-cron-secret": secret },
                signal: AbortSignal.timeout(120000),
            });
            const body = await r.json().catch(() => ({}));
            results[job] = { status: r.status, ...body };
        } catch (err) {
            log.error({ err, job }, "daily job failed");
            results[job] = { error: String((err as Error)?.message ?? err) };
        }
    }

    const failed = Object.values(results).filter(
        (r: any) => r?.error || (typeof r?.status === "number" && r.status >= 400),
    ).length;
    log.info({ failed, total: Object.keys(results).length }, "daily maintenance done");
    return NextResponse.json({ success: failed === 0, failed, results });
}

export async function GET(req: Request) {
    return handle(req);
}
export async function POST(req: Request) {
    return handle(req);
}
