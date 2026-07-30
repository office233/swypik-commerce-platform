/**
 * POST /api/developers/apps/[id]/rotate-secret — regenerează client_secret.
 * Noul secret este returnat O SINGURĂ DATĂ; în DB se salvează doar sha256.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withErrorHandling } from "@/lib/api-handler";
import { generateSecret, sha256Hex } from "@/lib/apps/auth";
import { requireApprovedDeveloper } from "../../../_lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withErrorHandling(async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireApprovedDeveloper();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const newSecret = generateSecret("swksec");
  const { rowCount } = await dbQuery(
    `UPDATE apps SET oauth_client_secret_hash = $1, updated_at = now()
      WHERE id = $2 AND developer_id = $3`,
    [sha256Hex(newSecret), id, guard.developer.id],
  );
  if (rowCount === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  logger.info({ app_id: id, developer_id: guard.developer.id }, "[developers] secret rotated");
  return NextResponse.json({ oauth_client_secret: newSecret });
});
