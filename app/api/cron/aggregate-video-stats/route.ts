import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dbQuery } from "@/lib/db";
import { runCron } from "@/lib/cron/runCron";

export const dynamic = "force-dynamic";

const AGGREGATE_DAYS = Number(process.env.VIDEO_STATS_AGGREGATE_DAYS ?? 7);
const SYNC_VIDEO_COUNTERS = (process.env.VIDEO_STATS_SYNC_COUNTERS ?? "1") !== "0";

function authorize(req: Request): boolean {
  const header =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    req.headers.get("x-cron-secret") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !header) return false;
  if (Buffer.byteLength(header) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

// Map raw event_type variants to a canonical bucket used in video_stats_daily.
const EVENT_BUCKETS: Array<{ bucket: string; types: string[] }> = [
  { bucket: "impression", types: ["impression"] },
  { bucket: "view", types: ["video_view", "video_viewed"] },
  { bucket: "watch", types: ["watch_time"] },
  { bucket: "completion", types: ["completion"] },
  { bucket: "like", types: ["like", "video_liked"] },
  { bucket: "save", types: ["save", "video_saved"] },
  { bucket: "share", types: ["share", "video_shared"] },
  { bucket: "comment", types: ["comment_created", "video_commented"] },
  { bucket: "product_click", types: ["product_click"] },
  { bucket: "add_to_cart", types: ["add_to_cart"] },
  { bucket: "purchase", types: ["purchase"] },
  { bucket: "follow", types: ["creator_followed", "follow"] },
];

async function aggregate(days: number) {
  // Build a CASE that maps event_type into a bucket. Use one big SQL upsert
  // so the cron call is a single DB round-trip per "day window".
  const bucketCase = EVENT_BUCKETS.map(
    (b) => `WHEN event_type IN (${b.types.map((t) => `'${t}'`).join(",")}) THEN '${b.bucket}'`
  ).join("\n      ");

  const result = await dbQuery<{ upserted: string }>(
    `WITH agg AS (
       SELECT
         video_id,
         (occurred_at AT TIME ZONE 'UTC')::date AS stat_date,
         COUNT(*) FILTER (WHERE bucket = 'impression')    AS impressions,
         COUNT(*) FILTER (WHERE bucket = 'view')          AS views,
         COALESCE(SUM(watch_ms) FILTER (WHERE bucket = 'watch'), 0) AS watch_ms_sum,
         COUNT(*) FILTER (WHERE bucket = 'completion')    AS completions,
         COUNT(*) FILTER (WHERE bucket = 'like')          AS likes,
         COUNT(*) FILTER (WHERE bucket = 'save')          AS saves,
         COUNT(*) FILTER (WHERE bucket = 'share')         AS shares,
         COUNT(*) FILTER (WHERE bucket = 'comment')       AS comments,
         COUNT(*) FILTER (WHERE bucket = 'product_click') AS product_clicks,
         COUNT(*) FILTER (WHERE bucket = 'add_to_cart')   AS add_to_cart,
         COUNT(*) FILTER (WHERE bucket = 'purchase')      AS purchases,
         COUNT(*) FILTER (WHERE bucket = 'follow')        AS follows
       FROM (
         SELECT video_id, occurred_at, watch_ms,
                CASE
                  ${bucketCase}
                  ELSE NULL
                END AS bucket
           FROM feed_events
          WHERE video_id IS NOT NULL
            AND occurred_at >= now() - ($1::int * INTERVAL '1 day')
       ) e
       WHERE bucket IS NOT NULL
       GROUP BY video_id, stat_date
     )
     INSERT INTO video_stats_daily (
       video_id, stat_date, impressions, views, watch_ms_sum, completions,
       likes, saves, shares, comments, product_clicks, add_to_cart, purchases, follows, computed_at
     )
     SELECT video_id, stat_date, impressions, views, watch_ms_sum, completions,
            likes, saves, shares, comments, product_clicks, add_to_cart, purchases, follows, now()
       FROM agg
     ON CONFLICT (video_id, stat_date) DO UPDATE SET
       impressions    = EXCLUDED.impressions,
       views          = EXCLUDED.views,
       watch_ms_sum   = EXCLUDED.watch_ms_sum,
       completions    = EXCLUDED.completions,
       likes          = EXCLUDED.likes,
       saves          = EXCLUDED.saves,
       shares         = EXCLUDED.shares,
       comments       = EXCLUDED.comments,
       product_clicks = EXCLUDED.product_clicks,
       add_to_cart    = EXCLUDED.add_to_cart,
       purchases      = EXCLUDED.purchases,
       follows        = EXCLUDED.follows,
       computed_at    = now()
     RETURNING video_id::text AS upserted`,
    [days]
  );

  return result.rowCount ?? result.rows.length;
}

async function syncVideoCounters() {
  // Resync videos.{view_count,like_count,save_count,share_count,comment_count}
  // from the lifetime sum in video_stats_daily so the aggregate columns
  // reflect reality after re-aggregation.
  const result = await dbQuery<{ id: string }>(
    `WITH lifetime AS (
       SELECT video_id,
              SUM(views)    AS views,
              SUM(likes)    AS likes,
              SUM(saves)    AS saves,
              SUM(shares)   AS shares,
              SUM(comments) AS comments
         FROM video_stats_daily
        GROUP BY video_id
     )
     UPDATE videos v
        SET view_count    = GREATEST(v.view_count,    l.views),
            like_count    = GREATEST(v.like_count,    l.likes),
            save_count    = GREATEST(v.save_count,    l.saves),
            share_count   = GREATEST(v.share_count,   l.shares),
            comment_count = GREATEST(v.comment_count, l.comments)
       FROM lifetime l
      WHERE v.id = l.video_id
        AND (
          v.view_count    < l.views    OR
          v.like_count    < l.likes    OR
          v.save_count    < l.saves    OR
          v.share_count   < l.shares   OR
          v.comment_count < l.comments
        )
      RETURNING v.id`
  );
  return result.rowCount ?? result.rows.length;
}

async function run() {
  const t0 = Date.now();
  const upserted = await aggregate(AGGREGATE_DAYS);
  const synced = SYNC_VIDEO_COUNTERS ? await syncVideoCounters() : 0;
  return {
    ok: true,
    aggregate_days: AGGREGATE_DAYS,
    rows_upserted: upserted,
    videos_counter_synced: synced,
    elapsed_ms: Date.now() - t0,
    ts: new Date().toISOString(),
  };
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runCron("aggregate-video-stats", async () => {
    const summary = await run();
    return NextResponse.json(summary);
  });
}

export async function POST(req: Request) {
  return GET(req);
}
