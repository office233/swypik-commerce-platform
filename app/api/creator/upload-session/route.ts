import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { dbQuery, getDb } from "@/lib/db";
import { getCreatorUserId } from "@/lib/creator/session";
import {
  createVideoUploadUrl,
  getVideoAssetUrl,
  getVideoStorageBucket,
  isVideoStorageConfigured,
} from "@/lib/storage/video-storage";
import { publishProcessVideoJob } from "@/lib/video/redis-queue";
import {
  UploadInputError,
  buildProcessVideoJobPayload,
  isUuid,
  normalizeCreatorUploadInput,
  type CreatorUploadInput,
} from "@/lib/video/upload-session";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const creatorId = await getCreatorUserId();
    if (!creatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const input = normalizeCreatorUploadInput({ ...body, creatorId });

    if (isVideoStorageConfigured() && process.env.DATABASE_URL) {
      return NextResponse.json(await createLocalUploadSession(input));
    }

    const platform = await createPlatformUploadSession(input);
    if (platform) return NextResponse.json(platform);

    return NextResponse.json(
      {
        error:
          "Video storage is not configured. Set R2/S3 env vars or run the Go platform API upload service.",
      },
      { status: 503 }
    );
  } catch (error: any) {
    logger.error({ err: error }, "Upload Session POST Error:");
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: error instanceof UploadInputError ? error.status : 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const creatorId = await getCreatorUserId();
    if (!creatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");
    if (!sessionId) {
      return NextResponse.json({ error: "Missing id query parameter" }, { status: 400 });
    }

    if (process.env.DATABASE_URL && isUuid(sessionId) && isUuid(creatorId)) {
      const local = await getLocalUploadStatus(sessionId, creatorId);
      if (local) return NextResponse.json(local);
    }

    const platform = await getPlatformUploadStatus(sessionId);
    if (platform) return NextResponse.json(platform);

    return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
  } catch (error: any) {
    logger.error({ err: error }, "Upload Session GET Error:");
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const creatorId = await getCreatorUserId();
    if (!creatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const sessionId = searchParams.get("id") || body?.sessionId || body?.uploadId;
    const action = searchParams.get("action") || body?.action;

    if (!sessionId || action !== "complete") {
      return NextResponse.json(
        { error: "Missing id or action=complete parameter" },
        { status: 400 }
      );
    }

    if (process.env.DATABASE_URL && isUuid(sessionId) && isUuid(creatorId)) {
      const local = await completeLocalUploadSession(sessionId, creatorId);
      if (local) return NextResponse.json(local);
    }

    const platform = await completePlatformUploadSession(sessionId, creatorId);
    if (platform) return NextResponse.json(platform);

    return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
  } catch (error: any) {
    logger.error({ err: error }, "Upload Session PATCH Error:");
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

async function createLocalUploadSession(input: CreatorUploadInput) {
  if (!isUuid(input.creatorId)) {
    throw new UploadInputError("creator session must be a user UUID for direct R2 uploads");
  }

  await ensureCreatorUser(input.creatorId);

  const uploadId = randomUUID();
  const videoId = randomUUID();
  const assetId = randomUUID();
  const bucket = getVideoStorageBucket();
  const upload = await createVideoUploadUrl({
    uploadId,
    creatorId: input.creatorId,
    filename: input.filename,
    contentType: input.contentType,
  });
  const expiresAt = new Date(Date.now() + upload.expiresIn * 1000);
  const title = input.title || input.filename;
  const description = input.description || input.caption || "";
  const metadata = {
    ...input.metadata,
    upload_session_id: uploadId,
    source_asset_id: assetId,
    source_object_key: upload.key,
  };

  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO videos (
        id, creator_id, title, description, visibility, status,
        product_refs, tags, metadata, audio_track_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, 'draft', 'uploading', $5::jsonb, $6::text[], $7::jsonb, $8, NOW(), NOW())
      `,
      [
        videoId,
        input.creatorId,
        title,
        description,
        JSON.stringify(input.productRefs),
        input.hashtags,
        JSON.stringify(metadata),
        input.audioTrackId,
      ]
    );

    await client.query(
      `
      INSERT INTO video_upload_sessions (
        id, user_id, video_id, storage_provider, bucket, object_key, upload_id,
        status, byte_size, content_type, expires_at, metadata, created_at, updated_at
      )
      VALUES ($1, $2, $3, 'r2', $4, $5, $1, 'created', $6, $7, $8, $9::jsonb, NOW(), NOW())
      `,
      [
        uploadId,
        input.creatorId,
        videoId,
        bucket,
        upload.key,
        input.sizeBytes,
        input.contentType,
        expiresAt.toISOString(),
        JSON.stringify(metadata),
      ]
    );

    await client.query(
      `
      INSERT INTO video_assets (
        id, video_id, asset_type, storage_provider, bucket, object_key,
        mime_type, byte_size, status, metadata, created_at, updated_at
      )
      VALUES ($1, $2, 'source', 'r2', $3, $4, $5, $6, 'uploading', $7::jsonb, NOW(), NOW())
      `,
      [
        assetId,
        videoId,
        bucket,
        upload.key,
        input.contentType,
        input.sizeBytes,
        JSON.stringify(metadata),
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  return {
    uploadUrl: upload.url,
    sessionId: uploadId,
    uploadId,
    videoId,
    assetId,
    objectKey: upload.key,
    bucket,
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    expiresAt: expiresAt.toISOString(),
    status: "uploading",
    directUpload: true,
  };
}

async function completeLocalUploadSession(sessionId: string, creatorId: string) {
  const { rows } = await dbQuery<{
    id: string;
    video_id: string;
    bucket: string;
    object_key: string;
    content_type: string | null;
    byte_size: string | number | null;
    asset_id: string;
    product_refs: any;
    metadata: any;
  }>(
    `
    SELECT
      vus.id,
      vus.video_id,
      vus.bucket,
      vus.object_key,
      vus.content_type,
      vus.byte_size,
      v.product_refs,
      v.metadata,
      va.id AS asset_id
    FROM video_upload_sessions vus
    JOIN videos v ON v.id = vus.video_id
    JOIN video_assets va ON va.video_id = v.id AND va.asset_type = 'source'
    WHERE vus.id = $1 AND vus.user_id = $2
    LIMIT 1
    `,
    [sessionId, creatorId]
  );

  const session = rows[0];
  if (!session) return null;

  const sourceUrl = getVideoAssetUrl(session.object_key);
  const jobId = randomUUID();
  const productId = firstProductId(session.product_refs);
  const payload = buildProcessVideoJobPayload({
    jobId,
    uploadId: session.id,
    videoId: session.video_id,
    assetId: session.asset_id,
    creatorId,
    productId,
    bucket: session.bucket,
    sourceKey: session.object_key,
    sourceUrl,
    contentType: session.content_type || "video/mp4",
    byteSize: Number(session.byte_size || 0),
    metadata: session.metadata || {},
  });

  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      UPDATE video_upload_sessions
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      `,
      [sessionId, creatorId]
    );

    await client.query(
      `
      UPDATE video_assets
      SET status = 'available',
          public_url = $2,
          metadata = metadata || $3::jsonb,
          updated_at = NOW()
      WHERE id = $1
      `,
      [
        session.asset_id,
        sourceUrl,
        JSON.stringify({
          process_video_job_id: jobId,
          thumbnail_key: payload.thumbnail_key,
          preview_key: payload.preview_key,
          hls_master_key: payload.hls_master_key,
        }),
      ]
    );

    await client.query(
      `
      UPDATE videos
      SET status = 'processing',
          metadata = metadata || $2::jsonb,
          updated_at = NOW()
      WHERE id = $1 AND creator_id = $3
      `,
      [
        session.video_id,
        JSON.stringify({ upload_completed_at: new Date().toISOString(), process_video_job_id: jobId }),
        creatorId,
      ]
    );

    await client.query(
      `
      INSERT INTO video_processing_jobs (
        id, video_id, asset_id, job_type, status, priority, attempt_count,
        max_attempts, scheduled_at, payload, created_at, updated_at
      )
      VALUES ($1, $2, $3, 'transcode', 'queued', 100, 0, 3, NOW(), $4::jsonb, NOW(), NOW())
      `,
      [jobId, session.video_id, session.asset_id, JSON.stringify(payload)]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const queue = await publishProcessVideoJob(payload);

  return {
    success: true,
    sessionId,
    uploadId: sessionId,
    videoId: session.video_id,
    assetId: session.asset_id,
    jobId,
    status: "processing",
    sourceUrl,
    queued: queue.queued,
    queueBackend: queue.backend,
    queueError: queue.error,
  };
}

async function getLocalUploadStatus(sessionId: string, creatorId: string) {
  const { rows } = await dbQuery(
    `
    SELECT
      vus.id AS session_id,
      vus.status AS upload_status,
      vus.completed_at,
      v.id AS video_id,
      v.status AS video_status,
      v.visibility,
      v.playback_url,
      v.thumbnail_url,
      va.id AS asset_id,
      va.status AS asset_status,
      vpj.id AS job_id,
      vpj.status AS job_status,
      vpj.error_message AS job_error
    FROM video_upload_sessions vus
    JOIN videos v ON v.id = vus.video_id
    LEFT JOIN video_assets va ON va.video_id = v.id AND va.asset_type = 'source'
    LEFT JOIN LATERAL (
      SELECT id, status, error_message
      FROM video_processing_jobs
      WHERE video_id = v.id
      ORDER BY created_at DESC
      LIMIT 1
    ) vpj ON true
    WHERE vus.id = $1 AND vus.user_id = $2
    LIMIT 1
    `,
    [sessionId, creatorId]
  );

  const row: any = rows[0];
  if (!row) return null;

  return {
    sessionId: row.session_id,
    uploadStatus: row.upload_status,
    videoId: row.video_id,
    status: row.video_status,
    visibility: row.visibility,
    assetId: row.asset_id,
    assetStatus: row.asset_status,
    jobId: row.job_id,
    jobStatus: row.job_status,
    error: row.job_error,
    playbackUrl: row.playback_url,
    thumbnailUrl: row.thumbnail_url,
    completedAt: row.completed_at,
  };
}

async function ensureCreatorUser(creatorId: string) {
  // SECURITY: do NOT auto-promote shoppers. Require explicit role first.
  const { rows } = await dbQuery<{ role: string }>(
    `SELECT role FROM users WHERE id = $1 LIMIT 1`,
    [creatorId]
  );
  if (!rows[0]) {
    const e = new UploadInputError("User not found");
    e.status = 404;
    throw e;
  }
  if (rows[0].role !== "creator" && rows[0].role !== "admin") {
    const e = new UploadInputError("Creator role required. Apply at /become-a-creator.");
    e.status = 403;
    throw e;
  }
}

async function createPlatformUploadSession(input: CreatorUploadInput) {
  const response = await fetchPlatform("/v1/videos/uploads/init", {
    method: "POST",
    headers: platformApiHeaders(),
    body: JSON.stringify({
      creator_id: input.creatorId,
      product_id: input.productId || "",
      filename: input.filename,
      original_name: input.title || input.filename,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
    }),
  });
  if (!response) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || "Could not create upload session");
  }

  return {
    uploadUrl: data.upload_url,
    sessionId: data.upload_id,
    uploadId: data.upload_id,
    method: data.method || "PUT",
    headers: data.headers || { "Content-Type": input.contentType },
    expiresAt: data.expires_at,
    status: data.status || "uploading",
    directUpload: Boolean(data.upload_url),
  };
}

async function completePlatformUploadSession(sessionId: string, creatorId: string) {
  const response = await fetchPlatform("/v1/videos/uploads/complete", {
    method: "POST",
    headers: platformApiHeaders(),
    body: JSON.stringify({
      upload_id: sessionId,
      creator_id: creatorId,
    }),
  });
  if (!response) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || "Could not complete upload session");
  }

  const video = data.video || data;
  return {
    success: true,
    sessionId,
    uploadId: sessionId,
    videoId: video.video_id || video.id,
    status: video.status || data.status || "processing",
  };
}

