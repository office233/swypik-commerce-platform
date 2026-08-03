/**
 * Video Storage Service
 * Handles presigned upload URLs and public CDN URLs for video assets.
 *
 * Uses the same S3-compatible configuration as lib/storage/upload.ts:
 *   S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_PUBLIC_URL
 *
 * NOTE: Requires @aws-sdk/s3-request-presigner — install if not present:
 *   npm install @aws-sdk/s3-request-presigner
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sanitizeFilename } from "@/lib/video/upload-session";

// ─── Video path prefixes ────────────────────────────────────────────────────

export const VIDEO_PATHS = {
  raw: "videos/raw",
  processed: "videos/processed",
  thumbnails: "videos/thumbnails",
  hls: "videos/hls",
} as const;

// ─── S3 client (singleton, same config as upload.ts) ────────────────────────

let _client: S3Client | null = null;
let _presignClient: S3Client | null = null;

function getS3Client(): S3Client {
  if (_client) return _client;

  const endpoint = firstEnv("S3_ENDPOINT", "S3_ENDPOINT_URL", "R2_ENDPOINT", "R2_ENDPOINT_URL");
  const accessKeyId = firstEnv("S3_ACCESS_KEY", "S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = firstEnv("S3_SECRET_KEY", "S3_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 storage is not configured. Set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY."
    );
  }

  _client = new S3Client({
    region: firstEnv("S3_REGION", "R2_REGION", "AWS_REGION") || "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  return _client;
}

/**
 * Client pentru URL-uri presemnate folosite DIN BROWSER.
 * Semnătura SigV4 include host-ul, deci nu putem doar rescrie URL-ul:
 * semnăm direct pe endpointul public (S3_UPLOAD_PUBLIC_ENDPOINT,
 * ex. https://cdn.swypik.com → tunel spre MinIO). Fallback: clientul intern.
 */
function getPresignClient(): S3Client {
  const publicEndpoint = firstEnv("S3_UPLOAD_PUBLIC_ENDPOINT");
  if (!publicEndpoint) return getS3Client();
  if (_presignClient) return _presignClient;
  const accessKeyId = firstEnv("S3_ACCESS_KEY", "S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = firstEnv("S3_SECRET_KEY", "S3_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) return getS3Client();
  _presignClient = new S3Client({
    region: firstEnv("S3_REGION", "R2_REGION", "AWS_REGION") || "auto",
    endpoint: publicEndpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return _presignClient;
}

function getBucket(): string {
  const bucket = firstEnv("S3_BUCKET", "S3_MEDIA_BUCKET", "R2_BUCKET");
  if (!bucket) {
    throw new Error("S3_BUCKET is not configured.");
  }
  return bucket;
}

export function getVideoStorageBucket(): string {
  return getBucket();
}

export function isVideoStorageConfigured(): boolean {
  return Boolean(
    firstEnv("S3_ENDPOINT", "S3_ENDPOINT_URL", "R2_ENDPOINT", "R2_ENDPOINT_URL") &&
    firstEnv("S3_ACCESS_KEY", "S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID") &&
    firstEnv("S3_SECRET_KEY", "S3_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY") &&
    firstEnv("S3_BUCKET", "S3_MEDIA_BUCKET", "R2_BUCKET")
  );
}

// ─── Presigned upload URL ───────────────────────────────────────────────────

const UPLOAD_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Generate a presigned PUT URL for uploading a raw video file.
 *
 * @param uploadId  Unique upload session identifier (UUID).
 * @returns         Object with the presigned `url`, the object `key`, and `expiresIn` (seconds).
 */
export async function createVideoUploadUrl(
  upload: string | {
    uploadId: string;
    creatorId?: string;
    filename?: string;
    contentType?: string;
  }
): Promise<{ url: string; key: string; expiresIn: number }> {
  const client = getPresignClient();
  const bucket = getBucket();
  const key = typeof upload === "string"
    ? `${VIDEO_PATHS.raw}/${upload}.mp4`
    : buildRawVideoObjectKey(upload.uploadId, upload.creatorId, upload.filename);
  const contentType = typeof upload === "string" ? "video/mp4" : upload.contentType || "video/mp4";

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: UPLOAD_EXPIRY_SECONDS,
  });

  return { url, key, expiresIn: UPLOAD_EXPIRY_SECONDS };
}

export function buildRawVideoObjectKey(uploadId: string, creatorId?: string, filename?: string): string {
  const safeCreator = sanitizePathPart(creatorId || "creator");
  const safeUpload = sanitizePathPart(uploadId);
  const safeFilename = sanitizeFilename(filename || `${uploadId}.mp4`).replace(/\s+/g, "-");
  return `${VIDEO_PATHS.raw}/${safeCreator}/${safeUpload}/${safeFilename}`;
}

// ─── Public CDN URL ─────────────────────────────────────────────────────────

/**
 * Build the public CDN URL for a given object key.
 *
 * @param key  The object key in R2 (e.g. "videos/processed/abc.mp4").
 * @returns    Full public URL via the CDN.
 */
export function getVideoAssetUrl(key: string): string {
  const publicBase =
    firstEnv("S3_PUBLIC_URL", "S3_PUBLIC_BASE_URL", "R2_PUBLIC_URL", "R2_PUBLIC_BASE_URL")?.replace(/\/$/, "") ||
    `${firstEnv("S3_ENDPOINT", "S3_ENDPOINT_URL", "R2_ENDPOINT", "R2_ENDPOINT_URL")}/${getBucket()}`;
  return `${publicBase}/${key}`;
}

function firstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function sanitizePathPart(value: string): string {
  return sanitizeFilename(value)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}
