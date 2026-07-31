/**
 * GET /api/swyp/rate — cursul REAL al SWYP, derivat din fondul de acoperire.
 *
 * curs = fond (RON din comisioane încasate) / SWYP aflate la utilizatori.
 * Fără tranzacții reale → fond 0 → curs 0. Public, cache 30s.
 */
import { NextResponse } from "next/server";
import { getSwypRate, formatRonPerSwyp, UNITS_PER_SWYP } from "@/lib/swyp/valuation";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rate = await getSwypRate();
    const { rows } = await dbQuery<{
      total_in_cents: string;
      total_out_cents: string;
      updated_at: string;
    }>(`SELECT total_in_cents, total_out_cents, updated_at FROM swyp_backing_fund WHERE id = 1`);

    return NextResponse.json(
      {
        ron_per_swyp: formatRonPerSwyp(rate),
        backing_cents: rate.backing_cents.toString(),
        circulating_swyp: (rate.circulating_units / UNITS_PER_SWYP).toString(),
        circulating_units: rate.circulating_units.toString(),
        total_in_cents: rows[0]?.total_in_cents ?? "0",
        total_out_cents: rows[0]?.total_out_cents ?? "0",
        updated_at: rows[0]?.updated_at ?? null,
        backed: rate.rate_microcents_per_unit > 0n,
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  } catch (err) {
    logger.error({ err }, "[swyp/rate] failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
