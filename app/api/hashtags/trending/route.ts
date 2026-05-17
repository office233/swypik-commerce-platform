import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { rows } = await dbQuery(
      `SELECT name AS key, score
         FROM trending_now
        WHERE type = 'hashtag'
        ORDER BY score DESC NULLS LAST
        LIMIT 20`
    );
    return NextResponse.json({ hashtags: rows });
  } catch (e: any) {
    logger.error({ err: e }, "GET /api/hashtags/trending failed");
    return NextResponse.json({ hashtags: [] });
  }
}
