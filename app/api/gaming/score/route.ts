import { NextRequest, NextResponse } from "next/server";
import { getOrCreateSocialUser } from "@/lib/social/session";
import { dbQuery } from "@/lib/db";
import { awardSwyp } from "@/lib/swyp/rewards";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ScorePayloadSchema = z.object({
  gameId: z.string().min(1),
  score: z.number().int().nonnegative(),
  durationMs: z.number().int().min(3000), // minim 3 secunde
});

export async function POST(req: NextRequest) {
  if (!isEnabled("gaming")) return frozenResponse("gaming");

  try {
    const session = await getOrCreateSocialUser();
    const userId = session?.userId;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = ScorePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error }, { status: 400 });
    }

    const { gameId, score, durationMs } = parsed.data;

    // 1. Înregistrare scor în DB
    await dbQuery(
      `INSERT INTO gaming_scores (user_id, game_id, score, duration_ms) VALUES ($1, $2, $3, $4)`,
      [userId, gameId, score, durationMs]
    );

    // 2. Calcul XP (+10 XP participare + bonus proportional cu scorul)
    const earnedXp = Math.min(100, Math.floor(score / 50) + 10);
    await dbQuery(
      `INSERT INTO gaming_user_profiles (user_id, xp_points, level)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id) DO UPDATE 
       SET xp_points = gaming_user_profiles.xp_points + $2,
           level = FLOOR(SQRT((gaming_user_profiles.xp_points + $2) / 100)) + 1,
           updated_at = now()`,
      [userId, earnedXp]
    );

    // 3. Recompense SWYP Coins (cu verificarea plafonului zilnic în ledger)
    let swypAwarded = false;
    try {
      const rewardResult = await awardSwyp({
        userId,
        action: "gaming_arcade_score",
        refId: `game_${gameId}_${Date.now()}`,
        metadata: { gameId, score, durationMs },
      });
      swypAwarded = rewardResult.awarded;
    } catch (e) {
      // Regula poate să nu fie activă în swyp_emission_rules sau daily cap atins
      console.warn("[Gaming Award Swyp]", e);
    }

    return NextResponse.json({
      ok: true,
      score,
      earnedXp,
      swypAwarded,
    });
  } catch (err: any) {
    console.error("[Gaming Score Error]", err);
    return NextResponse.json({ ok: false, error: err.message || "Failed to record score" }, { status: 500 });
  }
}
