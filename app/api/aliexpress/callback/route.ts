/**
 * AliExpress OAuth Callback
 * Disabled in production — only active during local development
 * for initial token exchange.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // Block in production — this endpoint is only for local dev token exchange
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 });
  }

  // In development, log a safe indicator (not the full code)
  console.log("[AliExpress OAuth] Code received:", code.slice(0, 6) + "***");

  return NextResponse.json({
    success: true,
    message: "Authorization code received. Exchange it locally.",
    codePrefix: code.slice(0, 6) + "...",
  });
}
