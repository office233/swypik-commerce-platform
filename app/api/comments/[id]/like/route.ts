/**
 * GENERATED-CONSUMER-NOTE
 * Toggle like on a comment. Mirrors /api/videos/[id]/like (same likes table,
 * uses comment_id instead of video_id). Wired to components/social/CommentsSheet
 * (Heart button next to each comment).
 */
import { NextResponse } from "next/server";
import { getDb, dbQuery } from "@/lib/db";
import {
  getOptionalSocialUserId,
  getOrCreateSocialUser,
  setAnonSessionCookie,
} from "@/lib/social/session";
import { notifyUser } from "@/lib/notifications/dispatch";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/**
 * POST /api/comments/[id]/like — toggle like on a comment.
 * Mirrors the video like route (same `likes` table, `comment_id` column).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getOrCreateSocialUser();
    const userId = session.userId;
    const { id: commentId } = await params;

    const pool = getDb();
    const client = await pool.connect();
    let liked = false;
    let likeCount = 0;

    try {
      await client.query("BEGIN");

      const commentRes = await client.query(
        `SELECT id FROM comments
         WHERE id = $1 AND status = 'visible'
         FOR UPDATE`,
        [commentId],
      );
      if (commentRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
      }

      const checkRes = await client.query(
        `SELECT id FROM likes WHERE user_id = $1 AND comment_id = $2`,
        [userId, commentId],
      );

      if (checkRes.rows.length > 0) {
        await client.query(
          `DELETE FROM likes WHERE user_id = $1 AND comment_id = $2`,
          [userId, commentId],
        );
        const updateRes = await client.query(
          `UPDATE comments
             SET like_count = GREATEST(like_count - 1, 0),
                 updated_at = NOW()
           WHERE id = $1
           RETURNING like_count`,
          [commentId],
        );
        liked = false;
        likeCount = Number(updateRes.rows[0]?.like_count || 0);
      } else {
        await client.query(
          `INSERT INTO likes (user_id, comment_id) VALUES ($1, $2)`,
          [userId, commentId],
        );
        const updateRes = await client.query(
          `UPDATE comments
             SET like_count = like_count + 1,
                 updated_at = NOW()
           WHERE id = $1
           RETURNING like_count`,
          [commentId],
        );
        liked = true;
        likeCount = Number(updateRes.rows[0]?.like_count || 0);
      }

      await client.query("COMMIT");

      if (liked) {
        try {
          const { rows: crows } = await dbQuery<{ user_id: string; video_id: string }>(
            "SELECT user_id, video_id FROM comments WHERE id = $1",
            [commentId],
          );
          const author = crows[0]?.user_id;
          const vid = crows[0]?.video_id;
          if (author) {
            void notifyUser(author, {
              type: "like",
              actorUserId: userId,
              targetType: "comment",
              targetId: commentId,
              payload: { url: vid ? `/v/${vid}` : "/notifications" },
            }).catch(() => undefined);
          }
        } catch {
          // ignore
        }
      }

      const response = NextResponse.json({
        liked,
        like_count: likeCount,
        comment_id: commentId,
      });
      setAnonSessionCookie(response, session.anonSessionId);
      return response;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  } catch (error: any) {
    logger.error({ err: error }, "[Comment Like API] POST Error:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getOptionalSocialUserId();
    const { id: commentId } = await params;

    const [likeRes, commentRes] = await Promise.all([
      userId
        ? dbQuery(
            `SELECT id FROM likes WHERE user_id = $1 AND comment_id = $2`,
            [userId, commentId],
          )
        : Promise.resolve({ rows: [] as any[], rowCount: 0 }),
      dbQuery(`SELECT like_count FROM comments WHERE id = $1`, [commentId]),
    ]);

    const liked = likeRes.rows.length > 0;
    const likeCount = Number(commentRes.rows[0]?.like_count || 0);

    return NextResponse.json({ liked, like_count: likeCount });
  } catch (error: any) {
    logger.error({ err: error }, "[Comment Like API] GET Error:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
