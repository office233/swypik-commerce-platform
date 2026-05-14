/**
 * AliExpress OAuth Callback
 * Receives authorization code and exchanges it for access_token
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { logger } from "@/lib/logger";
const APP_KEY = "533768";
const APP_SECRET = "X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 });
  }


  try {
    const params: Record<string, string> = {
      app_key: APP_KEY,
      method: "aliexpress.oauth.token.create",
      sign_method: "sha256",
      timestamp: Date.now().toString(),
      format: "json",
      v: "2.0",
      code,
      grant_type: "authorization_code",
    };

    const sorted = Object.keys(params).sort();
    const signStr = sorted.map(k => k + params[k]).join("");
    params.sign = crypto
      .createHmac("sha256", APP_SECRET)
      .update(signStr)
      .digest("hex")
      .toUpperCase();

    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const resp = await fetch("https://api-sg.aliexpress.com/sync?" + qs);
    const data = await resp.json();


    if (data.error_response) {
      return NextResponse.json({
        error: "Token exchange failed",
        details: data.error_response,
      }, { status: 400 });
    }

    const tokenData = data.aliexpress_oauth_token_create_response || data;
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expire_time;

    if (accessToken) {
    }

    return NextResponse.json({
      success: true,
      message: "Token obtained!",
      access_token: accessToken,
      refresh_token: refreshToken,
      expires: expiresIn ? new Date(parseInt(expiresIn)).toISOString() : "unknown",
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "[AliExpress OAuth] Error:");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
