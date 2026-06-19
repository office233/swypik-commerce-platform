import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  buildStateCookie,
  getOAuthRedirectBase,
  isSafeRedirect,
} from "@/lib/auth/oauth/helpers";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Rate limit: 10 OAuth starts / 60s / IP.
  // Why: each call mints a fresh state cookie and triggers a redirect.
  // Without a cap, a bot can spin up hundreds of incomplete OAuth flows,
  // each pinned for 10 min in the state-cookie store, plus drives synthetic
  // traffic to Google's endpoint that may eventually trip Google's own
  // anti-abuse limits and block us. 10/min is plenty for any real user.
  const ip = getClientIP(req);
  const { success } = await rateLimit("oauthStart", ip);
  if (!success) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a moment." },
      { status: 429 },
    );
  }

  const url = new URL(req.url);
  const next = isSafeRedirect(url.searchParams.get("next"));
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Google OAuth not configured" },
      { status: 404 },
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${getOAuthRedirectBase()}/api/auth/oauth/google/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(authUrl.toString());
  res.headers.append("Set-Cookie", buildStateCookie(state, "google"));
  const isProd = process.env.NODE_ENV === "production";
  res.headers.append(
    "Set-Cookie",
    `swypik_oauth_next=${encodeURIComponent(next)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isProd ? "; Secure" : ""}`,
  );
  return res;
}
