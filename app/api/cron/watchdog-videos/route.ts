import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { runCron } from "@/lib/cron/runCron";
import { publishProcessVideoJob } from "@/lib/video/redis-queue";
import type { ProcessVideoJobPayload } from "@/lib/video/upload-session";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const STALE_RUNNING_MIN = Number(process.env.VIDEO_WATCHDOG_STALE_RUNNING_MIN ?? 30);
const STALE_QUEUED_MIN = Number(process.env.VIDEO_WATCHDOG_STALE_QUEUED_MIN ?? 30);
const MAX_ATTEMPTS = Number(process.env.VIDEO_WATCHDOG_MAX_ATTEMPTS ?? 6);
const REENQUEUE_BATCH = Number(process.env.VIDEO_WATCHDOG_REENQUEUE_BATCH ?? 200);

async function authorize(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("cron-secret") ||
    req.headers.get("x-cron-token") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !token) return false;
  if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

async function runWatchdog() {
  // 1) Reset jobs that have been running too long back to queued so they get
  //    picked up again; bump attempt_count so we can stop them eventually.
  const resetRunning = await dbQuery<{ id: string }>(
    `UPDATE video_processing_jobs
        SET status = 'queued',
            attempt_count = COALESCE(attempt_count, 0) + 1,
            started_at = NULL,
            updated_at = NOW(),
            error_code = 'stale_running',
            error_message = 'reset by watchdog after running > ' || $1::text || ' min'
      WHERE status = 'running'
        AND updated_at < NOW() - ($1::int * INTERVAL '1 minute')
      RETURNING id`,
    [STALE_RUNNING_MIN]
  );

  // 2) Fail jobs that exceeded the retry budget so they don't loop forever.
  const failedExceeded = await dbQuery<{ id: string }>(
    `UPDATE video_processing_jobs
        SET status = 'failed',
            updated_at = NOW(),
            completed_at = NOW(),
            error_code = COALESCE(NULLIF(error_code, ''), 'max_attempts'),
            error_message = COALESCE(NULLIF(error_message, ''), 'attempt_count >= ' || $1::text)
      WHERE status IN ('queued','running')
        AND COALESCE(attempt_count, 0) >= $1::int
      RETURNING id`,
    [MAX_ATTEMPTS]
  );

  // 3) Re-publish to Redis stream any queued jobs older than the threshold,
  //    using the persisted payload column. Workers dedup by job state at
  //    consume time, so duplicate stream entries are safe.
  const stale = await dbQuery<{ id: string; payload: ProcessVideoJobPayload | null }>(
    `SELECT id, payload
       FROM video_processing_jobs
      WHERE status = 'queued'
        AND updated_at < NOW() - ($1::int * INTERVAL '1 minute')
        AND COALESCE(attempt_count, 0) < $2::int
      ORDER BY priority DESC NULLS LAST, updated_at ASC
      LIMIT $3::int`,
    [STALE_QUEUED_MIN, MAX_ATTEMPTS, REENQUEUE_BATCH]
  );

  let reenqueued = 0;
  let reenqueueFailed = 0;
  for (const row of stale.rows) {
    const payload = row.payload;
    if (!payload || typeof payload !== "object" || !payload.video_id) {
      reenqueueFailed += 1;
      continue;
    }
    const result = await publishProcessVideoJob(payload as ProcessVideoJobPayload);
    if (result.queued) {
      reenqueued += 1;
      await dbQuery(
        `UPDATE video_processing_jobs SET updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
    } else {
      reenqueueFailed += 1;
    }
  }

  // 4) Mark `videos` rows failed only when their job is also definitively failed
  //    (max attempts exceeded or hard error). Without this guard a healthy backlog
  //    of `processing` videos waiting on workers gets falsely flipped to failed
  //    while their jobs are still legitimately `queued`/`running`.
  const recovered = await dbQuery<{ id: string }>(
    `UPDATE videos v
        SET status='failed',
            visibility='private',
            is_hidden=true,
            updated_at=NOW()
       FROM video_processing_jobs j
      WHERE j.video_id = v.id
        AND v.status IN ('processing','uploading')
        AND v.updated_at < NOW() - INTERVAL '60 minutes'
        AND j.status = 'failed'
      RETURNING v.id`
  );

  return {
    resetRunning: resetRunning.rowCount ?? resetRunning.rows.length,
    failedExceeded: failedExceeded.rowCount ?? failedExceeded.rows.length,
    candidatesReenqueue: stale.rows.length,
    reenqueued,
    reenqueueFailed,
    videosMarkedFailed: recovered.rowCount ?? recovered.rows.length,
    ts: new Date().toISOString(),
  };
}

export async function GET(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runCron("watchdog-videos", async () => {
    const summary = await runWatchdog();
    return NextResponse.json(summary);
  });
}

export async function POST(req: Request) {
  return GET(req);
}
