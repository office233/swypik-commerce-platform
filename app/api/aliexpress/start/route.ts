/**
 * AliExpress OAuth init.
 * Generates anti-CSRF state token, stores it in Redis (10min TTL),
 * redirects admin to AliExpress authorize URL.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getRedis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth/getAuthUser";

export const dynamic = "force-dynamic";

const APP_KEY = process.env.ALIEXPRESS_APP_KEY || "";
const REDIRECT_URI = process.env.ALIEXPRESS_REDIRECT_URI || "";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!APP_KEY || !REDIRECT_URI) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const state = crypto.randomBytes(32).toString("hex");
  try {
    await getRedis().set(
      `ae:oauth:state:${state}`,
      JSON.stringify({ userId: auth.userId, at: Date.now() }),
      "EX",
      600,
    );
  } catch {
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }

  const url = new URL("https://api-sg.aliexpress.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", APP_KEY);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
