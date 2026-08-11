/**
 * GET /api/founding-slots — sloturile rămase pentru programul Founding Drivers.
 * Public (alimentează contorul de pe /join). Cache 60s.
 */
import { NextResponse } from "next/server";
import { getTierSlots, getTierParams, TIER_COMMISSION_PCT } from "@/lib/drivers/tiers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [slots, tierParams] = await Promise.all([getTierSlots(), getTierParams()]);
    return NextResponse.json(
      {
        slots,
        tiers: TIER_COMMISSION_PCT,
        promo_days: tierParams.promoDays,
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    logger.error({ err }, "[founding-slots] failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
