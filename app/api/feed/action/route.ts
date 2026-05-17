import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOrCreateSocialUser, setAnonSessionCookie } from "@/lib/social/session";
import { applyFeedAction, recordFeedEvent, recordWatchEvent } from "@/lib/db/feed-prefs";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

type FeedAction =
  | "more_like_this"
  | "not_interested"
  | "follow_creator"
  | "unfollow";

const ALLOWED: ReadonlySet<FeedAction> = new Set([
  "more_like_this",
  "not_interested",
  "follow_creator",
  "unfollow",
]);

/**
 * POST /api/feed/action
 * Body: { video_id: string, action: 'more_like_this' | 'not_interested' | 'follow_creator' | 'unfollow' }
 * Response: 204 No Content on success
 *
 * For more_like_this / not_interested:
 *   - inserts into feed_events (REQUIRED for ranking)
 *   - inserts into user_watch_events (granular signal)
 *   - upserts user_interests (+5 / -3 on the video's primary topic)
 *   - not_interested also adds the video to user_hidden_videos
 *
 * For follow_creator / unfollow:
 *   - inserts into feed_events (creator_followed / creator_unfollowed)
 *   - resolves creator_id from videos table
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getOrCreateSocialUser();
    const userId = session.userId;

    const body = await req.json().catch(() => ({}));
    const videoId = typeof body.video_id === "string" ? body.video_id : null;
    const action = body.action as FeedAction | undefined;

    if (!videoId || !action || !ALLOWED.has(action)) {
      return NextResponse.json(
        { error: "Bad Request: video_id and action required" },
        { status: 400 },
      );
    }

    if (action === "more_like_this" || action === "not_interested") {
      await applyFeedAction({ userId, videoId, action });
    } else {
      // follow_creator / unfollow — resolve creator
      const { rows } = await dbQuery<{ creator_id: string | null }>(
        `SELECT creator_id FROM videos WHERE id = $1`,
        [videoId],
      );
      const creatorId = rows[0]?.creator_id ?? null;

      if (action === "follow_creator" && creatorId) {
        await dbQuery(
          `INSERT INTO follows (follower_user_id, following_user_id)
           VALUES ($1, $2)
           ON CONFLICT (follower_user_id, following_user_id) DO NOTHING`,
          [userId, creatorId],
        );
        await recordFeedEvent({
          userId,
          videoId,
          eventType: "creator_followed",
          metadata: { creator_id: creatorId },
          score: 3,
        });
        await recordWatchEvent({ userId, videoId, eventType: "follow" });
      } else if (action === "unfollow" && creatorId) {
        await dbQuery(
          `DELETE FROM follows WHERE follower_user_id = $1 AND following_user_id = $2`,
          [userId, creatorId],
        );
        await recordFeedEvent({
          userId,
          videoId,
          eventType: "creator_unfollowed",
          metadata: { creator_id: creatorId },
          score: -1,
        });
        await recordWatchEvent({ userId, videoId, eventType: "unfollow" });
      }
    }

    // 204 No Content — set anon cookie if newly minted
    const response = new NextResponse(null, { status: 204 });
    setAnonSessionCookie(response, session.anonSessionId);
    return response;
  } catch (err) {
    logger.error({ err: err }, "[Feed Action] error:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
