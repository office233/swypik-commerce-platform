#!/usr/bin/env node
/**
 * scripts/enqueue-ae-videos.mjs
 *
 * Enqueue every marketplace_product that has metadata.ae_video_url through
 * the same hybrid pipeline used by `lib/video/ae-pipeline.ts`:
 *
 *   - ensure SYSTEM_CREATOR_ID row exists in `users`
 *   - INSERT into videos / video_upload_sessions / video_assets / video_processing_jobs (transactional)
 *   - XADD on Redis stream `video:jobs` (raw TCP, no extra deps)
 *
 * Idempotent: skips products that already have a `videos` row whose
 * metadata.source_url == the AE url.
 *
 * Run inside the web container so we share network (postgres, redis):
 *
 *   docker cp scripts/enqueue-ae-videos.mjs swypik-prod-web-next-1:/tmp/
 *   docker exec swypik-prod-web-next-1 node /tmp/enqueue-ae-videos.mjs [--dry-run] [--limit=N]
 */

import { randomUUID, createHash } from "node:crypto";
import net from "node:net";
import pg from "pg";

const SYSTEM_CREATOR_ID = "00000000-0000-0000-0000-000000000001";
const BUCKET = process.env.R2_BUCKET || process.env.S3_BUCKET || "swypik-media";
const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const QUEUE_NAME = process.env.VIDEO_QUEUE_NAME || "video:jobs";
const VIDEO_RAW_PREFIX = "videos/raw";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const LIMIT = (() => {
  const a = argv.find((x) => x.startsWith("--limit="));
  return a ? parseInt(a.split("=")[1], 10) : 9999;
})();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function buildPayload({ jobId, videoId, assetId, sessionId, sourceUrl, metadata }) {
  const sourceKey = `${VIDEO_RAW_PREFIX}/${videoId}.mp4`;
  const hlsPrefix = `videos/hls/${videoId}`;
  return {
    job_type: "process_video",
    type: "process_video",
    job_id: jobId,
    video_id: videoId,
    asset_id: assetId,
    upload_id: sessionId,
    creator_id: SYSTEM_CREATOR_ID,
    product_id: "",
    storage_provider: "r2",
    bucket: BUCKET,
    source_bucket: BUCKET,
    output_bucket: BUCKET,
    object_key: sourceKey,
    source_key: sourceKey,
    output_prefix: hlsPrefix,
    thumbnail_key: `videos/thumbnails/${videoId}.jpg`,
    preview_key: `videos/previews/${videoId}.mp4`,
    hls_master_key: `${hlsPrefix}/master.m3u8`,
    source_url: sourceUrl,
    content_type: "video/mp4",
    byte_size: 0,
    metadata,
  };
}

function redisCmd(parts) {
  return `*${parts.length}\r\n${parts
    .map((p) => `$${Buffer.byteLength(p)}\r\n${p}\r\n`)
    .join("")}`;
}

async function redisXadd(stream, dataJson) {
  const url = new URL(REDIS_URL);
  const host = url.hostname || "redis";
  const port = Number(url.port || 6379);
  const password = decodeURIComponent(url.password || "");
  const username = decodeURIComponent(url.username || "");
  const cmds =
    (password ? redisCmd(username ? ["AUTH", username, password] : ["AUTH", password]) : "") +
    redisCmd(["XADD", stream, "*", "data", dataJson]);

  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    let buf = "";
    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      err ? reject(err) : resolve(val);
    };
    const timeout = setTimeout(() => finish(new Error("redis timeout")), 5000);
    sock.once("connect", () => sock.write(cmds));
    sock.once("error", (e) => {
      clearTimeout(timeout);
      finish(e);
    });
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      // simple parser: look for bulk string `$N\r\n<id>\r\n` after possible +OK from AUTH
      const lines = buf.split("\r\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("-")) {
          clearTimeout(timeout);
          finish(new Error(lines[i]));
          return;
        }
        if (lines[i].startsWith("$") && lines[i + 1] && !lines[i + 1].startsWith("$")) {
          clearTimeout(timeout);
          finish(null, lines[i + 1]);
          return;
        }
      }
    });
  });
}

