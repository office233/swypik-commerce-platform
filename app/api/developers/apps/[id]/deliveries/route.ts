/**
 * GET /api/developers/apps/[id]/deliveries — ultimele 50 livrări webhook
 * pentru un app deținut de developerul aprobat curent.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { withErrorHandling } from "@/lib/api-handler";
import { requireApprovedDeveloper } from "../../../_lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withErrorHandling(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireApprovedDeveloper();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const owned = await dbQuery(
    `SELECT id FROM apps WHERE id = $1 AND developer_id = $2 LIMIT 1`,
    [id, guard.developer.id],
  );
  if (owned.rows.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { rows } = await dbQuery(
    `SELECT event, status_code, error, attempts, created_at
       FROM app_webhook_deliveries
      WHERE app_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [id],
  );
  return NextResponse.json({ deliveries: rows });
});
