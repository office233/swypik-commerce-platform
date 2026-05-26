import { NextRequest, NextResponse } from "next/server";
import { getDb, dbQuery } from "@/lib/db";
import { attachReplies, chooseCommentStatus, mapCommentRow, validateCommentText } from "@/lib/social/comments";
import { moderateText } from "@/lib/moderation/moderateText";
import { recordStrike, suspensionGuard } from "@/lib/moderation/strikes";
import { getOrCreateSocialUser, setAnonSessionCookie } from "@/lib/social/session";
import { notifyUser } from "@/lib/notifications/dispatch";
import { rateLimit } from "@/lib/security/rate-limit";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseLimit(value: string | null): number {
  return Math.min(parsePositiveInt(value, DEFAULT_LIMIT), MAX_LIMIT);
}

const COMMENT_SELECT = `
  c.id,
  c.video_id,
  c.user_id,
  c.parent_comment_id,
  c.body,
  c.status,
  c.like_count,
  c.reply_count,
  c.created_at,
  u.username,
  u.display_name,
  u.avatar_url
`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: videoId } = await params;
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const page = parsePositiveInt(request.nextUrl.searchParams.get("page"), 1);
    const offset = (page - 1) * limit;
    const parentCommentId = request.nextUrl.searchParams.get("parent_comment_id");

    if (parentCommentId) {
      const [{ rows }, countRes] = await Promise.all([
        dbQuery(
          `SELECT ${COMMENT_SELECT}
           FROM comments c
           LEFT JOIN users u ON u.id = c.user_id
           WHERE c.video_id = $1
             AND c.parent_comment_id = $2
             AND c.status = 'visible'
           ORDER BY c.created_at ASC
           LIMIT $3 OFFSET $4`,
          [videoId, parentCommentId, limit, offset],
        ),
        dbQuery(
          `SELECT COUNT(*) AS count
           FROM comments
           WHERE video_id = $1
             AND parent_comment_id = $2
             AND status = 'visible'`,
          [videoId, parentCommentId],
        ),
      ]);

      const totalCount = Number(countRes.rows[0]?.count || 0);
      return NextResponse.json({
        comments: rows.map(mapCommentRow),
        page,
        totalCount,
        hasMore: offset + rows.length < totalCount,
      });
    }

    const [{ rows: topLevelRows }, countRes] = await Promise.all([
      dbQuery(
        `SELECT ${COMMENT_SELECT}
         FROM comments c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.video_id = $1
           AND c.parent_comment_id IS NULL
           AND c.status = 'visible'
         ORDER BY c.created_at DESC
         LIMIT $2 OFFSET $3`,
        [videoId, limit, offset],
      ),
      dbQuery(
        `SELECT COUNT(*) AS count
         FROM comments
         WHERE video_id = $1
           AND parent_comment_id IS NULL
           AND status = 'visible'`,
        [videoId],
      ),
    ]);

    const topLevelIds = topLevelRows.map((row: any) => row.id);
    let replyRows: any[] = [];

    if (topLevelIds.length > 0) {
      const replies = await dbQuery(
        `SELECT *
         FROM (
           SELECT
             ${COMMENT_SELECT},
             ROW_NUMBER() OVER (PARTITION BY c.parent_comment_id ORDER BY c.created_at ASC) AS reply_rank
           FROM comments c
           LEFT JOIN users u ON u.id = c.user_id
           WHERE c.parent_comment_id = ANY($1::uuid[])
             AND c.status = 'visible'
         ) ranked_comments
         WHERE reply_rank <= 3
         ORDER BY parent_comment_id, created_at ASC`,
        [topLevelIds],
      );
      replyRows = replies.rows;
    }

    const totalCount = Number(countRes.rows[0]?.count || 0);
    return NextResponse.json({
      comments: attachReplies(topLevelRows, replyRows),
      page,
      totalCount,
      hasMore: offset + topLevelRows.length < totalCount,
    });
  } catch (error) {
    logger.error({ err: error }, "[Comments API] GET Error:");
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const pool = getDb();
  const client = await pool.connect();

  try {
    const { id: videoId } = await params;
    const body = await request.json().catch(() => null);
    const textResult = validateCommentText(body?.text ?? body?.body ?? body?.comment);

    if (!textResult.ok) {
      return NextResponse.json({ error: textResult.error }, { status: 400 });
    }

    const session = await getOrCreateSocialUser();

    const rl = await rateLimit("videoComment", session.userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const requestedParentCommentId =
      typeof body?.parent_comment_id === "string" && body.parent_comment_id.trim()
        ? body.parent_comment_id.trim()
        : null;
    const initialStatus = chooseCommentStatus(textResult.text);
    const moderation = moderateText(textResult.text, "comment");
    if (moderation.action === "reject") {
      if (session.userId) {
        void recordStrike({
          userId: session.userId,
          label: moderation.label === "blocked" ? "blocked" : "adult",
          context: "comment",
          refType: "video",
          refId: videoId,
          reason: moderation.message,
          reasons: moderation.reasons,
          signals: moderation.signals as Record<string, unknown>,
        });
      }
      return NextResponse.json(
        { error: moderation.message ?? "Conținut interzis.", reasons: moderation.reasons },
        { status: 422 },
      );
    }
    if (moderation.action === "hide" && session.userId) {
      void recordStrike({
        userId: session.userId,
        label: "adult",
        context: "comment",
        refType: "video",
        refId: videoId,
        reason: moderation.message,
        reasons: moderation.reasons,
        signals: moderation.signals as Record<string, unknown>,
      });
    }
    const status = moderation.action === "hide" ? "hidden" : initialStatus;
    let parentCommentId = requestedParentCommentId;
    let commentCount = 0;

    await client.query("BEGIN");

    const videoRes = await client.query(
      `SELECT id, comment_count
       FROM videos
       WHERE id = $1
         AND status = 'ready'
         AND visibility = 'public'
         AND EXISTS (SELECT 1 FROM video_effective_safety ves WHERE ves.video_id = videos.id AND ves.effective_label = 'safe')
       FOR UPDATE`,
      [videoId],
    );

    if (videoRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    commentCount = Number(videoRes.rows[0].comment_count || 0);

    if (requestedParentCommentId) {
      const parentRes = await client.query(
        `SELECT id, parent_comment_id
         FROM comments
         WHERE id = $1
           AND video_id = $2
           AND status = 'visible'
         FOR UPDATE`,
        [requestedParentCommentId, videoId],
      );

      if (parentRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }

      parentCommentId = parentRes.rows[0].parent_comment_id || parentRes.rows[0].id;
    }

    const inserted = await client.query(
      `WITH inserted AS (
         INSERT INTO comments (video_id, user_id, parent_comment_id, body, status, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING *
       )
       SELECT
         inserted.id,
         inserted.video_id,
         inserted.user_id,
         inserted.parent_comment_id,
         inserted.body,
         inserted.status,
         inserted.like_count,
         inserted.reply_count,
         inserted.created_at,
         u.username,
         u.display_name,
         u.avatar_url
       FROM inserted
       LEFT JOIN users u ON u.id = inserted.user_id`,
      [
        videoId,
        session.userId,
        parentCommentId,
        textResult.text,
        status,
        JSON.stringify({
          moderation: status === "flagged" ? "keyword_flagged" : "none",
          source: "next-comments",
        }),
      ],
    );

    if (status === "visible") {
      const countRes = await client.query(
        `UPDATE videos
         SET comment_count = comment_count + 1
         WHERE id = $1
         RETURNING comment_count`,
        [videoId],
      );
      commentCount = Number(countRes.rows[0]?.comment_count || commentCount + 1);

      if (parentCommentId) {
        await client.query(
          `UPDATE comments
           SET reply_count = reply_count + 1
           WHERE id = $1`,
          [parentCommentId],
        );
      }

      await client.query(
        `INSERT INTO feed_events (actor_user_id, video_id, comment_id, event_type, audience, score, source, metadata)
         VALUES ($1, $2, $3, 'comment_created', 'global', 7, 'next-comments', $4::jsonb)`,
        [
          session.userId,
          videoId,
          inserted.rows[0].id,
          JSON.stringify({ parent_comment_id: parentCommentId }),
        ],
      );
    }

    await client.query("COMMIT");

    if (status === "visible") {
      const newCommentId = inserted.rows[0].id;
      const bodyPreview = String(textResult.text || "").slice(0, 120);
      try {
        const { rows: vrows } = await dbQuery<{ creator_id: string }>(
          "SELECT creator_id FROM videos WHERE id = $1",
          [videoId],
        );
        const videoOwner = vrows[0]?.creator_id;
        if (videoOwner) {
          void notifyUser(videoOwner, {
            type: "comment",
            actorUserId: session.userId,
            targetType: "video",
            targetId: videoId,
            payload: { body: bodyPreview, url: `/v/${videoId}` },
          }).catch(() => undefined);
        }
        if (parentCommentId) {
          const { rows: prows } = await dbQuery<{ user_id: string }>(
            "SELECT user_id FROM comments WHERE id = $1",
            [parentCommentId],
          );
          const parentAuthor = prows[0]?.user_id;
          if (parentAuthor && parentAuthor !== videoOwner) {
            void notifyUser(parentAuthor, {
              type: "reply",
              actorUserId: session.userId,
              targetType: "comment",
              targetId: newCommentId,
              payload: { body: bodyPreview, url: `/v/${videoId}` },
            }).catch(() => undefined);
          }
        }
      } catch {
        // Notification failures must not block the comment.
      }
    }

    const response = NextResponse.json(
      {
        comment: mapCommentRow(inserted.rows[0]),
        comment_count: commentCount,
        moderation_status: status,
      },
      { status: 201 },
    );
    setAnonSessionCookie(response, session.anonSessionId);
    return response;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error({ err: error }, "[Comments API] POST Error:");
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  } finally {
    client.release();
  }
}