async function getPlatformUploadStatus(sessionId: string) {
  const response = await fetchPlatform(`/v1/videos/uploads/${encodeURIComponent(sessionId)}/status`, {
    method: "GET",
    headers: platformApiHeaders(),
  });
  if (!response) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return {
    sessionId: data.id || data.upload_id || sessionId,
    uploadStatus: data.status,
    videoId: data.video_id,
    status: data.status === "completed" ? "processing" : data.status,
    completedAt: data.completed_at,
    expiresAt: data.expires_at,
  };
}

async function fetchPlatform(path: string, init: RequestInit) {
  const baseUrl = getPlatformApiBaseURL();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getPlatformApiBaseURL(): string {
  const raw = process.env.GO_API_URL || "http://localhost:8080";
  return raw
    .replace(/\/api\/v1\/videos\/upload\/?$/, "")
    .replace(/\/v1\/videos\/upload\/?$/, "")
    .replace(/\/+$/, "");
}

function platformApiHeaders(): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (process.env.PLATFORM_API_SECRET) {
    headers.set("X-Swypik-Internal-Secret", process.env.PLATFORM_API_SECRET);
  }
  return headers;
}

function firstProductId(productRefs: unknown): string {
  const refs = typeof productRefs === "string" ? safeJson(productRefs) : productRefs;
  if (!Array.isArray(refs) || refs.length === 0) return "";
  const first = refs[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object") {
    const record = first as Record<string, unknown>;
    return String(record.product_id || record.id || "").trim();
  }
  return "";
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
