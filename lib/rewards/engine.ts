import { dbQuery } from "@/lib/db";

export interface RewardEvent {
  id: string;
  user_id: string;
  rule_id: string;
  action: string;
  points_awarded: number;
  transaction_id: string | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  description?: string;
}

export async function awardPoints(
  userId: string,
  action: string,
  sourceType?: string,
  sourceId?: string
): Promise<{ awarded: boolean; points: number; balance: number; reason?: string }> {
  try {
    const rulesResult = await dbQuery(
      `SELECT * FROM reward_rules WHERE action = $1 AND is_active = true`,
      [action]
    );

    if (rulesResult.rows.length === 0) {
      return { awarded: false, points: 0, balance: 0, reason: "Rule not found" };
    }

    const rule = rulesResult.rows[0];

    if (rule.cooldown_minutes > 0) {
      const cooldownResult = await dbQuery(
        `SELECT id FROM reward_events 
         WHERE user_id = $1 AND action = $2 AND created_at > NOW() - INTERVAL '1 minute' * $3 
         LIMIT 1`,
        [userId, action, rule.cooldown_minutes]
      );
      if (cooldownResult.rows.length > 0) {
        return { awarded: false, points: 0, balance: 0, reason: "Cooldown active" };
      }
    }

    if (rule.daily_limit > 0) {
      const dailyResult = await dbQuery(
        `SELECT COUNT(*) as count FROM reward_events 
         WHERE user_id = $1 AND action = $2 AND created_at::date = CURRENT_DATE`,
        [userId, action]
      );
      if (parseInt(dailyResult.rows[0].count, 10) >= rule.daily_limit) {
        return { awarded: false, points: 0, balance: 0, reason: "Daily limit reached" };
      }
    }

    await dbQuery(
      `INSERT INTO swyp_wallets (user_id, balance_points, locked_points, lifetime_earned, lifetime_spent)
       VALUES ($1, 0, 0, 0, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    const updateWalletResult = await dbQuery(
      `UPDATE swyp_wallets 
       SET balance_points = balance_points + $2, 
           lifetime_earned = lifetime_earned + $2,
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING balance_points`,
      [userId, rule.points]
    );
    
    const balanceAfter = updateWalletResult.rows[0].balance_points;

    const txResult = await dbQuery(
      `INSERT INTO wallet_transactions 
        (wallet_id, type, amount_points, balance_after, reason, source_type, source_id)
       SELECT id, 'earn', $2, $3, $4, $5, $6
       FROM swyp_wallets WHERE user_id = $1
       RETURNING id`,
      [userId, rule.points, balanceAfter, rule.description, sourceType || null, sourceId || null]
    );

    const transactionId = txResult.rows[0].id;

    await dbQuery(
      `INSERT INTO reward_events 
        (user_id, rule_id, action, points_awarded, transaction_id, source_type, source_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, rule.id, action, rule.points, transactionId, sourceType || null, sourceId || null]
    );

    if (rule.lock_days > 0) {
      await dbQuery(
        `UPDATE swyp_wallets 
         SET locked_points = locked_points + $2,
             balance_points = balance_points - $2
         WHERE user_id = $1`,
        [userId, rule.points]
      );
      
      const newBalanceAfterLockResult = await dbQuery(
        `SELECT balance_points FROM swyp_wallets WHERE user_id = $1`,
        [userId]
      );
      const newBalanceAfterLock = newBalanceAfterLockResult.rows[0].balance_points;

      await dbQuery(
        `INSERT INTO wallet_transactions 
          (wallet_id, type, amount_points, balance_after, reason, source_type, source_id)
         SELECT id, 'lock', $2, $3, $4, $5, $6
         FROM swyp_wallets WHERE user_id = $1`,
        [userId, rule.points, newBalanceAfterLock, `Locked for ${rule.lock_days} days`, sourceType || null, sourceId || null]
      );
    }

    const finalBalanceResult = await dbQuery(
        `SELECT balance_points FROM swyp_wallets WHERE user_id = $1`,
        [userId]
    );
    const finalBalance = finalBalanceResult.rows[0].balance_points;

    return { awarded: true, points: rule.points, balance: finalBalance };
  } catch (error) {
    console.error("Error awarding points:", error);
    return { awarded: false, points: 0, balance: 0, reason: "Internal error" };
  }
}

export async function getWalletBalance(userId: string): Promise<{ balance_points: number; locked_points: number; lifetime_earned: number }> {
  let result = await dbQuery(
    `SELECT balance_points, locked_points, lifetime_earned 
     FROM swyp_wallets WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    await dbQuery(
      `INSERT INTO swyp_wallets (user_id, balance_points, locked_points, lifetime_earned, lifetime_spent)
       VALUES ($1, 0, 0, 0, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    return { balance_points: 0, locked_points: 0, lifetime_earned: 0 };
  }

  return { 
    balance_points: Number(result.rows[0].balance_points) || 0, 
    locked_points: Number(result.rows[0].locked_points) || 0, 
    lifetime_earned: Number(result.rows[0].lifetime_earned) || 0 
  };
}

export async function getRewardHistory(userId: string, limit: number): Promise<RewardEvent[]> {
  const result = await dbQuery(
    `SELECT re.*, rr.description 
     FROM reward_events re 
     LEFT JOIN reward_rules rr ON re.rule_id = rr.id
     WHERE re.user_id = $1 
     ORDER BY re.created_at DESC 
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}
