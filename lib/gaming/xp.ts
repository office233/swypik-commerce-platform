import { withTransaction } from "@/lib/db";
import { DAILY_XP_CAP } from "@/lib/gaming/config";

/**
 * Grants up to `rawXp` XP to the user, never exceeding DAILY_XP_CAP per day.
 * The daily counter row is locked (SELECT ... FOR UPDATE) so concurrent score
 * submissions cannot both read the same "already earned" value and overshoot
 * the cap. Returns the XP actually granted (0 once the cap is reached).
 */
export async function grantDailyCappedXp(
  userId: string,
  rawXp: number,
  profileUpsertSql: string,
): Promise<number> {
  if (rawXp <= 0) return 0;
  return withTransaction(async (q) => {
    await q(
      `INSERT INTO gaming_xp_daily (user_id, day, xp_earned) VALUES ($1, CURRENT_DATE, 0)
       ON CONFLICT (user_id, day) DO NOTHING`,
      [userId],
    );
    const { rows } = await q<{ xp_earned: number }>(
      `SELECT xp_earned FROM gaming_xp_daily WHERE user_id = $1 AND day = CURRENT_DATE FOR UPDATE`,
      [userId],
    );
    const alreadyEarnedToday = rows[0]?.xp_earned ?? 0;
    const earnedXp = Math.max(0, Math.min(rawXp, DAILY_XP_CAP - alreadyEarnedToday));
    if (earnedXp > 0) {
      await q(
        `UPDATE gaming_xp_daily SET xp_earned = xp_earned + $2 WHERE user_id = $1 AND day = CURRENT_DATE`,
        [userId, earnedXp],
      );
      await q(profileUpsertSql, [userId, earnedXp]);
    }
    return earnedXp;
  });
}
