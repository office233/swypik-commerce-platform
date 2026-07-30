/**
 * GET /api/apps — App Store public: lista apps published.
 * Query: ?q= (search în nume/descriere), ?limit=
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { withErrorHandling } from "@/lib/api-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withErrorHandling(async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "60", 10) || 60, 200);

  const values: unknown[] = [];
  let where = `a.status = 'published'`;
  if (q) {
    values.push(`%${q}%`);
    where += ` AND (a.name ILIKE $${values.length} OR a.description ILIKE $${values.length})`;
  }
  values.push(limit);

  const { rows } = await dbQuery(
    `SELECT a.id, a.name, a.slug, a.description, a.icon_url, a.scopes,
            d.company AS developer_company,
            (SELECT count(*) FROM app_installs i
              WHERE i.app_id = a.id AND i.revoked_at IS NULL) AS install_count
       FROM apps a
       JOIN developer_accounts d ON d.id = a.developer_id
      WHERE ${where}
      ORDER BY install_count DESC, a.created_at DESC
      LIMIT $${values.length}`,
    values,
  );
  return NextResponse.json({ apps: rows });
});
