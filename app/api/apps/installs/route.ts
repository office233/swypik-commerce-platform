/**
 * GET    /api/apps/installs — apps instalate de seller-ul logat.
 * DELETE /api/apps/installs?app_id=... — dezinstalare (revocă tokenul).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withErrorHandling } from "@/lib/api-handler";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withErrorHandling(async function GET() {
  const user = await getAuthUser();
  if (!user.sellerId) return NextResponse.json({ error: "seller_login_required" }, { status: 401 });

  const { rows } = await dbQuery(
    `SELECT i.id, i.granted_scopes, i.installed_at,
            a.id AS app_id, a.name, a.slug, a.icon_url
       FROM app_installs i
       JOIN apps a ON a.id = i.app_id
      WHERE i.seller_id = $1 AND i.revoked_at IS NULL
      ORDER BY i.installed_at DESC`,
    [user.sellerId],
  );
  return NextResponse.json({ installs: rows });
});

export const DELETE = withErrorHandling(async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!user.sellerId) return NextResponse.json({ error: "seller_login_required" }, { status: 401 });

  const url = new URL(req.url);
  const appId = url.searchParams.get("app_id");
  if (!appId) return NextResponse.json({ error: "missing_app_id" }, { status: 400 });

  const { rowCount } = await dbQuery(
    `UPDATE app_installs
        SET revoked_at = now(), api_token_hash = NULL
      WHERE app_id = $1 AND seller_id = $2 AND revoked_at IS NULL`,
    [appId, user.sellerId],
  );
  if (rowCount === 0) return NextResponse.json({ error: "not_installed" }, { status: 404 });

  logger.info({ app_id: appId, seller_id: user.sellerId }, "[apps] uninstalled");
  return NextResponse.json({ ok: true });
});
