import { NextResponse } from "next/server";
import { getDb, dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { notifyUser } from "@/lib/notifications/dispatch";
import { logger } from "@/lib/logger";
import { UUID_RE } from "@/lib/validation/uuid";
import { rateLimit } from "@/lib/security/rate-limit";
import { isVideoInteractableTx } from "@/lib/video/interactable";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "auth_required" }, { status: 401 });
    }
    const userId = session.userId;
    const { id: videoId } = await params;
    if (!UUID_RE.test(videoId)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

    const rl = await rateLimit("videoLike", userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const pool = getDb();
    const client = await pool.connect();
    let liked = false;
    let likeCount = 0;

    try {
      await client.query("BEGIN");

      const checkRes = await client.query(
        "SELECT id FROM likes WHERE user_id = $1 AND video_id = $2",
        [userId, videoId]
      );

      if (checkRes.rows.length > 0) {
        await client.query(
          "DELETE FROM likes WHERE user_id = $1 AND video_id = $2",
          [userId, videoId]
        );
        const updateRes = await client.query(
          "UPDATE videos SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1 RETURNING like_count",
          [videoId]
        );
        liked = false;
        likeCount = parseInt(updateRes.rows[0]?.like_count || "0", 10);
      } else {
        // P2-01: like NOU doar pe conținut încă vizibil. Unlike-ul (ramura de
        // mai sus) rămâne permis indiferent de starea curentă a videoclipului.
        if (!(await isVideoInteractableTx(client, videoId))) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "video_not_available" }, { status: 404 });
        }
        const insertRes = await client.query(
          "INSERT INTO likes (user_id, video_id) VALUES ($1, $2) ON CONFLICT (user_id, video_id) WHERE video_id IS NOT NULL DO NOTHING RETURNING id",
          [userId, videoId]
        );
        // Dublu-click concurent: al doilea request nu insereaza (ON CONFLICT) =>
        // nu incrementam de doua ori si nu spamam feed_events.
        if (insertRes.rows.length > 0) {
          const updateRes = await client.query(
            "UPDATE videos SET like_count = like_count + 1 WHERE id = $1 RETURNING like_count",
            [videoId]
          );
          await client.query(
            `INSERT INTO feed_events (actor_user_id, video_id, event_type, audience, score, source, metadata)
             VALUES ($1, $2, 'video_liked', 'global', 5, 'next-like', '{}'::jsonb)`,
            [userId, videoId]
          );
          likeCount = parseInt(updateRes.rows[0]?.like_count || "0", 10);
        } else {
          const curRes = await client.query(
            "SELECT like_count FROM videos WHERE id = $1",
            [videoId]
          );
          likeCount = parseInt(curRes.rows[0]?.like_count || "0", 10);
        }
        liked = true;
      }

      await client.query("COMMIT");

      if (liked) {
        const { rows: vrows } = await dbQuery<{ creator_id: string }>(
          "SELECT creator_id FROM videos WHERE id = $1",
          [videoId],
        );
        const recipient = vrows[0]?.creator_id;
        if (recipient && recipient !== userId) {
          void notifyUser(recipient, {
            type: "like",
            actorUserId: userId,
            targetType: "video",
            targetId: videoId,
            payload: { url: `/v/${videoId}` },
          }).catch(() => undefined);
        }
      }

      return NextResponse.json({ liked, like_count: likeCount });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error: any) {
    logger.error({ err: error }, "[Like API] POST Error:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    const userId = session?.userId || null;
    const { id: videoId } = await params;
    if (!UUID_RE.test(videoId)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

    const [likeRes, videoRes] = await Promise.all([
      userId
        ? dbQuery("SELECT id FROM likes WHERE user_id = $1 AND video_id = $2", [userId, videoId])
        : Promise.resolve({ rows: [], rowCount: 0 }),
      dbQuery("SELECT like_count FROM videos WHERE id = $1", [videoId])
    ]);

    const liked = likeRes.rows.length > 0;
    const likeCount = parseInt(videoRes.rows[0]?.like_count || "0", 10);

    return NextResponse.json({ liked, like_count: likeCount });
  } catch (error: any) {
    logger.error({ err: error }, "[Like API] GET Error:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
