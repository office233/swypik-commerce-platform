/**
 * SWYP award helper.
 *
 * Wraps swyp_wallets + wallet_transactions inserts in a SQL transaction.
 * 1 SWYP point == 1 cent (internal). Idempotent for kinds with metadata.order_id.
 */

import { getDb, dbQuery } from "@/lib/db";

export type AwardKind =
  | "view_milestone"
  | "creator_commission"
  | "buyer_cashback"
  | "daily_claim"
  | "purchase"
  | "admin_grant"
  | "referral"
  | "challenge";

const EARN_TYPES: Record<AwardKind, "earn" | "admin_grant"> = {
  view_milestone: "earn",
  creator_commission: "earn",
  buyer_cashback: "earn",
  daily_claim: "earn",
  purchase: "earn",
  admin_grant: "admin_grant",
  referral: "earn",
  challenge: "earn",
};

export type AwardResult = {
  awarded: boolean;
  reason?: "duplicate" | "invalid_amount";
  transactionId?: string;
  balance?: number;
};

export async function awardSwyp(
  userId: string,
  amount: number,
  kind: AwardKind,
  metadata: Record<string, unknown> = {},
): Promise<AwardResult> {
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    return { awarded: false, reason: "invalid_amount" };
  }
  const points = Math.round(amount);
  const pool = getDb();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Idempotency: per-order awards keyed by (kind, order_id, type-tag).
    const orderId = metadata.order_id ? String(metadata.order_id) : null;
    if (orderId) {
      const { rows: dup } = await client.query(
        `SELECT wt.id
           FROM wallet_transactions wt
           JOIN swyp_wallets w ON w.id = wt.wallet_id
          WHERE w.user_id = $1
            AND wt.reason = $2
            AND wt.metadata->>'order_id' = $3
            AND COALESCE(wt.metadata->>'type', '') = COALESCE($4::text, '')
          LIMIT 1`,
        [userId, kind, orderId, (metadata.type as string) || ""],
      );
      if (dup.length > 0) {
        await client.query("ROLLBACK");
        return { awarded: false, reason: "duplicate" };
      }
    }

    const { rows: walletRows } = await client.query(
      `INSERT INTO swyp_wallets (user_id, balance_points, lifetime_earned)
       VALUES ($1, $2, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET balance_points = swyp_wallets.balance_points + EXCLUDED.balance_points,
             lifetime_earned = swyp_wallets.lifetime_earned + EXCLUDED.lifetime_earned,
             updated_at = now()
       RETURNING id, balance_points`,
      [userId, points],
    );
    const walletId = walletRows[0].id;
    const balanceAfter = Number(walletRows[0].balance_points);

    const { rows: txRows } = await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, type, amount_points, balance_after, reason, source_type, source_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        walletId,
        EARN_TYPES[kind] || "earn",
        points,
        balanceAfter,
        kind,
        (metadata.source_type as string) || kind,
        (metadata.source_id as string) || null,
        JSON.stringify(metadata),
      ],
    );

    await client.query("COMMIT");
    return {
      awarded: true,
      transactionId: txRows[0].id,
      balance: balanceAfter,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function getBalance(userId: string): Promise<number> {
  const { rows } = await dbQuery<{ balance_points: string }>(
    `SELECT balance_points FROM swyp_wallets WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ? Number(rows[0].balance_points) : 0;
}

export async function getHistory(userId: string, limit = 20) {
  const { rows } = await dbQuery(
    `SELECT wt.id, wt.type, wt.amount_points, wt.balance_after, wt.reason,
            wt.source_type, wt.source_id, wt.metadata, wt.created_at
       FROM wallet_transactions wt
       JOIN swyp_wallets w ON w.id = wt.wallet_id
      WHERE w.user_id = $1
      ORDER BY wt.created_at DESC
      LIMIT $2`,
    [userId, Math.min(Math.max(limit, 1), 100)],
  );
  return rows;
}

/**
 * Streak claim: updates users.swyp_streak based on last daily_claim recency.
 * Returns the new streak value AND the award amount applied (10 + min(streak*5,40)).
 */
export async function claimDailyStreak(userId: string): Promise<{
  awarded: boolean;
  reason?: string;
  streak: number;
  amount: number;
}> {
  const pool = getDb();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: userRows } = await client.query(
      `SELECT swyp_streak, swyp_streak_last_claim_at
         FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    if (userRows.length === 0) {
      await client.query("ROLLBACK");
      return { awarded: false, reason: "no_user", streak: 0, amount: 0 };
    }
    const last: Date | null = userRows[0].swyp_streak_last_claim_at;
    const prevStreak = Number(userRows[0].swyp_streak || 0);
    const now = new Date();
    if (last) {
      const diffH = (now.getTime() - new Date(last).getTime()) / 36e5;
      if (diffH < 20) {
        await client.query("ROLLBACK");
        return { awarded: false, reason: "too_soon", streak: prevStreak, amount: 0 };
      }
    }
    let nextStreak: number;
    if (!last) nextStreak = 1;
    else {
      const diffH = (now.getTime() - new Date(last).getTime()) / 36e5;
      nextStreak = diffH <= 48 ? prevStreak + 1 : 1;
    }
    const amount = 10 + Math.min(nextStreak * 5, 40);
    await client.query(
      `UPDATE users SET swyp_streak = $2, swyp_streak_last_claim_at = now() WHERE id = $1`,
      [userId, nextStreak],
    );
    await client.query("COMMIT");
    const res = await awardSwyp(userId, amount, "daily_claim", {
      streak: nextStreak,
      claimed_at: now.toISOString(),
    });
    return { awarded: res.awarded, streak: nextStreak, amount };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
