import { NextResponse } from "next/server";
import { getCreatorUserId } from "@/lib/creator/session";
import { dbQuery } from "@/lib/db";
import { publishProcessVideoJob } from "@/lib/video/redis-queue";
import { buildProcessVideoJobPayload } from "@/lib/video/upload-session";
import { getVideoStorageBucket } from "@/lib/storage/video-storage";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const creatorId = await getCreatorUserId();

    if (!creatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { uploadId } = await req.json();
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
    }

    // 1. Validate Session
    const { rows: sessions } = await dbQuery(
      `SELECT * FROM video_upload_sessions WHERE id = $1 AND creator_id = $2 AND status = 'created'`,
      [uploadId, creatorId]
    );

    if (sessions.length === 0) {
      return NextResponse.json({ error: "Invalid or already processed upload session" }, { status: 400 });
    }

    const session = sessions[0];
    const assetId = crypto.randomUUID();
    const videoId = crypto.randomUUID(); // This maps to public 'videos' table later

    // 2. Create Video Asset
    await dbQuery(
      `INSERT INTO video_assets (
        id, upload_session_id, creator_id, product_id, raw_key, status
      ) VALUES ($1, $2, $3, $4, $5, 'processing')`,
      [assetId, uploadId, creatorId, session.product_id, session.raw_object_key]
    );

    // 3. Mark session uploaded
    await dbQuery(
      `UPDATE video_upload_sessions SET status = 'uploaded' WHERE id = $1`,
      [uploadId]
    );

    // 4. Create Public Video Record (status: processing)
    const metadata = typeof session.metadata === "string" ? JSON.parse(session.metadata) : session.metadata;
    await dbQuery(
      `INSERT INTO videos (
        id, creator_id, product_id, title, description, status,
        media_url, thumbnail_url, media_type, metadata
      ) VALUES ($1, $2, $3, $4, $5, 'processing', $6, $7, 'video', $8::jsonb)`,
      [
        videoId,
        creatorId,
        session.product_id,
        metadata.title || metadata.caption || "",
        metadata.description || metadata.caption || "",
        session.raw_object_key, // Temp, will be replaced by HLS URL later
        '', // Thumbnail comes later
        JSON.stringify(metadata)
      ]
    );

    // 5. Enqueue Job for FFmpeg Worker
    const payload = buildProcessVideoJobPayload({
      jobId: crypto.randomUUID(),
      uploadId,
      videoId,
      assetId,
      creatorId,
      productId: session.product_id,
      bucket: getVideoStorageBucket(),
      sourceKey: session.raw_object_key,
      metadata
    });

    const queueResult = await publishProcessVideoJob(payload);

    return NextResponse.json({
      success: true,
      videoId,
      assetId,
      queued: queueResult.queued,
      message: "Processing started. Output will be HLS chunks as requested.",
    });

  } catch (error: any) {
    console.error("[Upload Complete Error]:", error);
    return NextResponse.json(
      { error: error.message || "Failed to complete upload" },
      { status: 500 }
    );
  }
}
