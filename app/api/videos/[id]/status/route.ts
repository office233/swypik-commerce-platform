import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

import { logger } from "@/lib/logger";
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function firstNumber(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

async function firstRow(sql: string, params: unknown[]): Promise<Record<string, unknown>> {
  try {
    const { rows } = await dbQuery(sql, params);
    return asObject(rows[0]);
  } catch (error) {
    logger.warn({ err: error }, "[Video Status] Optional status lookup failed");
    return {};
  }
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Video id is required" }, { status: 400 });
  }

  const video = await firstRow(`SELECT * FROM videos WHERE id::text = $1 LIMIT 1`, [id]);

  const canonicalAsset = await firstRow(
    `SELECT * FROM video_assets
      WHERE video_id::text = $1 OR id::text = $1
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1`,
    [id]
  );
  const driftAsset = Object.keys(canonicalAsset).length ? {} : await firstRow(
    `SELECT * FROM video_assets
      WHERE id::text = $1 OR upload_session_id::text = $1
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1`,
    [id]
  );
  const asset = Object.keys(canonicalAsset).length ? canonicalAsset : driftAsset;

  const assetId = firstString(asset, "id");
  const videoId = firstString(video, "id") || firstString(asset, "video_id") || id;

  const canonicalSession = await firstRow(
    `SELECT * FROM video_upload_sessions
      WHERE id::text = $1 OR video_id::text = $1
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1`,
    [id]
  );
  const driftSession = Object.keys(canonicalSession).length ? {} : await firstRow(
    `SELECT * FROM video_upload_sessions
      WHERE id::text = $1
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1`,
    [id]
  );
  const uploadSession = Object.keys(canonicalSession).length ? canonicalSession : driftSession;

  const canonicalJob = await firstRow(
    `SELECT * FROM video_processing_jobs
      WHERE video_id::text = $1 OR ($2::text <> '' AND asset_id::text = $2)
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1`,
    [videoId, assetId || ""]
  );
  const driftJob = Object.keys(canonicalJob).length ? {} : await firstRow(
    `SELECT * FROM video_processing_jobs
      WHERE id::text = $1 OR ($2::text <> '' AND video_asset_id::text = $2)
      ORDER BY started_at DESC NULLS LAST
      LIMIT 1`,
    [id, assetId || ""]
  );
  const job = Object.keys(canonicalJob).length ? canonicalJob : driftJob;

  if (!Object.keys(video).length && !Object.keys(asset).length && !Object.keys(uploadSession).length) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({
    id,
    videoId: firstString(video, "id") || firstString(asset, "video_id") || firstString(job, "video_id"),
    assetId,
    uploadId: firstString(uploadSession, "id") || firstString(asset, "upload_session_id"),
    status:
      firstString(video, "status") ||
      firstString(asset, "status") ||
      firstString(uploadSession, "status") ||
      firstString(job, "status") ||
      "unknown",
    jobStatus: firstString(job, "status"),
    error: firstString(job, "error_message", "error") || firstString(asset, "error_message"),
    playbackUrl: firstString(video, "playback_url", "media_url") || firstString(asset, "public_url"),
    thumbnailUrl: firstString(video, "thumbnail_url"),
    durationMs: firstNumber(video, "duration_ms") ?? firstNumber(asset, "duration_ms", "duration_seconds"),
    width: firstNumber(video, "width") ?? firstNumber(asset, "width"),
    height: firstNumber(video, "height") ?? firstNumber(asset, "height"),
    rawKey: firstString(asset, "raw_key", "object_key") || firstString(uploadSession, "raw_object_key", "object_key"),
    hlsMasterKey: firstString(asset, "hls_master_key") || firstString(job, "hls_master_key"),
    thumbnailKey: firstString(asset, "thumbnail_key") || firstString(job, "thumbnail_key"),
    previewKey: firstString(asset, "preview_key") || firstString(job, "preview_key"),
  }, { headers: { "Cache-Control": "no-store" } });
}
