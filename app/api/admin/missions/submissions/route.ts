/**
 * Admin — review submisii misiuni.
 *  GET  /api/admin/missions/submissions?status=submitted — listă pentru review
 *  POST /api/admin/missions/submissions — { submissionId, action: approve|reject|pay }
 *    - approve: marchează eligibilă
 *    - reject:  respinsă
 *    - pay:     creditează premiul în portofelul RON (lib/wallet/ledger, idempotent) + status paid
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { requireAuth } from "@/lib/auth/getAuthUser";
import { creditUser } from "@/lib/wallet/ledger";
import { logAdminAction } from "@/lib/security/admin-audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const __auth = await requireAuth(req, ["admin"]);
    if (__auth instanceof NextResponse) return __auth;

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "submitted").toLowerCase();
    const allowed = ["submitted", "approved", "rejected", "paid", "all"];
    if (!allowed.includes(status)) {
        return NextResponse.json({ error: "invalid_status" }, { status: 400 });
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
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const submissionId = String(body.submissionId || "").trim();
    const action = String(body.action || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(submissionId) || !["approve", "reject", "pay"].includes(action)) {
        return NextResponse.json({ error: "invalid_params" }, { status: 400 });
    }

    const { rows } = await dbQuery<{
        id: string;
        status: string;
        user_id: string;
        mission_id: string;
        prize_amount_minor: number;
        prize_currency: string;
        mission_slug: string;
    }>(
        `SELECT s.id, s.status, s.user_id, s.mission_id,
            m.prize_amount_minor, m.prize_currency, m.slug AS mission_slug
       FROM creator_mission_submissions s
       JOIN creator_missions m ON m.id = s.mission_id
      WHERE s.id = $1`,
        [submissionId],
    );
    if (!rows.length) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const sub = rows[0];

    if (action === "approve") {
        if (sub.status !== "submitted") {
            return NextResponse.json({ error: "invalid_transition", from: sub.status }, { status: 409 });
        }
        await dbQuery(
            `UPDATE creator_mission_submissions SET status = 'approved' WHERE id = $1`,
            [submissionId],
        );
        await logAdminAction({ action: "mission_submission.approve", targetType: "mission_submission", targetId: submissionId, req });
        return NextResponse.json({ ok: true, status: "approved" });
    }

    if (action === "reject") {
        if (!["submitted", "approved"].includes(sub.status)) {
            return NextResponse.json({ error: "invalid_transition", from: sub.status }, { status: 409 });
        }
        await dbQuery(
            `UPDATE creator_mission_submissions SET status = 'rejected' WHERE id = $1`,
            [submissionId],
        );
        await logAdminAction({ action: "mission_submission.reject", targetType: "mission_submission", targetId: submissionId, req });
        return NextResponse.json({ ok: true, status: "rejected" });
    }

    // pay
    if (sub.status !== "approved") {
        return NextResponse.json({ error: "not_approved" }, { status: 409 });
    }
    // Portofelul intern e în RON (cenți). Premiile în altă monedă (inclusiv
    // vechile premii SWYP, sistem eliminat) nu se plătesc automat.
    if (sub.prize_currency !== "RON") {
        return NextResponse.json(
            { error: "unsupported_prize_currency", currency: sub.prize_currency },
            { status: 422 },
        );
    }
    try {
        // Idempotent pe (refType, refId): o a doua plată pentru aceeași submisie e no-op.
        await creditUser({
            userId: sub.user_id,
            amountCents: sub.prize_amount_minor,
            refType: "mission_prize",
            refId: `mission:${sub.mission_id}:submission:${sub.id}`,
            description: `Premiu misiune ${sub.mission_slug}`,
            metadata: { missionSlug: sub.mission_slug, submissionId: sub.id },
        });
    } catch (err) {
        logger.error({ err, submissionId }, "mission.submission.payout_failed");
        return NextResponse.json({ error: "payout_failed" }, { status: 422 });
    }
    await dbQuery(
        `UPDATE creator_mission_submissions
        SET status = 'paid', paid_at = now(), payout_minor = $2, payout_currency = 'RON'
      WHERE id = $1`,
        [submissionId, sub.prize_amount_minor],
    );
    logger.info({ submissionId, userId: sub.user_id }, "mission.submission.paid");
    await logAdminAction({ action: "mission_submission.pay", targetType: "mission_submission", targetId: submissionId, details: { userId: sub.user_id, amountMinor: sub.prize_amount_minor }, req });
    return NextResponse.json({ ok: true, status: "paid" });
}
