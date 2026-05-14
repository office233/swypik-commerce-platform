/**
 * Cloud Storage Upload Service
 * Uses @aws-sdk/client-s3 for S3-compatible stores (Cloudflare R2, AWS S3, MinIO).
 *
 * Required env vars:
 *   S3_ENDPOINT      — e.g. https://xxx.r2.cloudflarestorage.com
 *   S3_BUCKET        — e.g. swypik-media
 *   S3_ACCESS_KEY    — access key ID
 *   S3_SECRET_KEY    — secret access key
 *   S3_PUBLIC_URL    — public CDN prefix, e.g. https://cdn.swypik.com
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

let _client: S3Client | null = null;

function getS3Client(): S3Client | null {
  if (_client) return _client;

  const endpoint = firstEnv("S3_ENDPOINT", "S3_ENDPOINT_URL", "R2_ENDPOINT", "R2_ENDPOINT_URL");
  const accessKeyId = firstEnv("S3_ACCESS_KEY", "S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = firstEnv("S3_SECRET_KEY", "S3_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  return _client;
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/gif": ".gif",
  };
  return map[mimeType] || ".bin";
}

function hasValidImageSignature(file: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return (
      file.length >= 8 &&
      file[0] === 0x89 &&
      file[1] === 0x50 &&
      file[2] === 0x4e &&
      file[3] === 0x47 &&
      file[4] === 0x0d &&
      file[5] === 0x0a &&
      file[6] === 0x1a &&
      file[7] === 0x0a
    );
  }

  if (mimeType === "image/gif") {
    const signature = file.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }

  if (mimeType === "image/webp") {
    return file.length >= 12 && file.subarray(0, 4).toString("ascii") === "RIFF" && file.subarray(8, 12).toString("ascii") === "WEBP";
  }

  if (mimeType === "image/avif") {
    return file.length >= 12 && file.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis"].includes(file.subarray(8, 12).toString("ascii"));
  }

  return false;
}

export interface UploadResult {
  url: string;
  key: string;
  size: number;
}

/**
 * Upload a file buffer to S3/R2.
 * Returns the public URL on success.
 */
export interface UploadOptions {
  keyPrefix?: string;
}

export async function uploadFile(
  file: Buffer,
  originalName: string,
  mimeType: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  // Validate
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Tip de fișier nepermis: ${mimeType}. Permise: JPEG, PNG, WebP, AVIF, GIF.`);
  }

  if (file.length > MAX_FILE_SIZE) {
    throw new Error(`Fișierul depășește limita de ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
  }

  if (file.length === 0) {
    throw new Error("Fișierul este gol.");
  }

  if (!hasValidImageSignature(file, mimeType)) {
    throw new Error("Fișierul nu corespunde tipului de imagine declarat.");
  }

  const client = getS3Client();
  if (!client) {
    throw new Error("S3 storage is not configured. Set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY.");
  }

  const bucket = firstEnv("S3_BUCKET", "S3_MEDIA_BUCKET", "R2_BUCKET");
  if (!bucket) {
    throw new Error("S3_BUCKET is not configured.");
  }

  // Generate unique filename. Default prefix: products/YYYY/MM. Override via options.keyPrefix.
  const now = new Date();
  const defaultPrefix = `products/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = (options.keyPrefix || defaultPrefix).replace(/^\/+|\/+$/g, "");
  const uniqueId = crypto.randomUUID();
  const ext = getExtension(mimeType);
  const key = `${prefix}/${uniqueId}${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  const publicBase =
    firstEnv("S3_PUBLIC_URL", "S3_PUBLIC_BASE_URL", "R2_PUBLIC_URL", "R2_PUBLIC_BASE_URL")?.replace(/\/$/, "") ||
    `${firstEnv("S3_ENDPOINT", "S3_ENDPOINT_URL", "R2_ENDPOINT", "R2_ENDPOINT_URL")}/${bucket}`;
  const url = `${publicBase}/${key}`;

  return { url, key, size: file.length };
}

/**
 * Check if storage is configured (useful for UI to show/hide upload buttons).
 */
export function isStorageConfigured(): boolean {
  return Boolean(
    firstEnv("S3_ENDPOINT", "S3_ENDPOINT_URL", "R2_ENDPOINT", "R2_ENDPOINT_URL") &&
    firstEnv("S3_ACCESS_KEY", "S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID") &&
    firstEnv("S3_SECRET_KEY", "S3_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY") &&
    firstEnv("S3_BUCKET", "S3_MEDIA_BUCKET", "R2_BUCKET")
  );
}

function firstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}
