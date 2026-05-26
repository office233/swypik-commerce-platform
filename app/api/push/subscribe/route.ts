import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type SubscribeBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function isValidEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host.endsWith("push.services.mozilla.com") ||
      host.endsWith("googleapis.com") ||
      host.endsWith("notify.windows.com") ||
      host.endsWith("push.apple.com") ||
      host.endsWith("web.push.apple.com")
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isEnabled("pushNotifications")) return frozenResponse("pushNotifications");

  const userId = await getOptionalSocialUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit("pushSubscribe", userId);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh =
    body.keys && typeof body.keys.p256dh === "string" ? body.keys.p256dh.trim() : "";
  const auth =
    body.keys && typeof body.keys.auth === "string" ? body.keys.auth.trim() : "";

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (endpoint.length > 2048 || p256dh.length > 512 || auth.length > 256) {
    return NextResponse.json({ error: "field_too_long" }, { status: 400 });
  }
  if (!isValidEndpoint(endpoint)) {
    return NextResponse.json({ error: "invalid_endpoint" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;

  const result = await dbQuery<{ id: string }>(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       last_used_at = NOW()
     RETURNING id`,
    [userId, endpoint, p256dh, auth, userAgent]
  );

  return NextResponse.json({ ok: true, id: result.rows[0]?.id ?? null });
}

export async function DELETE(request: Request) {
  if (!isEnabled("pushNotifications")) return frozenResponse("pushNotifications");

  const userId = await getOptionalSocialUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit("pushSubscribe", userId);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

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
