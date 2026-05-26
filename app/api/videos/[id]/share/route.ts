import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import crypto from "crypto";
import { getOrCreateSocialUser, setAnonSessionCookie } from "@/lib/social/session";
import { rateLimit } from "@/lib/security/rate-limit";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOrCreateSocialUser();
    const userId = session.userId;
    const { id: videoId } = await params;

    const rl = await rateLimit("videoShare", userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {}

    const validChannels = ['copy_link', 'native_share', 'email', 'sms', 'whatsapp', 'facebook', 'instagram', 'tiktok', 'x', 'other'];
    const channel = validChannels.includes(body.channel) ? body.channel : 'other';
    const referrerUrl = typeof body.referrer_url === "string" ? body.referrer_url.slice(0, 500) : null;
    const destinationUrl = typeof body.destination_url === "string" ? body.destination_url.slice(0, 500) : null;
    
    const shareToken = crypto.randomBytes(6).toString("hex");

    const pool = getDb();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO shares (user_id, video_id, channel, share_token, destination_url, referrer_url, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [userId, videoId, channel, shareToken, destinationUrl, referrerUrl, JSON.stringify({ source: "next-share" })]
      );

      const countRes = await client.query(
        "UPDATE videos SET share_count = share_count + 1 WHERE id = $1 RETURNING share_count",
        [videoId]
      );
      const shareCount = parseInt(countRes.rows[0]?.share_count || "0", 10);

      await client.query(
        `INSERT INTO feed_events (actor_user_id, video_id, event_type, audience, score, source, metadata)
         VALUES ($1, $2, 'video_shared', 'global', 6, 'next-share', $3::jsonb)`,
        [userId, videoId, JSON.stringify({ channel, share_token: shareToken })]
      );

      await client.query("COMMIT");

      const response = NextResponse.json({
        share_token: shareToken,
        share_url: `/v/${shareToken}`,
        share_count: shareCount,
      });
      setAnonSessionCookie(response, session.anonSessionId);
      return response;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error: any) {
    logger.error({ err: error }, "[Share API] POST Error:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
