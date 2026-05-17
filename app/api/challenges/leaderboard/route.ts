import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { rows } = await dbQuery(`
      SELECT ce.user_id,
             u.display_name,
             u.avatar_url,
             SUM(ce.score)::numeric AS total_score,
             COUNT(*)::int AS entries
        FROM challenge_entries ce
        JOIN users u ON u.id = ce.user_id
       GROUP BY ce.user_id, u.display_name, u.avatar_url
       ORDER BY total_score DESC
       LIMIT 50
    `);
    return NextResponse.json({ entries: rows });
  } catch (e: any) {
    logger.error({ err: e }, "GET /api/challenges/leaderboard failed");
    return NextResponse.json({ entries: [] });
  }
}
