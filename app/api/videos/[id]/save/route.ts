import { NextResponse } from "next/server";
import { getDb, dbQuery } from "@/lib/db";
import { getOptionalSocialUserId, getOrCreateSocialUser, setAnonSessionCookie } from "@/lib/social/session";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

function normalizeCollectionName(value: unknown): string {
  if (typeof value !== "string") return "default";
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 48) || "default";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOrCreateSocialUser();
    const userId = session.userId;
    const { id: videoId } = await params;
    
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      // Body is optional
    }
    const collectionName = normalizeCollectionName(body.collection_name);

    const pool = getDb();
    const client = await pool.connect();
    
    let saved = false;
    let saveCount = 0;

    try {
      await client.query("BEGIN");

      const checkRes = await client.query(
        "SELECT id FROM saves WHERE user_id = $1 AND video_id = $2 AND collection_name = $3",
        [userId, videoId, collectionName]
      );

      if (checkRes.rows.length > 0) {
        // Exists -> DELETE
        await client.query(
          "DELETE FROM saves WHERE user_id = $1 AND video_id = $2 AND collection_name = $3",
          [userId, videoId, collectionName]
        );
        const countRes = await client.query(
          "UPDATE videos SET save_count = GREATEST(save_count - 1, 0) WHERE id = $1 RETURNING save_count",
          [videoId]
        );
        // Decrement user_collections.item_count if it exists
        await client.query(
          `UPDATE user_collections 
           SET item_count = GREATEST(item_count - 1, 0) 
           WHERE user_id = $1 AND slug = $2`,
          [userId, collectionName]
        );
        saved = false;
        saveCount = parseInt(countRes.rows[0]?.save_count || "0", 10);
      } else {
        // Not exists -> INSERT
        await client.query(
          "INSERT INTO saves (user_id, video_id, collection_name) VALUES ($1, $2, $3)",
          [userId, videoId, collectionName]
        );
        const countRes = await client.query(
          "UPDATE videos SET save_count = save_count + 1 WHERE id = $1 RETURNING save_count",
          [videoId]
        );
        // Increment user_collections.item_count if it exists
        await client.query(
          `UPDATE user_collections 
           SET item_count = item_count + 1 
           WHERE user_id = $1 AND slug = $2`,
          [userId, collectionName]
        );
        await client.query(
          `INSERT INTO feed_events (actor_user_id, video_id, event_type, audience, score, source, metadata)
           VALUES ($1, $2, 'video_saved', 'global', 4, 'next-save', $3::jsonb)`,
          [userId, videoId, JSON.stringify({ collection_name: collectionName })]
        );
        saved = true;
        saveCount = parseInt(countRes.rows[0]?.save_count || "0", 10);
      }

      await client.query("COMMIT");

      const response = NextResponse.json({ saved, collection_name: collectionName, save_count: saveCount });
      setAnonSessionCookie(response, session.anonSessionId);
      return response;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error: any) {
    logger.error({ err: error }, "[Save API] POST Error:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getOptionalSocialUserId();
    const { id: videoId } = await params;

    const [savesRes, videoRes] = await Promise.all([
      userId
        ? dbQuery(
            "SELECT collection_name FROM saves WHERE user_id = $1 AND video_id = $2",
            [userId, videoId]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
      dbQuery("SELECT save_count FROM videos WHERE id = $1", [videoId])
    ]);

    const collections = savesRes.rows.map((r: any) => r.collection_name);
    const saved = collections.length > 0;
    const saveCount = parseInt(videoRes.rows[0]?.save_count || "0", 10);

    return NextResponse.json({ saved, collections, save_count: saveCount });
  } catch (error: any) {
    logger.error({ err: error }, "[Save API] GET Error:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
