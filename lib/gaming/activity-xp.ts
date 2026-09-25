/**
 * XP for real platform actions, reconciled from facts already in the DB:
 *   - watch_daily:    >= XP_RULES.watchDaily.minViews video_view events today
 *   - first_upload:   the account has a public, ready video
 *   - first_purchase: the account has a paid/fulfilled order
 *
 * Reconciling on read (GET /api/gaming/profile) instead of hooking the
 * upload pipeline / Stripe webhook keeps gaming out of those critical paths;
 * awardXp() is idempotent, so calling this any number of times — or having
 * those paths call awardXp() directly later — can never double-grant.
 */
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { XP_RULES, type XpAction } from "./config";
import { xpDay } from "./level-math";
import { awardXp } from "./xp";

export const ONCE_REF = "once";

type ActivityFacts = { has_upload: boolean; has_purchase: boolean; views_today: number };

export type ActivityGrant = { action: XpAction; ref: string; xp: number };

/** Pure: which grants the facts justify, minus the ones already in the ledger. */
export function pendingActivityGrants(facts: ActivityFacts, alreadyClaimed: ReadonlySet<string>, day: string): ActivityGrant[] {
  const candidates: ActivityGrant[] = [];
  if (facts.has_upload) candidates.push({ action: "first_upload", ref: ONCE_REF, xp: XP_RULES.firstUpload.xp });
  if (facts.has_purchase) candidates.push({ action: "first_purchase", ref: ONCE_REF, xp: XP_RULES.firstPurchase.xp });
  if (facts.views_today >= XP_RULES.watchDaily.minViews) candidates.push({ action: "watch_daily", ref: day, xp: XP_RULES.watchDaily.xp });
  return candidates.filter((g) => !alreadyClaimed.has(`${g.action}:${g.ref}`));
}

export async function syncActivityXp(userId: string): Promise<number> {
  const day = xpDay();
  try {
    const { rows: claimed } = await dbQuery<{ action: string; ref: string }>(
      `SELECT action, ref FROM gaming_xp_events
        WHERE user_id = $1
          AND ((action IN ('first_upload', 'first_purchase') AND ref = $2) OR (action = 'watch_daily' AND ref = $3))`,
      [userId, ONCE_REF, day],
    );
    const claimedSet = new Set(claimed.map((r) => `${r.action}:${r.ref}`));
    if (claimedSet.size === 3) return 0;

    const { rows } = await dbQuery<ActivityFacts>(
      `SELECT
         EXISTS (SELECT 1 FROM videos WHERE creator_id = $1 AND status = 'ready' AND visibility = 'public') AS has_upload,
         EXISTS (SELECT 1 FROM commerce_orders WHERE buyer_user_id = $1 AND status IN ('paid', 'fulfilled')) AS has_purchase,
         (SELECT count(*)::int FROM feed_events
           WHERE actor_user_id = $1 AND event_type = 'video_view' AND occurred_at >= $2::date) AS views_today`,
      [userId, day],
    );
    const facts = rows[0];
    if (!facts) return 0;

    let total = 0;
    for (const grant of pendingActivityGrants({ ...facts, views_today: Number(facts.views_today) }, claimedSet, day)) {
      const res = await awardXp(userId, grant.action, grant.ref, grant.xp);
      total += res.awarded;
    }
    return total;
  } catch (err) {
    // Best-effort: a failed reconcile must never break the profile read.
    logger.warn({ err, userId }, "[gaming.xp] activity sync failed");
    return 0;
  }
}
