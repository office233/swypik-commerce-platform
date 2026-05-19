/**
 * Claim a completed daily mission. Awards XP + Swyp Coins + Reputation
 * atomically through wallet_apply (which writes the ledger).
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  try {
    // Lock + validate the mission belongs to the user, is completed, and not yet claimed.
    const { rows } = await dbQuery<{
      id: string;
      reward_xp: number;
      reward_coins: number;
      reward_reputation: string;
    }>(
      `UPDATE user_daily_missions
          SET claimed_at = now()
        WHERE id = $1
          AND user_id = $2
          AND completed_at IS NOT NULL
          AND claimed_at IS NULL
        RETURNING id, reward_xp, reward_coins, reward_reputation::text`,
      [id, user.id],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "not_claimable", reason: "Mission is either incomplete, already claimed, or not yours." },
        { status: 409 },
      );
    }

    const m = rows[0];

    if (m.reward_xp > 0) {
      await dbQuery(`SELECT wallet_apply($1, 'xp', $2, 'mission_claim', 'mission', $3)`, [user.id, m.reward_xp, m.id]);
    }
    if (m.reward_coins > 0) {
      await dbQuery(`SELECT wallet_apply($1, 'coins', $2, 'mission_claim', 'mission', $3)`, [user.id, m.reward_coins, m.id]);
    }
    if (Number(m.reward_reputation) !== 0) {
      await dbQuery(`SELECT wallet_apply($1, 'reputation', $2::numeric, 'mission_claim', 'mission', $3)`, [
        user.id,
        m.reward_reputation,
        m.id,
      ]);
    }

    const { rows: walletRows } = await dbQuery<{ xp: string; coins: number; reputation: string; level: number }>(
      `SELECT xp::text, coins, reputation::text, level FROM user_wallets WHERE user_id = $1`,
      [user.id],
    );

    return NextResponse.json({
      ok: true,
      awarded: {
        xp: m.reward_xp,
        coins: m.reward_coins,
        reputation: Number(m.reward_reputation),
      },
      wallet: walletRows[0]
        ? {
            xp: Number(walletRows[0].xp),
            coins: walletRows[0].coins,
            reputation: Number(walletRows[0].reputation),
            level: walletRows[0].level,
          }
        : null,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
