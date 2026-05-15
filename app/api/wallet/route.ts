import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

type WalletRow = {
  id: string;
  balance_points: string;
  lifetime_earned: string;
  lifetime_spent: string;
  daily_claimed_at: string | null;
  daily_streak: number;
};

type TxRow = {
  id: string;
  type: string;
  amount_points: string;
  balance_after: string;
  reason: string;
  source_type: string | null;
  created_at: string;
};

type ChallengeRow = {
  id: string;
  title: string;
  description: string | null;
  challenge_type: string;
  reward_points: number;
  ends_at: string;
};

export async function GET() {
  const user = await getAuthUser();
  if (!user.userId) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  await dbQuery(
    `INSERT INTO swyp_wallets (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.userId],
  );

  const { rows: walletRows } = await dbQuery<WalletRow>(
    `SELECT id, balance_points, lifetime_earned, lifetime_spent,
            daily_claimed_at, daily_streak
       FROM swyp_wallets WHERE user_id = $1`,
    [user.userId],
  );
  const wallet = walletRows[0];
  if (!wallet) {
    return NextResponse.json({ error: "wallet_missing" }, { status: 500 });
  }

  const { rows: txRows } = await dbQuery<TxRow>(
    `SELECT id, type, amount_points, balance_after, reason, source_type, created_at
       FROM wallet_transactions
      WHERE wallet_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [wallet.id],
  );

  const { rows: chRows } = await dbQuery<ChallengeRow>(
    `SELECT id, title, description, challenge_type, reward_points, ends_at
       FROM daily_challenges
      WHERE status = 'active' AND ends_at > now()
      ORDER BY featured DESC, starts_at DESC
      LIMIT 5`,
  );

  const lastClaim = wallet.daily_claimed_at ? new Date(wallet.daily_claimed_at) : null;
  const canClaim = !lastClaim || Date.now() - lastClaim.getTime() >= 24 * 3600 * 1000;
  const nextClaimAt = lastClaim && !canClaim
    ? new Date(lastClaim.getTime() + 24 * 3600 * 1000).toISOString()
    : null;

  return NextResponse.json({
    balance: Number(wallet.balance_points),
    lifetimeEarned: Number(wallet.lifetime_earned),
    lifetimeSpent: Number(wallet.lifetime_spent),
    dailyStreak: wallet.daily_streak,
    canClaim,
    nextClaimAt,
    transactions: txRows.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount_points),
      balanceAfter: Number(t.balance_after),
      reason: t.reason,
      sourceType: t.source_type,
      createdAt: t.created_at,
    })),
    challenges: chRows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      type: c.challenge_type,
      reward: c.reward_points,
      endsAt: c.ends_at,
    })),
  });
}
