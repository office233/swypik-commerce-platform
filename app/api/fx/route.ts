/**
 * GET /api/fx — cursurile valutare curente pentru afișarea prețurilor în client.
 * Sursa: tabela fx_rates (populată zilnic de cron/refresh-fx). Răspunsul e
 * exprimat ca 1 RON -> X TARGET (formatul FX_RATES din lib/i18n/fx.ts).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const revalidate = 3600; // cache 1h — cursurile se schimbă zilnic

export async function GET() {
    try {
        const { rows } = await dbQuery<{ base: string; quote: string; rate: string }>(
            `SELECT base, quote, rate::text FROM fx_rates
              WHERE (base = 'RON') OR (quote = 'RON')`
        );
        const rates: Record<string, number> = { RON: 1 };
        for (const r of rows) {
            const rate = Number(r.rate);
            if (!Number.isFinite(rate) || rate <= 0) continue;
            if (r.base === "RON") rates[r.quote] = rate;
            else if (r.quote === "RON") rates[r.base] = 1 / rate;
        }
        return NextResponse.json({ base: "RON", rates });
    } catch {
        // Tabela poate lipsi în dev — clientul rămâne pe fallback-ul static.
        return NextResponse.json({ base: "RON", rates: { RON: 1 } });
    }
}
