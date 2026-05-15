/**
 * POST /api/admin/moderation/[id]/dismiss
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "ID invalid" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;

  const r = await dbQuery(
    `SELECT id, target_video_id, target_user_id FROM moderation_reports WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (r.rows.length === 0) {
    return NextResponse.json({ error: "Raport inexistent" }, { status: 404 });
  }
  const rep = r.rows[0];

  await dbQuery("BEGIN");
  try {
    await dbQuery(
      `UPDATE moderation_reports SET status = 'dismissed', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    const caseRow = await dbQuery(
      `INSERT INTO moderation_cases (opened_by_report_id, target_video_id, target_user_id, severity, status, decision, resolution_note, resolved_at)
       VALUES ($1, $2, $3, 'low', 'dismissed', 'no_action', $4, NOW())
       RETURNING id`,
      [id, rep.target_video_id, rep.target_user_id, note]
    );
    await dbQuery(
      `INSERT INTO moderation_actions (case_id, target_video_id, target_user_id, action_type, reason)
       VALUES ($1, $2, $3, 'restore', $4)`,
      [caseRow.rows[0].id, rep.target_video_id, rep.target_user_id, note || "Dismissed by admin"]
    );
    await dbQuery("COMMIT");
  } catch (e) {
    await dbQuery("ROLLBACK");
    throw e;
  }

  return NextResponse.json({ ok: true, action: "dismiss" });
}
