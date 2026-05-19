/**
 * Current user wallet snapshot: XP, level, coins, reputation, streak.
 * No coin grants here — those flow through wallet_apply on real actions.
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    // Ensure wallet row exists (idempotent).
    await dbQuery(
      `INSERT INTO user_wallets(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [user.id],
    );

    const { rows } = await dbQuery<{
      xp: string;
      coins: number;
      reputation: string;
      level: number;
      streak_current: number;
      streak_best: number;
      last_active_day: string | null;
      total_xp_earned: string;
      total_coins_earned: number;
      total_coins_spent: number;
    }>(
      `SELECT xp::text, coins, reputation::text, level,
              streak_current, streak_best, last_active_day,
              total_xp_earned::text, total_coins_earned, total_coins_spent
         FROM user_wallets WHERE user_id = $1`,
      [user.id],
    );

    const w = rows[0];
    const xp = Number(w.xp);
    // Same formula as in wallet_apply: level = floor(sqrt(xp/100)).
    const xpForNextLevel = Math.pow(w.level, 2) * 100;
    const xpForCurrentLevel = Math.pow(w.level - 1, 2) * 100;
    const progressPct =
      xpForNextLevel > xpForCurrentLevel
        ? Math.min(100, Math.round(((xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100))
        : 0;

    return NextResponse.json(
      {
        xp,
        coins: w.coins,
        reputation: Number(w.reputation),
        level: w.level,
        progressPct,
        xpToNext: Math.max(0, xpForNextLevel - xp),
        streak: { current: w.streak_current, best: w.streak_best, lastActiveDay: w.last_active_day },
        totals: {
          xpEarned: Number(w.total_xp_earned),
          coinsEarned: w.total_coins_earned,
          coinsSpent: w.total_coins_spent,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
