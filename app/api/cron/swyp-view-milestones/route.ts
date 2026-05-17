/**
 * Cron: SWYP view milestones.
 *
 * For each video whose view_count crosses a milestone threshold (1k/10k/100k/1M)
 * and which has not yet received that milestone in `video_milestones`,
 * award the creator a fixed SWYP amount and emit an in-app notification.
 *
 * Auth: CRON_SECRET (Bearer / x-cron-secret / cron-secret header).
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { awardSwyp } from "@/lib/swyp/award";
import { notifyUser } from "@/lib/notifications/dispatch";
import { timingSafeEqual } from "crypto";
import { runCron } from "@/lib/cron/runCron";

export const dynamic = "force-dynamic";

const TIERS: Array<{ key: string; threshold: number; reward: number; label: string }> = [
  { key: "milestone_1k", threshold: 1_000, reward: 100, label: "1.000" },
  { key: "milestone_10k", threshold: 10_000, reward: 500, label: "10.000" },
  { key: "milestone_100k", threshold: 100_000, reward: 5_000, label: "100.000" },
  { key: "milestone_1m", threshold: 1_000_000, reward: 50_000, label: "1.000.000" },
];

async function authorize(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("cron-secret") ||
    req.headers.get("CRON_SECRET") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !token) return false;
  if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

async function handleGET(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const awards: Array<{ video_id: string; milestone: string; user_id: string; amount: number }> = [];
  let scanned = 0;

  for (const tier of TIERS) {
    const { rows } = await dbQuery<{ id: string; creator_id: string; title: string; view_count: string }>(
      `SELECT v.id, v.creator_id, v.title, v.view_count
         FROM videos v
        WHERE v.view_count >= $1
          AND v.creator_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM video_milestones m
             WHERE m.video_id = v.id AND m.milestone = $2
          )
        LIMIT 500`,
      [tier.threshold, tier.key],
    );
    scanned += rows.length;

    for (const v of rows) {
      try {
        // Reserve the milestone first (idempotent — race-safe via PK).
        const ins = await dbQuery(
          `INSERT INTO video_milestones (video_id, milestone)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING
           RETURNING video_id`,
          [v.id, tier.key],
        );
        if (ins.rowCount === 0) continue;

        const res = await awardSwyp(v.creator_id, tier.reward, "view_milestone", {
          video_id: v.id,
          milestone: tier.key,
          source_type: "video",
          source_id: v.id,
        });
        if (res.awarded) {
          awards.push({
            video_id: v.id,
            milestone: tier.key,
            user_id: v.creator_id,
            amount: tier.reward,
          });
          await notifyUser(v.creator_id, {
            type: "system",
            targetType: "video",
            targetId: v.id,
            payload: {
              title: "Felicitări!",
              body: `Videoul tău a depășit ${tier.label} vizualizări — +${tier.reward} SWYP`,
              url: `/video/${v.id}`,
              kind: "swyp_view_milestone",
              milestone: tier.key,
              amount: tier.reward,
            },
          }).catch(() => {});
        }
      } catch (err) {
        console.error("[swyp-view-milestones] award failed", v.id, tier.key, err);
      }
    }
  }

  return NextResponse.json({ ok: true, scanned, awarded: awards.length, awards });
}

export async function GET(req: Request) { return runCron("swyp-view-milestones", () => handleGET(req as any)); }
