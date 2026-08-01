/**
 * POST /api/admin/merchants/[id]/reject
 * Respinge o aplicație de comerciant local: status 'pending' → 'rejected'.
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const { rows } = await dbQuery(
      `UPDATE local_merchants
          SET status = 'rejected', updated_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING id, name`,
      [id],
    );
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "not_found_or_processed" }, { status: 404 });
    }
    return NextResponse.json({ success: true, merchant: rows[0] });
  } catch (error: unknown) {
    logger.error({ err: error, id }, "[admin/merchants/reject] error");
    return NextResponse.json({ success: false, error: "server_error" }, { status: 500 });
  }
}
