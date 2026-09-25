import { NextResponse } from "next/server";
import { getDb, dbQuery } from "@/lib/db";
import {
  getOptionalSocialUserId,
  anonSessionErrorResponse,
  getOrCreateSocialUser,
  setAnonSessionCookie,
} from "@/lib/social/session";
import { notifyUser } from "@/lib/notifications/dispatch";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { ABUSE_LIMITS } from "@/lib/security/abuse-limits";
import { invalidIdResponse, isUuidParam } from "@/lib/validation/params";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: followingUserId } = await params;
    if (!isUuidParam(followingUserId)) return invalidIdResponse();
    // Limită per IP înainte de a crea identitatea anonimă (anti-umflare follower_count).
    const ipRl = await rateLimit("follow_ip", getClientIP(request), ABUSE_LIMITS.followPerIp);
    if (!ipRl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const session = await getOrCreateSocialUser();
    const currentUserId = session.userId;
    const rl = await rateLimit("userFollow", currentUserId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    if (currentUserId === followingUserId) {
      return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
    }

    // Ținta trebuie să existe și să fie activă (altfel 404, nu FK error → 500).
    const target = await dbQuery(
      `SELECT 1 FROM users WHERE id = $1 AND COALESCE(status, 'active') = 'active' LIMIT 1`,
      [followingUserId],
    );
    if (target.rows.length === 0) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
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
        const insertRes = await client.query(
          "INSERT INTO follows (follower_user_id, following_user_id) VALUES ($1, $2) ON CONFLICT (follower_user_id, following_user_id) DO NOTHING RETURNING id",
          [currentUserId, followingUserId]
        );
        // Dublu-click concurent: al doilea request nu insereaza (ON CONFLICT)
        // => nu spamam feed_events cu creator_followed duplicat.
        if (insertRes.rows.length > 0) {
          await client.query(
            `INSERT INTO feed_events (actor_user_id, event_type, audience, score, source, metadata)
             VALUES ($1, 'creator_followed', 'global', 3, 'next-follow', $2::jsonb)`,
            [currentUserId, JSON.stringify({ following_user_id: followingUserId })]
          );
        }
        following = true;
      }

      await client.query("COMMIT");

      // Fără notificări de la vizitatori anonimi („Guest" spam).
      if (following && !session.isAnon) {
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
    const anonErr = anonSessionErrorResponse(error);
    if (anonErr) return anonErr;
    logger.error({ err: error }, "[Follow API] POST Error:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: followingUserId } = await params;
    if (!isUuidParam(followingUserId)) return invalidIdResponse();
    const currentUserId = await getOptionalSocialUserId();

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
