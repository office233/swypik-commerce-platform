import { NextResponse } from "next/server";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import {
  hashIp,
  insertFeedEvents,
  normalizeFeedEvent,
  type NormalizedFeedEvent,
} from "@/lib/feed/events";
import { FeedEventsBatchSchema, parseBody } from "@/lib/validation/schemas";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

const MAX_BATCH = 50;

/**
 * POST /api/feed/events/batch
 *
 * URL note: the owner spec writes this endpoint as `/api/feed/events:batch`.
 * Next.js App Router maps folder names directly to URL segments and `:` is
 * not a portable segment character on Windows. We expose the same logical
 * endpoint at `/api/feed/events/batch`. The client helper in
 * `lib/feed/track.ts` posts to this path.
 *
 * Body: { events: NormalizedFeedEvent[] } (max 50).
 *
 * Used for flush-on-rotation: when the player advances to the next video the
 * client batches the per-video events (video_view + watch_time + completion)
 * into one request. Responds 204 on success.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  if (!body || typeof body !== "object") {
    return new NextResponse(null, { status: 204 });
  }

  // Envelope-only validation (caps array length & top-level type).
  // Individual events are normalized below by normalizeFeedEvent().
  const env = parseBody(FeedEventsBatchSchema, body);
  if (!env.ok) return NextResponse.json({ error: env.error }, { status: 400 });

  let rawEvents: unknown[];
  if (Array.isArray((body as any).events)) {
    rawEvents = (body as { events: unknown[] }).events;
  } else if ((body as any).event_type || (body as any).type) {
    rawEvents = [body];
  } else {
    return new NextResponse(null, { status: 204 });
  }

  if (rawEvents.length === 0) {
    return new NextResponse(null, { status: 204 });
  }
  if (rawEvents.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `max ${MAX_BATCH} events per batch` },
      { status: 400 },
    );
  }

  const fallbackSession =
    (rawEvents[0] && typeof (rawEvents[0] as any).session_id === "string"
      ? ((rawEvents[0] as any).session_id as string)
      : null) || getClientIP(req);

  const accepted: NormalizedFeedEvent[] = [];
  const errors: { index: number; error: string }[] = [];

  for (let i = 0; i < rawEvents.length; i++) {
    const result = normalizeFeedEvent(rawEvents[i], fallbackSession);
    if ("error" in result) errors.push({ index: i, error: result.error });
    else accepted.push(result);
  }

  if (accepted.length === 0) {
    // Silent accept: clients should not be punished for malformed events.
    return new NextResponse(null, { status: 204 });
  }

  // Rate limit on the shared session (count = batch size, fallback: 1 hit per
  // batch through the rateLimit helper).
  // ANTI-FRAUD (2026-08-09): cheia e IP-ul (server-side), NU session_id din
  // body — session_id e controlat de client și permitea ocolirea completă a
  // limitei prin rotirea sesiunii la fiecare batch.
  const { success } = await rateLimit("feed_event_batch", getClientIP(req), {
    limit: 20, // 20 batches/min = up to 1000 events/min per session
    window: 60,
  });
  if (!success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const userId = await getOptionalSocialUserId().catch(() => null);
  const ipHash = hashIp(getClientIP(req));
  const country = req.headers.get("cf-ipcountry") || null;

  try {
    const inserted = await insertFeedEvents(accepted, { userId, ipHash, country });
    return NextResponse.json(
      { accepted: inserted, rejected: errors.length, errors: errors.length ? errors : undefined },
      { status: 200 },
    );
  } catch (error) {
    logger.error({ err: error }, "[feed/events/batch] insert failed:");
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