async function ensureSystemCreator(client) {
  await client.query(
    `INSERT INTO users (id, username, locale, role, status, display_name, email, metadata)
     VALUES ($1, 'swypik-system', 'ro', 'admin', 'active', 'Swypik System', 'system@swypik.com', '{"system":true}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [SYSTEM_CREATOR_ID]
  );
}

async function getCandidates(client) {
  const { rows } = await client.query(
    `SELECT mp.id AS product_id, mp.title, mp.metadata->>'ae_video_url' AS source_url,
            mp.metadata->>'ae_video_poster' AS poster
       FROM marketplace_products mp
      WHERE mp.metadata->>'ae_video_url' IS NOT NULL
        AND mp.metadata->>'ae_video_url' LIKE 'http%'
        AND mp.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM videos v
          WHERE v.metadata->>'source_url' = mp.metadata->>'ae_video_url'
        )
      ORDER BY mp.created_at ASC
      LIMIT $1`,
    [LIMIT]
  );
  return rows;
}

async function alreadyEnqueued(client, sourceUrl) {
  const { rows } = await client.query(
    `SELECT id FROM videos WHERE metadata->>'source_url' = $1 LIMIT 1`,
    [sourceUrl]
  );
  return rows[0]?.id || null;
}

async function enqueueOne(client, prod) {
  const existing = await alreadyEnqueued(client, prod.source_url);
  if (existing) return { skipped: true, videoId: existing };

  const videoId = randomUUID();
  const sessionId = randomUUID();
  const assetId = randomUUID();
  const jobId = randomUUID();
  const rawObjectKey = `${VIDEO_RAW_PREFIX}/${videoId}.mp4`;
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  const title = (prod.title || "Untitled").slice(0, 280);
  const productRefs = [{ product_id: prod.product_id, source: "aliexpress_import" }];
  const metadata = {
    source: "aliexpress_import",
    source_url: prod.source_url,
    poster: prod.poster || null,
    raw_object_key: rawObjectKey,
    upload_session_id: sessionId,
    source_asset_id: assetId,
    process_video_job_id: jobId,
    product_id: prod.product_id,
  };
  const payload = buildPayload({ jobId, videoId, assetId, sessionId, sourceUrl: prod.source_url, metadata });

  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO videos (id, creator_id, title, description, visibility, status,
                           product_refs, tags, metadata, published_at, created_at, updated_at)
       VALUES ($1, $2, $3, '', 'public', 'processing',
               $4::jsonb, '{}'::text[], $5::jsonb, NOW(), NOW(), NOW())`,
      [videoId, SYSTEM_CREATOR_ID, title, JSON.stringify(productRefs), JSON.stringify(metadata)]
    );
    await client.query(
      `INSERT INTO video_upload_sessions (id, user_id, video_id, storage_provider, bucket, object_key, upload_id,
                                          status, byte_size, content_type, source_url, expires_at,
                                          metadata, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, 'r2', $4, $5, $1::text, 'completed', 0, 'video/mp4',
               $6, $7, $8::jsonb, NOW(), NOW())`,
      [sessionId, SYSTEM_CREATOR_ID, videoId, BUCKET, rawObjectKey, prod.source_url, expiresAt, JSON.stringify(metadata)]
    );
    await client.query(
      `INSERT INTO video_assets (id, video_id, asset_type, storage_provider, bucket, object_key,
                                 mime_type, byte_size, status, metadata, created_at, updated_at)
       VALUES ($1, $2, 'source', 'r2', $3, $4, 'video/mp4', 0, 'uploading', $5::jsonb, NOW(), NOW())
       ON CONFLICT (storage_provider, bucket, object_key) DO UPDATE
         SET status = 'uploading', metadata = video_assets.metadata || EXCLUDED.metadata, updated_at = NOW()`,
      [assetId, videoId, BUCKET, rawObjectKey, JSON.stringify(metadata)]
    );
    await client.query(
      `INSERT INTO video_processing_jobs (id, video_id, asset_id, job_type, status, priority, attempt_count,
                                          max_attempts, scheduled_at, source_url, payload, created_at, updated_at)
       VALUES ($1, $2, $3, 'transcode', 'queued', 100, 0, 3, NOW(),
               $4, $5::jsonb, NOW(), NOW())`,
      [jobId, videoId, assetId, prod.source_url, JSON.stringify(payload)]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }

  const msgId = await redisXadd(QUEUE_NAME, JSON.stringify(payload));
  return { skipped: false, videoId, jobId, msgId };
}

async function main() {
  const client = await pool.connect();
  try {
    if (!DRY) await ensureSystemCreator(client);
    const products = await getCandidates(client);
    console.log(`[enqueue-ae] candidates: ${products.length} dry=${DRY} bucket=${BUCKET} queue=${QUEUE_NAME}`);
    let ok = 0,
      skipped = 0,
      failed = 0;
    for (const p of products) {
      if (DRY) {
        console.log(`[dry] ${p.product_id} <- ${p.source_url}`);
        continue;
      }
      try {
        const r = await enqueueOne(client, p);
        if (r.skipped) {
          skipped++;
          console.log(`[skip] product=${p.product_id} video=${r.videoId}`);
        } else {
          ok++;
          console.log(`[ok]   product=${p.product_id} video=${r.videoId} job=${r.jobId} msg=${r.msgId}`);
        }
      } catch (e) {
        failed++;
        console.error(`[err]  product=${p.product_id}: ${e.message}`);
      }
    }
    console.log(`\n[summary] queued=${ok} skipped=${skipped} failed=${failed}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
