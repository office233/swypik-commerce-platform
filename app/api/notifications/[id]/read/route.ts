import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getOptionalSocialUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const { rowCount } = await dbQuery(
    `UPDATE notifications
        SET read_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND read_at IS NULL`,
    [id, userId],
  );

  return NextResponse.json({ ok: true, updated: rowCount });
}
