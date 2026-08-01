/**
 * GET /api/swyp/earn-rules — regulile de câștig SWYP, direct din DB.
 *
 * Zero hardcodări în UI: sumele afișate în /pay ("cum câștigi") vin de aici,
 * deci o schimbare în swyp_emission_rules se vede imediat, fără redeploy.
 * Public, cache 60s. Returnează doar regulile active.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { UNITS_PER_SWYP } from "@/lib/swyp/valuation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Etichete UI per acțiune. Sumele NU sunt aici — vin din DB. */
const LABELS: Record<string, { label: string; unit: string }> = {
    go_ride_completed: { label: "Curse Swypik Go", unit: "/cursă" },
    eats_delivery_on_time: { label: "Livrări la timp", unit: "/livrare" },
    creator_1k_views: { label: "Clipuri virale", unit: "/1k vizionări" },
    order_review: { label: "Recenzii după comandă", unit: "" },
    referral_validated: { label: "Invită un prieten", unit: "" },
    clip_conversion: { label: "Clip care vinde", unit: "" },
    seller_first_sales: { label: "Primele vânzări", unit: "" },
    mining_daily: { label: "Mining zilnic", unit: "/zi" },
};

/** Ordinea de afișare în UI (restul, alfabetic după etichetă). */
const DISPLAY_ORDER = [
    "go_ride_completed",
    "eats_delivery_on_time",
    "creator_1k_views",
    "order_review",
];

export async function GET() {
    try {
        const { rows } = await dbQuery<{
            action: string;
            amount_units: string;
            pct_of_value_bps: number | null;
        }>(
            `SELECT action, amount_units::text, pct_of_value_bps
         FROM swyp_emission_rules
        WHERE enabled = true
        ORDER BY action`,
        );

        const rules = rows
            .filter((r) => LABELS[r.action])
            .map((r) => {
                const swyp = Number(BigInt(r.amount_units)) / Number(UNITS_PER_SWYP);
                const meta = LABELS[r.action];
                return {
                    action: r.action,
                    label: meta.label,
                    amountSwyp: swyp,
                    /** Text gata de afișat, ex. "+20 SWYP/cursă". */
                    display: `+${swyp % 1 === 0 ? swyp : swyp.toFixed(2)} SWYP${meta.unit}`,
                    pctOfValueBps: r.pct_of_value_bps,
                };
            })
            .sort((a, b) => {
                const ia = DISPLAY_ORDER.indexOf(a.action);
                const ib = DISPLAY_ORDER.indexOf(b.action);
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;
                return a.label.localeCompare(b.label, "ro");
            });

        return NextResponse.json(
            { success: true, rules },
            { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
        );
    } catch (err) {
        logger.error({ err }, "[swyp/earn-rules] failed");
        return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
    }
}
