import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";

export const dynamic = "force-dynamic";

async function getUserId(): Promise<string | null> {
  return getOptionalSocialUserId();
}

export async function GET() {
  try {
    const userId = await getUserId();
    
    // FETCH Active + Recent Challenges
    const { rows } = await dbQuery(`
      SELECT dc.*, 
        (SELECT COUNT(*) FROM challenge_entries WHERE challenge_id = dc.id) AS entry_count,
        (SELECT COUNT(*) FROM challenge_entries WHERE challenge_id = dc.id AND status = 'winner') AS winner_count
        ${userId ? `, EXISTS(SELECT 1 FROM challenge_entries WHERE challenge_id = dc.id AND user_id = $1) as user_entered` : ''}
      FROM daily_challenges dc
      WHERE dc.status = 'active' AND dc.ends_at > NOW()
      ORDER BY dc.featured DESC, dc.starts_at DESC
      LIMIT 20
    `, userId ? [userId] : []);

    return NextResponse.json({ challenges: rows });
  } catch (error: any) {
    console.error("GET /api/challenges Error:", error);
    return NextResponse.json({ error: "Failed to fetch challenges" }, { status: 500 });
  }
}
