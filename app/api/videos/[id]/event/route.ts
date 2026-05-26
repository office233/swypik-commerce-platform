import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

import { logger } from "@/lib/logger";

// Allowed event types matching the DB ENUM
const ALLOWED_EVENTS = new Set([
  'impression', 'view_start', 'view_end', 'skip_fast', 'watch_complete',
  'rewatch', 'pause', 'resume', 'seek', 'like', 'unlike', 'save', 'unsave',
  'share', 'comment', 'follow', 'unfollow', 'product_click', 'add_to_cart',
  'purchase', 'more_like_this', 'not_interested', 'report'
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params;
    
    // Check if the body is valid JSON
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const {
      event_type,
      watch_duration_ms,
      video_duration_ms,
      completion_pct,
      session_id,
      metadata = {}
    } = body;

    if (!event_type || !ALLOWED_EVENTS.has(event_type)) {
      return NextResponse.json({ error: "Invalid or missing event_type" }, { status: 400 });
    }

    const clientIp = getClientIP(req);

    // Per event_type+video+IP: 1 / 5s (dedupe)
    const perCombo = await rateLimit("videoEventCombo", `${event_type}:${videoId}:${clientIp}`, { limit: 1, window: 5 });
    if (!perCombo.success) {
      return NextResponse.json({ ok: true }, { status: 200 }); // silently drop
    }

    // Global per-IP cap (anti analytic-spam)
    const perIp = await rateLimit("videoEvent", clientIp);
    if (!perIp.success) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const realUserId = await getOptionalSocialUserId();
    let validSessionId = null;

    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    
    if (session_id && isUuid(session_id)) {
      validSessionId = session_id;
    }

    const userAgent = req.headers.get("user-agent") || null;

    // Insert into user_watch_events
    await dbQuery(
      `INSERT INTO user_watch_events (
        user_id, session_id, video_id, event_type, 
        watch_duration_ms, video_duration_ms, completion_pct, 
        metadata, client_ip, user_agent, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        realUserId,
        validSessionId,
        videoId,
        event_type,
        watch_duration_ms || null,
        video_duration_ms || null,
        completion_pct || null,
        JSON.stringify(metadata),
        clientIp !== "unknown" ? clientIp : null,
        userAgent
      ]
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    logger.error({ err: error }, "Error in watch event tracking:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
