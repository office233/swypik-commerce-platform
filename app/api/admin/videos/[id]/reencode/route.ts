import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

import { requireAuth } from "@/lib/auth/getAuthUser";
import {
  enqueueVideoPipeline,
  findExternalSourceUrlForVideo,
} from "@/lib/video/pipeline";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/videos/[id]/reencode
 *
 * Re-process an EXISTING video by pulling its source from an external URL
 * (de regulă .mp4-ul extern la care mai pointează `videos.playback_url`)
 * through the hybrid pipeline:
 *   download → FFmpeg → HLS → R2 → UPDATE videos.playback_url / thumbnail_url.
 *
 * Source URL resolution order (see lib/video/ae-pipeline.ts):
 *   1. body.sourceUrl (manual override)
 *   2. videos.metadata.source_url
 *   3. videos.playback_url if it looks AE-hosted
 *   (sursa externă se ia din metadata.source_url sau playback_url)
 *   5. videos.playback_url (any https)
 *
 * Response: 202 { jobId, sessionId, videoId, queued, queueBackend }.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const __auth = await requireAuth(req, ["admin"]);
  if (__auth instanceof NextResponse) return __auth;

  const { id: videoId } = await params;
  if (!videoId) {
    return NextResponse.json({ error: "Missing video id" }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — we'll auto-discover the source URL.
  }

  try {
    const { rows } = await dbQuery<{ id: string; title: string | null }>(
      `SELECT id, title FROM videos WHERE id = $1 LIMIT 1`,
      [videoId]
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const sourceUrl: string | null =
      (typeof body?.sourceUrl === "string" && body.sourceUrl) ||
      (typeof body?.source_url === "string" && body.source_url) ||
      (await findExternalSourceUrlForVideo(videoId));

    if (!sourceUrl) {
      return NextResponse.json(
        {
          error:
            "No external source URL found for this video. Pass {sourceUrl} in the body.",
        },
        { status: 422 }
      );
    }

    const result = await enqueueVideoPipeline({
      sourceUrl,
      existingVideoId: videoId,
      title: rows[0].title || undefined,
      metadata: { reencode_requested_at: new Date().toISOString() },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Re-encode queued",
        videoId,
        jobId: result.jobId,
        sessionId: result.sessionId,
        assetId: result.assetId,
        sourceUrl,
        queued: result.queued,
        queueBackend: result.queueBackend,
        queueError: result.queueError,
      },
      { status: 202 }
    );
  } catch (error: any) {
    logger.error({ err: error }, `[Admin Videos] reencode ${videoId} error:`);
    return NextResponse.json(
      { error: error?.message || "Re-encode failed" },
      { status: 500 }
    );
  }
}
