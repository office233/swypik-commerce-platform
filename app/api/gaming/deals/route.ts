import { NextResponse } from "next/server";
import { getFreeGames, getTopGameDeals } from "@/lib/gaming/deals";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isEnabled("gaming")) return frozenResponse("gaming");

  try {
    const [freeGames, deals] = await Promise.all([
      getFreeGames(),
      getTopGameDeals(),
    ]);

    return NextResponse.json({
      ok: true,
      freeGames,
      deals,
    });
  } catch (err) {
    logger.error({ err }, "[gaming.deals] failed");
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
