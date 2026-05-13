import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOrCreateSocialUser, setAnonSessionCookie } from "@/lib/social/session";

export const dynamic = "force-dynamic";

type SubscribeBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  userAgent?: string;
};

export async function POST(request: Request) {
  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "missing_subscription_fields" },
      { status: 400 },
    );
  }

  const { userId, anonSessionId } = await getOrCreateSocialUser();
  const ua = body.userAgent || request.headers.get("user-agent") || null;

  await dbQuery(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint)
     DO UPDATE SET
       user_id      = EXCLUDED.user_id,
       p256dh       = EXCLUDED.p256dh,
       auth         = EXCLUDED.auth,
       user_agent   = EXCLUDED.user_agent,
       last_used_at = NOW()`,
    [userId, endpoint, p256dh, auth, ua],
  );

  const response = NextResponse.json({ ok: true });
  setAnonSessionCookie(response, anonSessionId);
  return response;
}

export async function DELETE(request: Request) {
  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.endpoint) {
    return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });
  }

  const { userId } = await getOrCreateSocialUser();
  await dbQuery(
    `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
    [body.endpoint, userId],
  );
  return NextResponse.json({ ok: true });
}
