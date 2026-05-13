import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await getOptionalSocialUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { rowCount } = await dbQuery(
    `UPDATE notifications
        SET read_at = NOW()
      WHERE user_id = $1
        AND read_at IS NULL`,
    [userId],
  );

  return NextResponse.json({ ok: true, updated: rowCount });
}
