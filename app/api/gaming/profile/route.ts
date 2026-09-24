import { NextResponse } from "next/server";
import { getOrCreateSocialUser } from "@/lib/social/session";
import { dbQuery } from "@/lib/db";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/gaming/profile — real level/XP data for the header, replacing
 * the previously hardcoded "Lv. 3" placeholder.
 */
export async function GET() {
  if (!isEnabled("gaming")) return frozenResponse("gaming");

  try {
    const session = await getOrCreateSocialUser();
    const userId = session?.userId;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { rows: profileRows } = await dbQuery<{ xp_points: string; level: number; trivia_streak_days: number }>(
      `SELECT xp_points::text, level, trivia_streak_days FROM gaming_user_profiles WHERE user_id = $1`,
      [userId],
    );
    const profile = profileRows[0] ?? { xp_points: "0", level: 1, trivia_streak_days: 0 };

    return NextResponse.json({
      ok: true,
      level: profile.level,
      xp: Number(profile.xp_points),
      triviaStreakDays: profile.trivia_streak_days,
    });
  } catch (err) {
    logger.error({ err }, "[gaming.profile] failed");
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
