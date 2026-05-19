/**
 * GET /api/adult/admin/reports — admin-only list of open / investigating reports.
 *
 * Query params:
 *   ?status=open|investigating|actioned|dismissed|escalated_law_enforcement (default: open,investigating)
 *   ?limit=20 (max 100)
 *   ?cursor=<created_at iso>  // pagination
 */

import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { adultQuery } from "@/lib/adult/db";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["open", "investigating", "actioned", "dismissed", "escalated_law_enforcement"]);

export async function GET(req: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const u = new URL(req.url);
  const statusParam = (u.searchParams.get("status") || "open,investigating").split(",")
    .map(s => s.trim().toLowerCase())
    .filter(s => STATUSES.has(s));
  const statuses = statusParam.length ? statusParam : ["open", "investigating"];

  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") || 20)));
  const cursor = u.searchParams.get("cursor");

  const params: any[] = [statuses];
  let where = `status = ANY($1::text[])`;
  if (cursor) {
    params.push(cursor);
    where += ` AND created_at < $${params.length}::timestamptz`;
  }
  params.push(limit);

  const { rows } = await adultQuery(
    `SELECT id::text, reporter_user_id::text, reporter_email,
            target_type, target_id::text, category, description,
            evidence, status, priority, created_at,
            reviewed_by::text, reviewed_at, action_taken
       FROM adult.reports
      WHERE ${where}
      ORDER BY priority ASC, created_at DESC
      LIMIT $${params.length}`,
    params,
  );

  return NextResponse.json({
    ok: true,
    reports: rows,
    nextCursor: rows.length === limit ? rows[rows.length - 1].created_at : null,
  });
}
