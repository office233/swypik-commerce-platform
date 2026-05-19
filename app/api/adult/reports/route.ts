/**
 * POST /api/adult/reports — public submission endpoint.
 *
 * Anyone (authenticated or not) can report a post / creator / comment / dm.
 * Critical categories (minor / csam / non_consensual / revenge) are pinned
 * to priority=1 and a CRITICAL audit entry is written.
 */

import { NextResponse } from "next/server";
import { adultQuery } from "@/lib/adult/db";
import { writeAuditFromRequest } from "@/lib/adult/audit";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export const dynamic = "force-dynamic";

const TARGET_TYPES = new Set(["post", "creator", "comment", "dm", "subscription"]);
const CRITICAL = new Set(["minor", "csam", "non_consensual", "revenge"]);

function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const targetType = String(body.targetType || "").trim();
  const targetId   = String(body.targetId   || "").trim();
  const category   = String(body.category   || "").trim().toLowerCase();
  const description= String(body.description|| "").trim();
  const evidence   = body.evidence && typeof body.evidence === "object" ? body.evidence : {};
  const reporterEmail = body.reporterEmail && typeof body.reporterEmail === "string"
    ? body.reporterEmail.trim().slice(0, 320) : null;

  if (!TARGET_TYPES.has(targetType)) return NextResponse.json({ error: "invalid_target_type" }, { status: 400 });
  if (!isUuid(targetId))             return NextResponse.json({ error: "invalid_target_id" }, { status: 400 });
  if (!category || category.length > 64) return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  if (!description || description.length < 5) return NextResponse.json({ error: "description_required" }, { status: 400 });
  if (description.length > 5000) return NextResponse.json({ error: "description_too_long" }, { status: 400 });

  let reporterUserId: string | null = null;
  try {
    const u = await getAuthUser();
    if (u.userId) reporterUserId = u.userId;
  } catch { /* anonymous */ }

  const priority = CRITICAL.has(category) ? 1 : 3;

  const { rows } = await adultQuery<{ id: string }>(
    `INSERT INTO adult.reports
       (reporter_user_id, reporter_email, target_type, target_id,
        category, description, evidence, status, priority)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'open',$8)
     RETURNING id::text`,
    [reporterUserId, reporterEmail, targetType, targetId, category, description,
     JSON.stringify(evidence), priority],
  );

  await writeAuditFromRequest({
    actorUserId: reporterUserId,
    action: priority === 1 ? "report.critical_filed" : "report.filed",
    targetType,
    targetId,
    afterState: { reportId: rows[0].id, category, priority },
  }, req.headers).catch(() => {});

  return NextResponse.json({ ok: true, reportId: rows[0].id, priority });
}
