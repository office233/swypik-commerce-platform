export const MAX_VIDEO_UPLOAD_SIZE_BYTES = 1024 * 1024 * 1024;

const HASHTAG_PATTERN = /(^|\s)#([a-zA-Z0-9_-]+)/g;
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"]);

export class UploadInputError extends Error {
  status = 400;
}

export type CreatorUploadInput = {
  creatorId: string;
  productId: string;
  title: string;
  description: string;
  caption: string;
  challengeId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  source: string;
  hashtags: string[];
  productRefs: Array<{ product_id: string; source: "creator_upload" }>;
  metadata: Record<string, unknown>;
};

export type ProcessVideoJobPayload = {
  job_type: "process_video";
  type: "process_video";
  job_id: string;
  video_id: string;
  asset_id: string;
  upload_id: string;
  creator_id: string;
  product_id: string;
  storage_provider: string;
  bucket: string;
  source_bucket: string;
  output_bucket: string;
  object_key: string;
  source_key: string;
  output_prefix: string;
  thumbnail_key: string;
  preview_key: string;
  hls_master_key: string;
  source_url: string;
  content_type: string;
  byte_size: number;
  metadata: Record<string, unknown>;
};

type RawCreatorUploadInput = {
  creatorId?: unknown;
  productId?: unknown;
  title?: unknown;
  description?: unknown;
  caption?: unknown;
  challengeId?: unknown;
  filename?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
  source?: unknown;
  hashtags?: unknown;
};

type ProcessVideoJobInput = {
  jobId: string;
  uploadId: string;
  videoId: string;
  assetId: string;
  creatorId: string;
  productId?: string;
  bucket: string;
  sourceKey: string;
  sourceUrl?: string;
  contentType?: string;
  byteSize?: number;
  storageProvider?: string;
  outputBucket?: string;
  metadata?: Record<string, unknown>;
};

export function normalizeCreatorUploadInput(raw: RawCreatorUploadInput): CreatorUploadInput {
  const creatorId = asString(raw.creatorId);
  const filename = sanitizeFilename(asString(raw.filename));
  const contentType = normalizeContentType(asString(raw.contentType), filename);
  const sizeBytes = Number(raw.sizeBytes);

  if (!creatorId) {
    throw new UploadInputError("creatorId is required");
  }
  if (!filename) {
    throw new UploadInputError("filename is required");
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new UploadInputError("sizeBytes must be positive");
  }
  if (sizeBytes > MAX_VIDEO_UPLOAD_SIZE_BYTES) {
    throw new UploadInputError("sizeBytes exceeds 1GB");
  }
  if (!isVideoContentType(contentType) && !hasVideoExtension(filename)) {
    throw new UploadInputError("contentType must be a video type");
  }

  const title = asString(raw.title);
  const description = asString(raw.description);
  const caption = asString(raw.caption || raw.description);
  const challengeId = asString(raw.challengeId);
  const productId = asString(raw.productId);
  const source = asString(raw.source) || "gallery";
  const hashtags = normalizeHashtags([
    extractPrefixedHashtags(caption),
    extractPrefixedHashtags(description),
    raw.hashtags,
  ]);
  const productRefs = productId ? [{ product_id: productId, source: "creator_upload" as const }] : [];

  return {
    creatorId,
    productId,
    title,
    description,
    caption,
    challengeId,
    filename,
    contentType: contentType || "video/mp4",
    sizeBytes,
    source,
    hashtags,
    productRefs,
    metadata: {
      title,
      description,
      caption,
      hashtags,
      challenge_id: challengeId || null,
      product_id: productId || null,
      source,
    },
  };
}

export function buildProcessVideoJobPayload(input: ProcessVideoJobInput): ProcessVideoJobPayload {
  const storageProvider = input.storageProvider || "r2";
  const outputBucket = input.outputBucket || input.bucket;
  const sourceKey = input.sourceKey.replace(/^\/+/, "");
  const hlsPrefix = `videos/hls/${input.videoId}`;

  return {
    job_type: "process_video",
    type: "process_video",
    job_id: input.jobId,
    video_id: input.videoId,
    asset_id: input.assetId,
    upload_id: input.uploadId,
    creator_id: input.creatorId,
    product_id: input.productId || "",
    storage_provider: storageProvider,
    bucket: input.bucket,
    source_bucket: input.bucket,
    output_bucket: outputBucket,
    object_key: sourceKey,
    source_key: sourceKey,
    output_prefix: hlsPrefix,
    thumbnail_key: `videos/thumbnails/${input.videoId}.jpg`,
    preview_key: `videos/previews/${input.videoId}.mp4`,
    hls_master_key: `${hlsPrefix}/master.m3u8`,
    source_url: input.sourceUrl || "",
    content_type: input.contentType || "video/mp4",
    byte_size: input.byteSize || 0,
    metadata: input.metadata || {},
  };
}

export function normalizeHashtags(values: unknown[]): string[] {
  const tags: string[] = [];

  for (const value of values) {
    const raw = flattenHashtagValue(value);
    for (const item of raw) {
      for (const tag of extractHashtags(item)) {
        if (!tags.includes(tag)) tags.push(tag);
      }
    }
  }

  return tags;
}

export function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return cleaned || "video.mp4";
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function extractHashtags(value: string): string[] {
  const found: string[] = [];
  let match: RegExpExecArray | null;
  HASHTAG_PATTERN.lastIndex = 0;
  while ((match = HASHTAG_PATTERN.exec(value))) {
    const tag = normalizeHashtag(match[2]);
    if (tag) found.push(tag);
  }

  for (const part of value.split(/[\s,]+/)) {
    const tag = normalizeHashtag(part);
    if (tag) found.push(tag);
  }

  return found;
}

function extractPrefixedHashtags(value: string): string[] {
  const found: string[] = [];
  let match: RegExpExecArray | null;
  HASHTAG_PATTERN.lastIndex = 0;
  while ((match = HASHTAG_PATTERN.exec(value))) {
    found.push(match[2]);
  }
  return found;
}

function normalizeHashtag(value: string): string {
  return value
    .replace(/^#+/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function flattenHashtagValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(flattenHashtagValue);
  if (value === null || value === undefined) return [];
  return [String(value)];
}

function normalizeContentType(contentType: string, filename: string): string {
  if (contentType) return contentType.toLowerCase();
  const extension = extensionOf(filename);
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".webm") return "video/webm";
  return hasVideoExtension(filename) ? "video/mp4" : "";
}

function isVideoContentType(contentType: string): boolean {
  return contentType.toLowerCase().startsWith("video/");
}

function hasVideoExtension(filename: string): boolean {
  return VIDEO_EXTENSIONS.has(extensionOf(filename));
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}
