import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isEnabled("pushNotifications")) return frozenResponse("pushNotifications");

  const userId = await getOptionalSocialUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { endpoint?: unknown };
  try {
    body = (await request.json()) as { endpoint?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) {
    return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });
  }

  const result = await dbQuery(
    `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
    [endpoint, userId]
  );

  return NextResponse.json({ ok: true, removed: result.rowCount ?? 0 });
}
