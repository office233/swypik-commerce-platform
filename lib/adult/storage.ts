/**
 * Adult media storage — Cloudflare R2 (separate bucket).
 *
 * NEVER reuse the marketplace bucket. Adult media MUST live in
 * R2_ADULT_BUCKET, served from R2_ADULT_PUBLIC_URL.
 *
 * Required env:
 *   R2_ENDPOINT or S3_ENDPOINT (R2 account endpoint)
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (or S3_* fallback)
 *   R2_ADULT_BUCKET
 *   R2_ADULT_PUBLIC_URL (e.g. https://media-adult.swypik.com)
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

function env(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

let _client: S3Client | null = null;
function getClient(): S3Client {
  if (_client) return _client;
  const endpoint = env("R2_ENDPOINT", "R2_ENDPOINT_URL", "S3_ENDPOINT", "S3_ENDPOINT_URL");
  const accessKeyId = env("R2_ACCESS_KEY_ID", "R2_ACCESS_KEY", "S3_ACCESS_KEY", "S3_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY", "S3_SECRET_KEY", "S3_SECRET_ACCESS_KEY");
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 storage env vars missing (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
  }
  _client = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  return _client;
}

export function adultBucket(): string {
  const b = env("R2_ADULT_BUCKET");
  if (!b) throw new Error("R2_ADULT_BUCKET not set");
  return b;
}

export function adultStorageConfigured(): boolean {
  return Boolean(
    env("R2_ENDPOINT", "S3_ENDPOINT") &&
    env("R2_ACCESS_KEY_ID", "S3_ACCESS_KEY") &&
    env("R2_SECRET_ACCESS_KEY", "S3_SECRET_KEY") &&
    env("R2_ADULT_BUCKET"),
  );
}

const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB hard cap per upload

function extFor(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  };
  return map[mime] || "bin";
}

export interface PresignInput {
  creatorUserId: string;
  postKind: "photo_set" | "video" | "live" | "ppv" | "drop" | "bundle";
  variant: "preview" | "premium";
  contentType: string;
  contentLength: number;
}

export interface PresignResult {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  key: string;
  publicUrl: string;
  expiresInSeconds: number;
}

/**
 * Generate a presigned PUT URL for the adult bucket. Object key namespaces
 * by creator_user_id so a leaked URL can never overwrite another creator.
 */
export async function presignAdultUpload(input: PresignInput): Promise<PresignResult> {
  if (!adultStorageConfigured()) {
    throw new Error("adult storage not configured");
  }
  if (input.contentLength <= 0 || input.contentLength > MAX_BYTES) {
    throw new Error(`contentLength must be 1..${MAX_BYTES}`);
  }
  const isImage = ALLOWED_IMAGE.has(input.contentType);
  const isVideo = ALLOWED_VIDEO.has(input.contentType);
  if (!isImage && !isVideo) {
    throw new Error(`unsupported contentType: ${input.contentType}`);
  }
  if (input.postKind === "video" && !isVideo && input.variant === "premium") {
    throw new Error("video posts require a video premium variant");
  }
  const id = crypto.randomBytes(16).toString("hex");
  const ext = extFor(input.contentType);
  const key = `creators/${input.creatorUserId}/${input.postKind}/${input.variant}/${id}.${ext}`;

  const client = getClient();
  const cmd = new PutObjectCommand({
    Bucket: adultBucket(),
    Key: key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
    // R2 ignores ACL, but set defensively in case mirrored to S3.
    Metadata: {
      "swypik-surface": "adult",
      "swypik-variant": input.variant,
      "swypik-creator": input.creatorUserId,
    },
  });
  const expiresInSeconds = 15 * 60;
  const url = await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
  const publicBase = env("R2_ADULT_PUBLIC_URL") || "";
  const publicUrl = publicBase ? `${publicBase.replace(/\/$/, "")}/${key}` : "";

  return {
    url,
    method: "PUT",
    headers: { "content-type": input.contentType },
    key,
    publicUrl,
    expiresInSeconds,
  };
}
