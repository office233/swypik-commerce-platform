import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: challengeId } = await params;
    
    // Get challenge detail
    const challengeRes = await dbQuery(`
      SELECT dc.*, 
        (SELECT COUNT(*) FROM challenge_entries WHERE challenge_id = dc.id) AS entry_count
      FROM daily_challenges dc
      WHERE dc.id = $1
    `, [challengeId]);

    if (challengeRes.rows.length === 0) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }
    const challenge = challengeRes.rows[0];

    // Get leaderboard
    const leaderboardRes = await dbQuery(`
      SELECT ce.*, u.display_name, u.avatar_url,
        v.title AS video_title, v.thumbnail_url
      FROM challenge_entries ce
      JOIN users u ON ce.user_id = u.id
      LEFT JOIN videos v ON ce.video_id = v.id
      WHERE ce.challenge_id = $1
      ORDER BY ce.score DESC
      LIMIT 20
    `, [challengeId]);

    return NextResponse.json({ challenge, leaderboard: leaderboardRes.rows });
  } catch (error: any) {
    logger.error({ err: error }, "GET /api/challenges/[id] Error:");
    return NextResponse.json({ error: "Failed to fetch challenge" }, { status: 500 });
  }
}
