/**
 * Signed GET for a previously-uploaded adult media key.
 * 15-minute default TTL. Caller must verify the requester is allowed to view.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function env(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  const endpoint = env("R2_ENDPOINT", "R2_ENDPOINT_URL", "S3_ENDPOINT", "S3_ENDPOINT_URL");
  const accessKeyId = env("R2_ACCESS_KEY_ID", "R2_ACCESS_KEY", "S3_ACCESS_KEY", "S3_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY", "S3_SECRET_KEY", "S3_SECRET_ACCESS_KEY");
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("R2 not configured");
  _client = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  return _client;
}

export async function signAdultGet(key: string, ttlSeconds = 900): Promise<string> {
  const bucket = env("R2_ADULT_BUCKET");
  if (!bucket) throw new Error("R2_ADULT_BUCKET not set");
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client(), cmd, { expiresIn: ttlSeconds });
}
