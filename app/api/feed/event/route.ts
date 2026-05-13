import { NextResponse } from "next/server";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import {
  hashIp,
  insertFeedEvents,
  normalizeFeedEvent,
} from "@/lib/feed/events";

export const dynamic = "force-dynamic";

/**
 * POST /api/feed/event
 *
 * Single-event endpoint. Accepts an anonymous payload, validates, normalises
 * and inserts into `feed_events`. Designed to be fire-and-forget from the
 * client — always responds 204 on accept and 4xx on validation errors so that
 * fetch().catch handlers stay quiet on the happy path.
 *
 * Body:
 *   {
 *     event_type:  one of FEED_EVENT_TYPES,
 *     video_id?:   uuid,
 *     watch_ms?:   integer,
 *     position_ms?:integer,
 *     session_id:  client-generated session id (UUID/string up to 64 chars),
 *     metadata?:   plain object
 *   }
 *
 * Auth: optional. If a user session cookie is present, `actor_user_id` is set.
 * Rate limit: 50 events / min per session_id (fallback: IP).
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const fallbackSession =
    (typeof raw.session_id === "string" && raw.session_id) || getClientIP(req);

  const normalized = normalizeFeedEvent(raw, fallbackSession);
  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  // Rate limit: 50/min per session
  const { success } = await rateLimit("feed_event", normalized.session_id, {
    limit: 50,
    window: 60,
  });
  if (!success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const userId = await getOptionalSocialUserId().catch(() => null);
  const ipHash = hashIp(getClientIP(req));
  const country = req.headers.get("cf-ipcountry") || null;

  try {
    await insertFeedEvents([normalized], { userId, ipHash, country });
  } catch (error) {
    console.error("[feed/event] insert failed:", error);
    // Still accept — client should not retry on server errors for tracking.
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
