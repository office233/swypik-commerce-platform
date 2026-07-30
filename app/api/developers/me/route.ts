/**
 * GET /api/developers/me — starea contului de dezvoltator al userului curent.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { withErrorHandling } from "@/lib/api-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withErrorHandling(async function GET() {
  const user = await getAuthUser();
  if (!user.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { rows } = await dbQuery<{
    id: string;
    company: string;
    website: string | null;
    status: string;
    created_at: string;
  }>(
    `SELECT id, company, website, status, created_at
       FROM developer_accounts WHERE user_id = $1 LIMIT 1`,
    [user.userId],
  );
  if (rows.length === 0) {
    return NextResponse.json({ developer: null });
  }
  return NextResponse.json({ developer: rows[0] });
});
