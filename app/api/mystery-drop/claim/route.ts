import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { selectRandomMysteryReward, canClaimDailyDrop } from "@/lib/mystery-drop/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session || !session.userId) {
      return NextResponse.json({
        success: false,
        requireAuth: true,
        error: "Trebuie să ai un cont Swypik pentru a primi premiul și reducerile!",
      }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { lastClaimedAt } = body;

    if (!canClaimDailyDrop(lastClaimedAt)) {
      return NextResponse.json({
        success: false,
        error: "Ai deschis deja cutia gratuită de azi! Revino mâine pentru un nou drop.",
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
