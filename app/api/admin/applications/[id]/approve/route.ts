/**
 * POST /api/admin/applications/[id]/approve
 * Approves a creator application atomically:
 *  - sets creator_applications.status='approved' (+ reviewed_at)
 *  - promotes user to role='creator' (preserving admin/moderator)
 *  - inserts a row in `creators` (legacy table) if email present, ON CONFLICT DO NOTHING/UPDATE
 *  - logs moderation action
 *  - sends notification email best-effort (non-blocking on failure)
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email/service";
import { APP_URL } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "ID invalid" }, { status: 400 });
  }

  const client = await getDb().connect();
  let userEmail: string | null = null;
  let username: string | null = null;
  let requestedHandle: string | null = null;
  let alreadyApproved = false;
  let notFound = false;
  try {
    const r = await client.query(
      `SELECT ca.id, ca.user_id, ca.status, ca.requested_handle, u.email, u.username, u.display_name
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
      if (app.status === "approved") {
        alreadyApproved = true;
      } else {
        userEmail = app.email || null;
        username = app.username || null;
        requestedHandle = app.requested_handle || null;

        await client.query("BEGIN");
        await client.query(
          `UPDATE creator_applications
              SET status = 'approved', reviewed_at = NOW(), updated_at = NOW()
            WHERE id = $1`,
          [id]
        );
        await client.query(
          `UPDATE users
              SET role = CASE WHEN role IN ('admin', 'moderator') THEN role ELSE 'creator' END,
                  updated_at = NOW()
            WHERE id = $1`,
          [app.user_id]
        );
        if (userEmail) {
          await client.query(
            `INSERT INTO creators (name, email, social_link, followers, status, metadata)
             VALUES ($1, $2, $3, $4, 'approved', $5::jsonb)
             ON CONFLICT (email) DO UPDATE
               SET status = 'approved', updated_at = NOW()`,
            [
              app.display_name || app.username || app.requested_handle || "creator",
              userEmail,
              "",
              "0",
              JSON.stringify({
                source: "admin_applications",
                user_id: app.user_id,
                application_id: id,
              }),
            ]
          );
        }
        await client.query(
          `INSERT INTO moderation_actions (actor_user_id, target_user_id, action_type, reason, metadata)
           VALUES (NULL, $1, 'restore', $2, $3::jsonb)`,
          [
            app.user_id,
            "Creator application approved",
            JSON.stringify({
              source: "admin_applications_page",
              kind: "application_decision",
              decision: "approved",
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
  if (alreadyApproved) {
    return NextResponse.json({ error: "Aplicația este deja aprobată" }, { status: 409 });
  }

  if (userEmail) {
    try {
      const handleStr = requestedHandle || username || "creator";
      await sendEmail({
        to: userEmail,
        subject: "Aplicatia ta de creator a fost aprobata!",
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111">
            <h1 style="margin:0 0 12px;font-size:22px">Felicitari, @${handleStr}!</h1>
            <p>Aplicatia ta de creator pe Swypik a fost <strong>aprobata</strong>.</p>
            <p>Acum poti publica videoclipuri, primi urmaritori si accesa panoul de creator.</p>
            <p style="margin-top:16px"><a href="${APP_URL}/creator" style="background:#0D0D0D;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Deschide panoul de creator</a></p>
            <p style="margin-top:24px;color:#666;font-size:12px">Daca nu ai cerut acest lucru, ignora acest email.</p>
          </div>
        `,
      });
    } catch (err) {
      console.warn("[admin/applications/approve] email send failed:", err);
    }
  }

  return NextResponse.json({ ok: true, action: "approve" });
}
