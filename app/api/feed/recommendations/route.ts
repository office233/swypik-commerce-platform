import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/**
 * GET /api/feed/recommendations?limit=20&session_id=...
 *
 * Returns an ordered list of video IDs ranked by personalised engagement
 * signals captured in `feed_events`. The formula mirrors the planning doc:
 *
 *   score = watch_completion * 5
 *         + saves    * 3
 *         + shares   * 2
 *         + likes    * 1.5
 *         + add_to_cart * 4
 *         + purchases  * 8
 *         - skip_fast * 4
 *         - reports   * 10
 *         + freshness
 *         + category_boost          (personalisation)
 *
 * Personalisation: categories of videos the caller has saved in the last 30
 * days receive a multiplicative boost. The query is intentionally compact —
 * heavy ranking (ANN, embeddings, A/B treatments) is the responsibility of
 * the Go platform-api ranking service. This endpoint is the Postgres
 * fast-path used while that service ramps up.
 *
 * The endpoint is anonymous-safe: if there is no user, ranking degrades to
 * "popular among the last 100 candidates with mild freshness boost".
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 50);
  const candidateWindow = 200;

  const userId = await getOptionalSocialUserId().catch(() => null);
  const sessionId = url.searchParams.get("session_id");

  // Subject identifier for personalisation. Prefer userId, fall back to
  // session_id, then to "anonymous" (no boost).
  const ranker = userId ?? sessionId ?? null;

  const sql = `
    WITH candidates AS (
      SELECT id, duration_ms, COALESCE(published_at, created_at) AS published_at,
             (metadata->>'category_id')::text AS category_id
      FROM videos
      WHERE status = 'ready' AND visibility = 'public'
      ORDER BY COALESCE(published_at, created_at) DESC
      LIMIT $1
    ),
    agg AS (
      SELECT
        c.id,
        c.duration_ms,
        c.published_at,
        c.category_id,
        COALESCE(SUM(e.watch_ms), 0)::bigint                                     AS watch_ms_sum,
        COUNT(*) FILTER (WHERE e.event_type = 'completion')                     AS completions,
        COUNT(*) FILTER (WHERE e.event_type = 'save')                           AS saves,
        COUNT(*) FILTER (WHERE e.event_type = 'share')                          AS shares,
        COUNT(*) FILTER (WHERE e.event_type = 'like')                           AS likes,
        COUNT(*) FILTER (WHERE e.event_type = 'add_to_cart')                    AS add_to_cart,
        COUNT(*) FILTER (WHERE e.event_type = 'purchase')                       AS purchases,
        COUNT(*) FILTER (WHERE e.event_type = 'skip_fast')                      AS skips,
        COUNT(*) FILTER (WHERE e.event_type = 'report')                         AS reports,
        COUNT(*) FILTER (WHERE e.event_type = 'not_interested')                 AS not_interested
      FROM candidates c
      LEFT JOIN feed_events e
        ON e.video_id = c.id
       AND e.occurred_at > NOW() - INTERVAL '14 days'
      GROUP BY c.id, c.duration_ms, c.published_at, c.category_id
    ),
    user_pref AS (
      SELECT (v.metadata->>'category_id')::text AS category_id, COUNT(*)::int AS affinity
      FROM feed_events e
      JOIN videos v ON v.id = e.video_id
      WHERE e.occurred_at > NOW() - INTERVAL '30 days'
        AND e.event_type IN ('save', 'like', 'purchase', 'more_like_this')
        AND (
          ($2::uuid IS NOT NULL AND e.actor_user_id = $2::uuid)
          OR ($2::uuid IS NULL AND $3::text IS NOT NULL AND e.session_id = $3::text)
        )
      GROUP BY (v.metadata->>'category_id')
    )
    SELECT
      a.id,
      a.category_id,
      (
        CASE WHEN a.duration_ms > 0
             THEN LEAST(a.watch_ms_sum::numeric / NULLIF(a.duration_ms, 0), 50) * 5
             ELSE 0
        END
        + a.saves        * 3
        + a.shares       * 2
        + a.likes        * 1.5
        + a.add_to_cart  * 4
        + a.purchases    * 8
        - a.skips        * 4
        - a.reports      * 10
        - a.not_interested * 6
        + GREATEST(0, 5 - EXTRACT(EPOCH FROM (NOW() - a.published_at)) / (86400.0 * 3))
        + COALESCE(up.affinity, 0) * 2
      )::float8 AS score
    FROM agg a
    LEFT JOIN user_pref up ON up.category_id = a.category_id
    ORDER BY score DESC NULLS LAST, a.published_at DESC
    LIMIT $4
  `;

  try {
    const userParam = userId ?? null;
    const sessionParam = userId ? null : ranker;
    const { rows } = await dbQuery<{ id: string; category_id: string | null; score: number }>(
      sql,
      [candidateWindow, userParam, sessionParam, limit],
    );

    return NextResponse.json({
      video_ids: rows.map((r) => r.id),
      results: rows,
      personalised: Boolean(userParam || sessionParam),
    });
  } catch (error) {
    logger.error({ err: error }, "[feed/recommendations]");
    return NextResponse.json({ error: "ranking_failed" }, { status: 500 });
  }
}
