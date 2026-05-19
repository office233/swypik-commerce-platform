/**
 * POST /api/adult/admin/posts/[id]/takedown — admin-only DMCA / policy takedown.
 *
 * Body: { reason: string, dmca?: { complainant?, copyrightWork?, ... }, closeReports?: boolean }
 *
 * - Sets adult.posts.status='dmca_removed' (or 'removed' if reason !== 'dmca').
 * - Optionally marks all open reports targeting this post as 'actioned'.
 * - Writes an audit log entry.
 */

import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { adultQuery, adultTx } from "@/lib/adult/db";
import { writeAuditFromRequest } from "@/lib/adult/audit";

export const dynamic = "force-dynamic";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const reason = String(body.reason || "policy").trim().slice(0, 200);
  const newStatus = reason.toLowerCase().startsWith("dmca") ? "dmca_removed" : "removed";
  const closeReports = body.closeReports !== false;
  const dmcaMeta = body.dmca && typeof body.dmca === "object" ? body.dmca : null;

  const admin = await getAuthUser().catch(() => ({ userId: null as string | null }));
  const adminUserId = admin.userId || null;

  // Fetch current state for audit
  const { rows: before } = await adultQuery<{ status: string; creator_user_id: string }>(
    `SELECT status, creator_user_id::text FROM adult.posts WHERE id = $1`,
    [id],
  );
  if (before.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const reportIds: string[] = [];
  await adultTx(async (client) => {
    await client.query(
      `UPDATE adult.posts
          SET status = $2, decided_at = now(), decided_by = $3, updated_at = now()
        WHERE id = $1`,
      [id, newStatus, adminUserId],
    );
    if (closeReports) {
      const r = await client.query<{ id: string }>(
        `UPDATE adult.reports
            SET status = 'actioned', reviewed_by = $2, reviewed_at = now(),
                action_taken = $3,
                dmca_metadata = COALESCE(dmca_metadata, '{}'::jsonb) || $4::jsonb
          WHERE target_type = 'post' AND target_id = $1
            AND status IN ('open','investigating')
          RETURNING id::text`,
        [id, adminUserId, `post_${newStatus}`, JSON.stringify(dmcaMeta || {})],
      );
      reportIds.push(...r.rows.map(x => x.id));
    }
  });

  await writeAuditFromRequest({
    actorUserId: adminUserId,
    action: newStatus === "dmca_removed" ? "post.dmca_takedown" : "post.takedown",
    targetType: "post",
    targetId: id,
    reason,
    beforeState: { status: before[0].status, creatorUserId: before[0].creator_user_id },
    afterState: { status: newStatus, closedReports: reportIds, dmca: dmcaMeta },
  }, req.headers).catch(() => {});

  return NextResponse.json({ ok: true, id, status: newStatus, closedReports: reportIds });
}
