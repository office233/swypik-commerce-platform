import { NextResponse } from "next/server";
import { selectRandomMysteryReward, canClaimDailyDrop } from "@/lib/mystery-drop/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { lastClaimedAt } = body;

    if (!canClaimDailyDrop(lastClaimedAt)) {
      return NextResponse.json({
        success: false,
        error: "Ai deschis deja cutia gratuită de azi! Revino mâine la ora 12:00 pentru un nou drop.",
        alreadyClaimed: true,
      }, { status: 429 });
    }

    const reward = selectRandomMysteryReward();
    const claimedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      reward,
      claimedAt,
      message: "Felicitări! Premiul a fost adăugat în contul tău Swypik.",
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
