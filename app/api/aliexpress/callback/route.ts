/**
 * AliExpress OAuth Callback
 * Receives authorization code after seller authorizes the app
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 });
  }

  // Log the code for now — will exchange for access_token later
  console.log("[AliExpress OAuth] Authorization code received:", code);

  // TODO: Exchange code for access_token using:
  // POST https://api-sg.aliexpress.com/rest
  // with app_key, app_secret, code, grant_type=authorization_code

  return NextResponse.json({
    success: true,
    message: "AliExpress authorization received! Code will be exchanged for access token.",
    code: code.slice(0, 8) + "...",
  });
}
