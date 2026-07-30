/**
 * GET /api/apps/[slug] — detaliu app published + starea instalării
 * pentru seller-ul logat (dacă există sesiune de seller).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { withErrorHandling } from "@/lib/api-handler";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { SCOPE_DESCRIPTIONS, sanitizeScopes } from "@/lib/apps/scopes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withErrorHandling(async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { rows } = await dbQuery<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon_url: string | null;
    scopes: string[];
    oauth_client_id: string;
    developer_company: string;
    developer_website: string | null;
    created_at: string;
  }>(
    `SELECT a.id, a.name, a.slug, a.description, a.icon_url, a.scopes,
            a.oauth_client_id, a.created_at,
            d.company AS developer_company, d.website AS developer_website
       FROM apps a
       JOIN developer_accounts d ON d.id = a.developer_id
      WHERE a.slug = $1 AND a.status = 'published'
      LIMIT 1`,
    [slug],
  );
  if (rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const app = rows[0];

  let installed = false;
  const user = await getAuthUser();
  if (user.sellerId) {
    const { rows: inst } = await dbQuery<{ id: string }>(
      `SELECT id FROM app_installs
        WHERE app_id = $1 AND seller_id = $2 AND revoked_at IS NULL LIMIT 1`,
      [app.id, user.sellerId],
    );
    installed = inst.length > 0;
  }

  return NextResponse.json({
    app: {
      ...app,
      scope_details: sanitizeScopes(app.scopes).map((s) => ({ scope: s, description: SCOPE_DESCRIPTIONS[s] })),
    },
    installed,
    is_seller: Boolean(user.sellerId),
  });
});
