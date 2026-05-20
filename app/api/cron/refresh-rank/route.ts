import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST/GET /api/cron/refresh-rank
 *
 * Refreshes the `video_rank_14d` materialized view used by /api/explore/feed
 * to rank videos based on real engagement (last 14 days of feed_events).
 *
 * Auth: requires header `x-cron-secret` matching CRON_SECRET env var.
 * Schedule externally (cron-job.org / GitHub Action / pg_cron) every 5 minutes.
 */
async function handle(request: NextRequest) {
  const expected = process.env.CRON_SECRET || "";
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-cron-secret") || "";
  const provided = bearer || headerSecret;

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    // Try CONCURRENTLY first (zero downtime), fallback to plain REFRESH if not possible.
    try {
      await dbQuery(`REFRESH MATERIALIZED VIEW CONCURRENTLY video_rank_14d`);
    } catch (e: any) {
      logger.warn({ err: e?.message }, "refresh-rank concurrent failed, falling back");
      await dbQuery(`REFRESH MATERIALIZED VIEW video_rank_14d`);
    }

    const { rows } = await dbQuery(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE rank_score > 0)::int AS positive,
              MAX(rank_score)::numeric AS max_score
       FROM video_rank_14d`
    );

    const elapsedMs = Date.now() - startedAt;
    const stats = rows[0] || { total: 0, positive: 0, max_score: 0 };

    // cron_runs schema: (job_name, started_at, completed_at, status, duration_ms, result jsonb, error)
    try {
      await dbQuery(
        `INSERT INTO cron_runs (job_name, started_at, completed_at, duration_ms, status, result)
         VALUES ('refresh-rank', NOW() - ($1 || ' milliseconds')::interval, NOW(), $1, 'success', $2::jsonb)`,
        [elapsedMs, JSON.stringify(stats)]
      );
    } catch (err: any) {
      logger.warn({ err: err?.message }, "refresh-rank: cron_runs insert failed");
    }

    return NextResponse.json({ ok: true, elapsedMs, ...stats });
  } catch (e: any) {
    logger.error({ err: e?.message }, "refresh-rank failed");
    try {
      await dbQuery(
        `INSERT INTO cron_runs (job_name, started_at, completed_at, duration_ms, status, error)
         VALUES ('refresh-rank', NOW() - ($1 || ' milliseconds')::interval, NOW(), $1, 'failed', $2)`,
        [Date.now() - startedAt, String(e?.message || e).slice(0, 500)]
      );
    } catch {
      /* ignore secondary failure */
    }
    return NextResponse.json({ ok: false, error: e?.message || "refresh failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
