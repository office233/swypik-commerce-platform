import { NextRequest, NextResponse } from "next/server";
import { getFreeGames, getTopGameDeals } from "@/lib/gaming/deals";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
