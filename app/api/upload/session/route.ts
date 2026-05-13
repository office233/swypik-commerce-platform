import { NextResponse } from "next/server";
import { getCreatorUserId } from "@/lib/creator/session";
import { createVideoUploadUrl } from "@/lib/storage/video-storage";
import { normalizeCreatorUploadInput } from "@/lib/video/upload-session";
import { dbQuery } from "@/lib/db";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const creatorId = await getCreatorUserId();

    if (!creatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const uploadInput = normalizeCreatorUploadInput({ ...body, creatorId });

    // Ensure video tables exist (fallback if migrations haven't run)
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS video_upload_sessions (
        id UUID PRIMARY KEY,
        creator_id UUID NOT NULL,
        product_id UUID,
        raw_object_key TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'created',
        upload_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS video_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        upload_session_id UUID REFERENCES video_upload_sessions(id),
        creator_id UUID NOT NULL,
        product_id UUID,
        raw_key TEXT,
        hls_master_key TEXT,
        thumbnail_key TEXT,
        preview_key TEXT,
        duration_seconds INTEGER,
        width INTEGER,
        height INTEGER,
        status VARCHAR(50) DEFAULT 'processing',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS video_processing_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        video_asset_id UUID REFERENCES video_assets(id),
        status VARCHAR(50) DEFAULT 'queued',
        error TEXT,
        started_at TIMESTAMP WITH TIME ZONE,
        finished_at TIMESTAMP WITH TIME ZONE
      );
    `);

    const uploadId = crypto.randomUUID();
    const { url: signedUrl, key: objectKey, expiresIn } = await createVideoUploadUrl({
      uploadId,
      creatorId,
      filename: uploadInput.filename,
      contentType: uploadInput.contentType,
    });

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Save session to database
    await dbQuery(
      `INSERT INTO video_upload_sessions (id, creator_id, product_id, raw_object_key, status, upload_expires_at, metadata)
       VALUES ($1, $2, $3, $4, 'created', $5, $6::jsonb)`,
      [
        uploadId,
        creatorId,
        uploadInput.productId || null,
        objectKey,
        expiresAt.toISOString(),
        JSON.stringify(uploadInput.metadata),
      ]
    );

    return NextResponse.json({
      success: true,
      uploadId,
      signedUrl,
      objectKey,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("[Upload Session Error]:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create upload session" },
      { status: error.status || 500 }
    );
  }
}
