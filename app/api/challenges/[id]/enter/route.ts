import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { awardPoints } from "@/lib/rewards/engine";
import { getOptionalSocialUserId } from "@/lib/social/session";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

async function getUserId(): Promise<string | null> {
  return getOptionalSocialUserId();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: challengeId } = await params;
    const body = await request.json();
    const videoId = body.video_id || null;

    // Check challenge
    const { rows: challenges } = await dbQuery(`
      SELECT status, ends_at, max_entries, 
        (SELECT COUNT(*) FROM challenge_entries WHERE challenge_id = id) as current_entries
      FROM daily_challenges WHERE id = $1
    `, [challengeId]);

    if (challenges.length === 0) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    const challenge = challenges[0];
    if (challenge.status !== 'active') {
      return NextResponse.json({ error: "Challenge is not active" }, { status: 400 });
    }
    if (new Date(challenge.ends_at) < new Date()) {
      return NextResponse.json({ error: "Challenge has ended" }, { status: 400 });
    }
    if (challenge.max_entries && challenge.current_entries >= challenge.max_entries) {
      return NextResponse.json({ error: "Challenge is full" }, { status: 400 });
    }

    // Insert entry
    let entry;
    try {
      const { rows } = await dbQuery(`
        INSERT INTO challenge_entries (challenge_id, user_id, video_id, status, score)
        VALUES ($1, $2, $3, 'submitted', 0)
        RETURNING *
      `, [challengeId, userId, videoId]);
      entry = rows[0];
    } catch (e: any) {
      if (e.code === '23505') { // UNIQUE constraint violation
        return NextResponse.json({ error: "Already entered" }, { status: 400 });
      }
      throw e;
    }

    // Award Points
    let pointsAwarded = 0;
    try {
      const result = await awardPoints(userId, 'challenge_entry');
      pointsAwarded = result?.points || 0;
    } catch (e) {
      logger.error({ err: e }, "Failed to award points:");
    }

    return NextResponse.json({ entry, points_awarded: pointsAwarded });
  } catch (error: any) {
    logger.error({ err: error }, "POST /api/challenges/[id]/enter Error:");
    return NextResponse.json({ error: "Failed to enter challenge" }, { status: 500 });
  }
}
