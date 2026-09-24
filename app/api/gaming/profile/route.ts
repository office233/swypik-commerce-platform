import { NextResponse } from "next/server";
import { getOrCreateSocialUser } from "@/lib/social/session";
import { dbQuery } from "@/lib/db";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/gaming/profile — real level/XP/today's-SWYP data for the header,
 * replacing the previously hardcoded "Lv. 3" / "+2.50 SWYP".
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

    const { rows: swypRows } = await dbQuery<{ amount_units: string }>(
      `SELECT COALESCE(SUM(amount_units), 0)::text AS amount_units
         FROM swyp_ledger_entries
        WHERE to_user_id = $1 AND kind = 'reward' AND created_at >= CURRENT_DATE
          AND ref_type IN ('reward:gaming_arcade_score', 'reward:gaming_trivia_daily')`,
      [userId],
    ).catch(() => ({ rows: [{ amount_units: "0" }] }));
    const swypUnitsToday = BigInt(swypRows[0]?.amount_units ?? "0");

    return NextResponse.json({
      ok: true,
      level: profile.level,
      xp: Number(profile.xp_points),
      triviaStreakDays: profile.trivia_streak_days,
      swypEarnedTodayUnits: swypUnitsToday.toString(),
    });
  } catch (err) {
    logger.error({ err }, "[gaming.profile] failed");
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
