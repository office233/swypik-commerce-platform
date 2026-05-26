import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const rl = await rateLimit("videoHidden", user.userId);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;

  await dbQuery(
    `DELETE FROM user_hidden_videos WHERE user_id = $1 AND video_id = $2`,
    [user.userId, id],
  );
  return NextResponse.json({ restored: true });
}
