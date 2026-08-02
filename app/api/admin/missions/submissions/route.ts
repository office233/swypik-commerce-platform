/**
 * Admin — review submisii misiuni.
 *  GET  /api/admin/missions/submissions?status=submitted — listă pentru review
 *  POST /api/admin/missions/submissions — { submissionId, action: approve|reject|pay }
 *    - approve: marchează eligibilă
 *    - reject:  respinsă
 *    - pay:     plătește premiul în SWYP (awardSwyp idempotent) + status paid
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { requireAuth } from "@/lib/auth/getAuthUser";
import { awardSwyp } from "@/lib/swyp/rewards";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const __auth = await requireAuth(req, ["admin"]);
    if (__auth instanceof NextResponse) return __auth;

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "submitted").toLowerCase();
    const allowed = ["submitted", "approved", "rejected", "paid", "all"];
    if (!allowed.includes(status)) {
        return NextResponse.json({ error: "status invalid" }, { status: 400 });
    }

    const { rows } = await dbQuery(
        `SELECT s.id, s.status, s.views, s.sales, s.payout_minor, s.payout_currency,
            s.submitted_at, s.paid_at,
            m.slug AS mission_slug, m.title AS mission_title,
            m.prize_amount_minor, m.prize_currency,
            v.id AS video_id, v.title AS video_title, v.view_count,
            u.id AS user_id, u.username
       FROM creator_mission_submissions s
       JOIN creator_missions m ON m.id = s.mission_id
       JOIN videos v ON v.id = s.video_id
       JOIN users u ON u.id = s.user_id
      WHERE ($1 = 'all' OR s.status = $1)
      ORDER BY s.submitted_at ASC
      LIMIT 200`,
        [status],
    );
    return NextResponse.json({ submissions: rows });
}

export async function POST(req: Request) {
    const __auth = await requireAuth(req, ["admin"]);
    if (__auth instanceof NextResponse) return __auth;

    let body: { submissionId?: string; action?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Body invalid." }, { status: 400 });
    }
    const submissionId = String(body.submissionId || "").trim();
    const action = String(body.action || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(submissionId) || !["approve", "reject", "pay"].includes(action)) {
        return NextResponse.json({ error: "Parametri invalizi." }, { status: 400 });
    }

    const { rows } = await dbQuery<{
        id: string;
        status: string;
        user_id: string;
        mission_id: string;
        prize_amount_minor: number;
        mission_slug: string;
    }>(
        `SELECT s.id, s.status, s.user_id, s.mission_id,
            m.prize_amount_minor, m.slug AS mission_slug
       FROM creator_mission_submissions s
       JOIN creator_missions m ON m.id = s.mission_id
      WHERE s.id = $1`,
        [submissionId],
    );
    if (!rows.length) {
        return NextResponse.json({ error: "Submisie inexistentă." }, { status: 404 });
    }
    const sub = rows[0];

    if (action === "approve") {
        if (sub.status !== "submitted") {
            return NextResponse.json({ error: `Tranziție invalidă din '${sub.status}'.` }, { status: 409 });
        }
        await dbQuery(
            `UPDATE creator_mission_submissions SET status = 'approved' WHERE id = $1`,
            [submissionId],
        );
        return NextResponse.json({ ok: true, status: "approved" });
    }

    if (action === "reject") {
        if (!["submitted", "approved"].includes(sub.status)) {
            return NextResponse.json({ error: `Tranziție invalidă din '${sub.status}'.` }, { status: 409 });
        }
        await dbQuery(
            `UPDATE creator_mission_submissions SET status = 'rejected' WHERE id = $1`,
            [submissionId],
        );
        return NextResponse.json({ ok: true, status: "rejected" });
    }

    // pay
    if (sub.status !== "approved") {
        return NextResponse.json({ error: "Doar submisiile aprobate pot fi plătite." }, { status: 409 });
    }
    const res = await awardSwyp({
        userId: sub.user_id,
        action: "mission_prize",
        refId: `mission:${sub.mission_id}:submission:${sub.id}`,
        metadata: { missionSlug: sub.mission_slug, submissionId: sub.id },
    });
    // awardSwyp e idempotent pe refId — un ref deja plătit întoarce awarded:true.
    if (!res.awarded) {
        return NextResponse.json(
            { error: `Plata SWYP a eșuat: ${res.reason}` },
            { status: 422 },
        );
    }
    await dbQuery(
        `UPDATE creator_mission_submissions
        SET status = 'paid', paid_at = now(), payout_minor = $2, payout_currency = 'SWYP'
      WHERE id = $1`,
        [submissionId, sub.prize_amount_minor],
    );
    logger.info({ submissionId, userId: sub.user_id }, "mission.submission.paid");
    return NextResponse.json({ ok: true, status: "paid" });
}
