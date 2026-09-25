/**
 * POST /api/admin/applications/[id]/reject
 * Rejects a creator application atomically with a required reason.
 * Stores reason in review_note + metadata.reject_reason.
 * Sends notification email best-effort.
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { getDb } from "@/lib/db";
import { notifyApplicationDecision } from "@/lib/creator/application-notify";
import { logger } from "@/lib/logger";
import { logAdminAction } from "@/lib/security/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!reason) {
    return NextResponse.json(
      { error: "reason_required" },
      { status: 400 }
    );
  }

  const client = await getDb().connect();
  let appUserId: string | null = null;
  let alreadyRejected = false;
  let notFound = false;
  try {
    const r = await client.query(
      `SELECT ca.id, ca.user_id, ca.status, u.email, u.username
         FROM creator_applications ca
         JOIN users u ON u.id = ca.user_id
        WHERE ca.id = $1
        LIMIT 1`,
      [id]
    );
    if (r.rows.length === 0) {
      notFound = true;
    } else {
      const app = r.rows[0];
      if (app.status === "rejected") {
        alreadyRejected = true;
      } else {
        appUserId = app.user_id;

        await client.query("BEGIN");
        await client.query(
          `UPDATE creator_applications
              SET status = 'rejected',
                  review_note = $2,
                  reviewed_at = NOW(),
                  updated_at = NOW(),
                  metadata = COALESCE(metadata, '{}'::jsonb)
                             || jsonb_build_object('reject_reason', $2::text)
            WHERE id = $1`,
          [id, reason]
        );
        await client.query(
          `INSERT INTO moderation_actions (actor_user_id, target_user_id, action_type, reason, metadata)
           VALUES (NULL, $1, 'warn', $2, $3::jsonb)`,
          [
            app.user_id,
            reason,
            JSON.stringify({
              source: "admin_applications_page",
              kind: "application_decision",
              decision: "rejected",
              application_id: id,
            }),
          ]
        );
        await client.query("COMMIT");
      }
    }
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }

  if (notFound) {
    return NextResponse.json({ error: "application_not_found" }, { status: 404 });
  }
  if (alreadyRejected) {
    return NextResponse.json({ error: "already_rejected" }, { status: 409 });
  }

  if (appUserId) {
    await notifyApplicationDecision({ userId: appUserId, decision: "rejected", reason });
  }

  await logAdminAction({
    action: "application.reject",
    targetType: "creator_application",
    targetId: id,
    details: { reason },
    req,
  });

  return NextResponse.json({ ok: true, action: "reject" });
}
