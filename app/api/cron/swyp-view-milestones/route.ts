import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dbQuery } from "@/lib/db";
import { awardSwyp } from "@/lib/swyp/rewards";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function authorizeCronRequest(request: NextRequest): boolean {
    const expectedSecret = process.env.CRON_SECRET || "";
    const authorization = request.headers.get("authorization") || "";
    const bearerToken = authorization.toLowerCase().startsWith("bearer ")
        ? authorization.slice(7).trim()
        : "";
    const providedSecret =
        bearerToken ||
        request.headers.get("x-cron-secret") ||
        request.headers.get("cron-secret") ||
        "";
    if (!expectedSecret || !providedSecret) return false;
    if (Buffer.byteLength(providedSecret) !== Buffer.byteLength(expectedSecret)) return false;
    return timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expectedSecret));
}

const MILESTONE_STEP = 1000; // regula creator_1k_views = per 1000 vizionări

/**
 * GET/POST /api/cron/swyp-view-milestones
 *
 * Acordă recompensa `creator_1k_views` creatorilor pentru fiecare prag de
 * 1000 de vizionări atins de clipurile lor. Idempotent: refId unic per
 * (video, prag) — awardSwyp nu plătește de două ori același ref.
 *
 * Progresul se ține în video_view_milestones (ultimul prag plătit per video),
 * ca să nu rescanăm istoricul întreg la fiecare rulare.
 */
async function handle(request: NextRequest) {
    if (!authorizeCronRequest(request)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const startedAt = Date.now();

    // tabela de progres (idempotent, prima rulare o creează)
    await dbQuery(`
    CREATE TABLE IF NOT EXISTS video_view_milestones (
      video_id uuid PRIMARY KEY,
      last_milestone bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);

    // clipuri publicate cu praguri noi de plătit (max 200/rulare)
    const { rows } = await dbQuery<{
        id: string;
        creator_id: string;
        view_count: string;
        last_milestone: string;
    }>(
        `SELECT v.id, v.creator_id, v.view_count::text,
            COALESCE(m.last_milestone, 0)::text AS last_milestone
       FROM videos v
       LEFT JOIN video_view_milestones m ON m.video_id = v.id
      WHERE v.status = 'published'
        AND v.creator_id IS NOT NULL
        AND v.view_count >= COALESCE(m.last_milestone, 0) + $1
      ORDER BY v.view_count DESC
      LIMIT 200`,
        [MILESTONE_STEP],
    );

    let awarded = 0;
    let skipped = 0;
    for (const row of rows) {
        const views = Number(row.view_count);
        const paidUpTo = Number(row.last_milestone);
        const targetMilestone = Math.floor(views / MILESTONE_STEP) * MILESTONE_STEP;

        // plătește fiecare prag intermediar (ex. 0→3000 = 3 recompense)
        for (let ms = paidUpTo + MILESTONE_STEP; ms <= targetMilestone; ms += MILESTONE_STEP) {
            try {
                const res = await awardSwyp({
                    userId: row.creator_id,
                    action: "creator_1k_views",
                    refId: `video:${row.id}:views:${ms}`,
                    metadata: { videoId: row.id, milestone: ms },
                });
                if (res.awarded) awarded += 1;
                else {
                    skipped += 1;
                    // cap zilnic atins → oprim pentru acest creator, reluăm mâine
                    if (res.reason === "daily_cap_reached") break;
                }
            } catch (err) {
                logger.error({ err, videoId: row.id, milestone: ms }, "view-milestones.award.failed");
                break;
            }
        }

        await dbQuery(
            `INSERT INTO video_view_milestones (video_id, last_milestone, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (video_id) DO UPDATE
         SET last_milestone = GREATEST(video_view_milestones.last_milestone, EXCLUDED.last_milestone),
             updated_at = now()`,
            [row.id, targetMilestone],
        );
    }

    const ms = Date.now() - startedAt;
    logger.info({ candidates: rows.length, awarded, skipped, ms }, "cron.view-milestones.done");
    return NextResponse.json({ ok: true, candidates: rows.length, awarded, skipped, ms });
}

export async function GET(request: NextRequest) {
    return handle(request);
}
export async function POST(request: NextRequest) {
    return handle(request);
}
