/**
 * POST /api/admin/moderation/[id]/hide-video
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS_RO: Record<string, string> = {
  spam: "Spam",
  harassment: "Hărțuire",
  hate: "Discurs de ură",
  violence: "Violență",
  sexual_content: "Conținut explicit",
  scam: "Fraudă",
  copyright: "Drepturi de autor",
  other: "Încălcare reguli",
};

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
    `SELECT mr.id, mr.reason, mr.target_video_id, v.creator_id
     FROM moderation_reports mr
     LEFT JOIN videos v ON v.id = mr.target_video_id
     WHERE mr.id = $1 LIMIT 1`,
    [id]
  );
  if (r.rows.length === 0 || !r.rows[0].target_video_id) {
    return NextResponse.json({ error: "Raport invalid sau fără video" }, { status: 404 });
  }
  const rep = r.rows[0];

  await dbQuery("BEGIN");
  try {
    await dbQuery(
      `UPDATE videos SET is_hidden = true, hidden_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [rep.target_video_id]
    );
    await dbQuery(
      `UPDATE moderation_reports
       SET status = 'actioned', updated_at = NOW()
       WHERE target_video_id = $1 AND status IN ('open', 'triaged')`,
      [rep.target_video_id]
    );
    const caseRow = await dbQuery(
      `INSERT INTO moderation_cases (opened_by_report_id, target_video_id, severity, status, decision, resolution_note, resolved_at)
       VALUES ($1, $2, 'medium', 'resolved', 'hide', $3, NOW())
       RETURNING id`,
      [id, rep.target_video_id, note]
    );
    await dbQuery(
      `INSERT INTO moderation_actions (case_id, target_video_id, action_type, reason)
       VALUES ($1, $2, 'hide', $3)`,
      [caseRow.rows[0].id, rep.target_video_id, note || REASONS_RO[rep.reason] || rep.reason]
    );
    if (rep.creator_id) {
      const reasonLabel = REASONS_RO[rep.reason] || "încălcare reguli";
      await dbQuery(
        `INSERT INTO notifications (user_id, video_id, notification_type, title, body, action_url, delivery_status)
         VALUES ($1, $2, 'system', $3, $4, '/account', 'queued')`,
        [
          rep.creator_id,
          rep.target_video_id,
          "Videoclipul tău a fost ascuns",
          `Conținutul tău a fost ascuns pentru: ${reasonLabel}. Contactează suportul dacă crezi că e o eroare.`,
        ]
      );
    }
    await dbQuery("COMMIT");
  } catch (e) {
    await dbQuery("ROLLBACK");
    throw e;
  }

  return NextResponse.json({ ok: true, action: "hide-video" });
}
