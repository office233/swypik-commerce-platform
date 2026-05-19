/**
 * Daily missions for the current user.
 * GET  — auto-assigns up to 4 missions for today (idempotent) and returns them.
 * Also bumps the daily streak on each call (idempotent per day).
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  template_id: string;
  slug: string;
  title: string;
  description: string | null;
  kind: string;
  target: number;
  progress: number;
  reward_xp: number;
  reward_coins: number;
  reward_reputation: string;
  completed_at: string | null;
  claimed_at: string | null;
};

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    // Bump streak (idempotent per day) and assign up to 4 missions.
    await dbQuery(`SELECT wallet_bump_streak($1)`, [user.id]);
    await dbQuery(`SELECT daily_missions_assign($1, 4)`, [user.id]);

    const { rows } = await dbQuery<Row>(
      `SELECT m.id, m.template_id, t.slug, t.title, t.description, t.kind,
              m.target, m.progress, m.reward_xp, m.reward_coins,
              m.reward_reputation::text, m.completed_at, m.claimed_at
         FROM user_daily_missions m
         JOIN daily_mission_templates t ON t.id = m.template_id
        WHERE m.user_id = $1
          AND m.day = (now() AT TIME ZONE 'Europe/Bucharest')::date
        ORDER BY (m.claimed_at IS NOT NULL),
                 (m.completed_at IS NULL),
                 m.progress::numeric / NULLIF(m.target,0) DESC`,
      [user.id],
    );

    return NextResponse.json(
      {
        missions: rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          description: r.description,
          kind: r.kind,
          target: r.target,
          progress: r.progress,
          reward: {
            xp: r.reward_xp,
            coins: r.reward_coins,
            reputation: Number(r.reward_reputation),
          },
          status: r.claimed_at
            ? "claimed"
            : r.completed_at
              ? "ready"
              : "in_progress",
          completedAt: r.completed_at,
          claimedAt: r.claimed_at,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { missions: [], error: (err as Error).message },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
