import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function computeReward(prevStreak: number, withinStreakWindow: boolean): { amount: number; newStreak: number } {
  // Base 10 SWYP day1, +5 fiecare zi consecutivă, max 50.
  const newStreak = withinStreakWindow ? prevStreak + 1 : 1;
  const amount = Math.min(10 + (newStreak - 1) * 5, 50);
  return { amount, newStreak };
}

export async function POST() {
  const user = await getAuthUser();
  if (!user.userId) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const pool = getDb();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO swyp_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [user.userId],
    );

    const { rows } = await client.query<{
      id: string;
      balance_points: string;
      daily_claimed_at: string | null;
      daily_streak: number;
    }>(
      `SELECT id, balance_points, daily_claimed_at, daily_streak
         FROM swyp_wallets
        WHERE user_id = $1
        FOR UPDATE`,
      [user.userId],
    );
    const wallet = rows[0];
    if (!wallet) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "wallet_missing" }, { status: 500 });
    }

    const now = Date.now();
    const last = wallet.daily_claimed_at ? new Date(wallet.daily_claimed_at).getTime() : 0;
    const diff = now - last;

    if (last && diff < 24 * 3600 * 1000) {
      await client.query("ROLLBACK");
      const nextClaimAt = new Date(last + 24 * 3600 * 1000).toISOString();
      return NextResponse.json(
        { error: "already_claimed", nextClaimAt },
        { status: 429 },
      );
    }

    // Streak continuă dacă <48h de la ultimul claim. Altfel reset.
    const withinStreakWindow = last > 0 && diff < 48 * 3600 * 1000;
    const { amount, newStreak } = computeReward(wallet.daily_streak, withinStreakWindow);

    const newBalance = Number(wallet.balance_points) + amount;

    await client.query(
      `UPDATE swyp_wallets
          SET balance_points = balance_points + $2,
              lifetime_earned = lifetime_earned + $2,
              daily_claimed_at = now(),
              daily_streak = $3,
              updated_at = now()
        WHERE id = $1`,
      [wallet.id, amount, newStreak],
    );

    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, type, amount_points, balance_after, reason, source_type, metadata)
       VALUES ($1, 'earn', $2, $3, 'daily_claim', 'daily_claim', $4::jsonb)`,
      [wallet.id, amount, newBalance, JSON.stringify({ streak: newStreak })],
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      amount,
      newBalance,
      streak: newStreak,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: "internal", detail: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
