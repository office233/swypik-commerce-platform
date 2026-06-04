import { NextResponse } from "next/server";
import { getDb, dbQuery } from "@/lib/db";
import { getOptionalSocialUserId, getOrCreateSocialUser, setAnonSessionCookie } from "@/lib/social/session";
import { notifyUser } from "@/lib/notifications/dispatch";
import { rateLimit } from "@/lib/security/rate-limit";
import { isUuid } from "@/lib/validation/uuid";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOrCreateSocialUser();
    const currentUserId = session.userId;
    const rl = await rateLimit("userFollow", currentUserId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const { id: followingUserId } = await params;
    if (!isUuid(followingUserId)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    if (currentUserId === followingUserId) {
      return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
    }

    const pool = getDb();
    const client = await pool.connect();
    let following = false;

    try {
      await client.query("BEGIN");

      const checkRes = await client.query(
        "SELECT id FROM follows WHERE follower_user_id = $1 AND following_user_id = $2",
        [currentUserId, followingUserId]
      );

      if (checkRes.rows.length > 0) {
        // Unfollow
        await client.query(
          "DELETE FROM follows WHERE follower_user_id = $1 AND following_user_id = $2",
          [currentUserId, followingUserId]
        );
        following = false;
      } else {
        // Follow
        await client.query(
          "INSERT INTO follows (follower_user_id, following_user_id) VALUES ($1, $2)",
          [currentUserId, followingUserId]
        );
        await client.query(
          `INSERT INTO feed_events (actor_user_id, event_type, audience, score, source, metadata)
           VALUES ($1, 'creator_followed', 'global', 3, 'next-follow', $2::jsonb)`,
          [currentUserId, JSON.stringify({ following_user_id: followingUserId })]
        );
        following = true;
      }

      await client.query("COMMIT");

      if (following) {
        void notifyUser(followingUserId, {
          type: "follow",
          actorUserId: currentUserId,
          payload: { url: `/u/${currentUserId}` },
        }).catch(() => undefined);
      }

      // Get updated follower count
      const countRes = await client.query(
        "SELECT COUNT(*) FROM follows WHERE following_user_id = $1",
        [followingUserId]
      );
      const followerCount = parseInt(countRes.rows[0]?.count || "0", 10);

      const response = NextResponse.json({ following, follower_count: followerCount });
      setAnonSessionCookie(response, session.anonSessionId);
      return response;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error: any) {
    logger.error({ err: error }, "[Follow API] POST Error:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUserId = await getOptionalSocialUserId();
    const { id: followingUserId } = await params;
    if (!isUuid(followingUserId)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const [followRes, countRes] = await Promise.all([
      currentUserId
        ? dbQuery(
            "SELECT id FROM follows WHERE follower_user_id = $1 AND following_user_id = $2",
            [currentUserId, followingUserId]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
      dbQuery(
        "SELECT COUNT(*) FROM follows WHERE following_user_id = $1",
        [followingUserId]
      )
    ]);

    const following = followRes.rows.length > 0;
    const followerCount = parseInt(countRes.rows[0]?.count || "0", 10);

    return NextResponse.json({ following, follower_count: followerCount });
  } catch (error: any) {
    logger.error({ err: error }, "[Follow API] GET Error:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
