import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";
import { getClearAdminCookieHeader, hashAdminSessionToken, readAdminTokenFromCookieHeader } from "@/lib/security/admin-auth";
import { dbQuery } from "@/lib/db";

async function POST_impl(req: Request) {
  const token = readAdminTokenFromCookieHeader(req.headers.get("cookie"));
  if (token) {
    await dbQuery(`DELETE FROM admin_sessions WHERE token = $1`, [hashAdminSessionToken(token)]);
  }
  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", getClearAdminCookieHeader());
  return response;
}

export const POST = withErrorHandling(POST_impl);
