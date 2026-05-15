/**
 * POST /api/admin/applications/[id]/reject
 * Rejects a creator application atomically with a required reason.
 * Stores reason in review_note + metadata.reject_reason.
 * Sends notification email best-effort.
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email/service";

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
  const reason =
    typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!reason) {
    return NextResponse.json(
      { error: "Motivul respingerii este obligatoriu" },
      { status: 400 }
    );
  }

  const client = await getDb().connect();
  let userEmail: string | null = null;
  let username: string | null = null;
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
        userEmail = app.email || null;
        username = app.username || null;

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
    return NextResponse.json({ error: "Aplicație inexistentă" }, { status: 404 });
  }
  if (alreadyRejected) {
    return NextResponse.json({ error: "Aplicația este deja respinsă" }, { status: 409 });
  }

  if (userEmail) {
    try {
      const safeReason = reason.replace(/[<>]/g, "");
      await sendEmail({
        to: userEmail,
        subject: "Aplicatia ta de creator pe Swypik",
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111">
            <h1 style="margin:0 0 12px;font-size:22px">Salut${username ? ", @" + username : ""},</h1>
            <p>Multumim ca ai aplicat pentru contul de creator pe Swypik.</p>
            <p>Dupa analiza, aplicatia ta a fost <strong>respinsa</strong> din urmatorul motiv:</p>
            <blockquote style="margin:12px 0;padding:10px 14px;background:#f6f6f6;border-left:3px solid #ccc;color:#333;font-style:italic">${safeReason}</blockquote>
            <p>Poti reaplica oricand dupa ce remediezi aspectele mentionate.</p>
            <p style="margin-top:24px;color:#666;font-size:12px">Pentru intrebari, scrie-ne la support@swypik.com.</p>
          </div>
        `,
      });
    } catch (err) {
      console.warn("[admin/applications/reject] email send failed:", err);
    }
  }

  return NextResponse.json({ ok: true, action: "reject" });
}
