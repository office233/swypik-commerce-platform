import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/**
 * In-memory rate limiter: stores last view timestamp per IP+videoId combo.
 * Prevents the same viewer from inflating counts within a 30-second window.
 */
const viewTimestamps = new Map<string, number>();

// Cleanup stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 30 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of viewTimestamps) {
    if (now - ts > RATE_LIMIT_WINDOW_MS * 2) {
      viewTimestamps.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * POST /api/videos/[id]/view
 *
 * Atomically increments the view_count for a video.
 * Rate-limited: same IP+video combo throttled to 1 view per 30s.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params;

    if (!videoId) {
      return NextResponse.json({ error: "Missing video ID" }, { status: 400 });
    }

    // ── Rate limiting ────────────────────────────────────────────
    const ip = getClientIp(req);
    const rateKey = `${ip}:${videoId}`;
    const lastView = viewTimestamps.get(rateKey);
    const now = Date.now();

    if (lastView && now - lastView < RATE_LIMIT_WINDOW_MS) {
      // Already counted recently – return 200 without incrementing
      return NextResponse.json({ views: null, throttled: true });
    }

    // Mark this view timestamp before the DB call to prevent race duplicates
    viewTimestamps.set(rateKey, now);

    // ── Atomic increment ─────────────────────────────────────────
    const { rows } = await dbQuery(
      `UPDATE videos
         SET view_count = view_count + 1
       WHERE id = $1
         AND status = 'ready'
       RETURNING view_count`,
      [videoId]
    );

    if (rows.length === 0) {
      // Video not found or not in 'ready' status – roll back rate limit entry
      viewTimestamps.delete(rateKey);
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ views: Number(rows[0].view_count) });
  } catch (error: any) {
    logger.error({ err: error }, "[Video View API]");
    return NextResponse.json(
      { error: "Failed to record view" },
      { status: 500 }
    );
  }
}
