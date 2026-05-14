/**
 * Logout endpoint — clears the unified session and any companion cookies
 * (admin_token, seller_session). GET redirects back to /, POST returns JSON.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

import { dbQuery } from "@/lib/db";
import { hashSessionToken } from "@/lib/auth/session";
import { getAdminCookieName } from "@/lib/security/admin-auth";

const COOKIE_NAME = "swypik_session";
const SELLER_COOKIE = "seller_session";
const isProd = process.env.NODE_ENV === "production";
const SECURE_FLAG = isProd ? "; Secure" : "";

function clearCookieHeader(name: string): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE_FLAG}`;
}

function hashRaw(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function clearAll(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value;
  if (sessionToken) {
    await dbQuery(
      `UPDATE user_sessions SET revoked_at = now() WHERE session_token_hash = $1`,
      [hashSessionToken(sessionToken)],
    ).catch(() => {});
  }
  const sellerToken = cookieStore.get(SELLER_COOKIE)?.value;
  if (sellerToken) {
    await dbQuery(`DELETE FROM seller_sessions WHERE token = $1`, [
      hashRaw(sellerToken),
    ]).catch(() => {});
  }
  const adminToken = cookieStore.get(getAdminCookieName())?.value;
  if (adminToken) {
    await dbQuery(`DELETE FROM admin_sessions WHERE token = $1`, [
      hashRaw(adminToken),
    ]).catch(() => {});
  }

  const response = NextResponse.json({ success: true });
  response.headers.append("Set-Cookie", clearCookieHeader(COOKIE_NAME));
  response.headers.append("Set-Cookie", clearCookieHeader(SELLER_COOKIE));
  response.headers.append("Set-Cookie", clearCookieHeader(getAdminCookieName()));
  return response;
}

export async function POST() {
  return clearAll();
}

export async function DELETE() {
  return clearAll();
}

export async function GET(req: Request) {
  await clearAll();
  const url = new URL("/auth/login", req.url);
  const response = NextResponse.redirect(url);
  response.headers.append("Set-Cookie", clearCookieHeader(COOKIE_NAME));
  response.headers.append("Set-Cookie", clearCookieHeader(SELLER_COOKIE));
  response.headers.append("Set-Cookie", clearCookieHeader(getAdminCookieName()));
  return response;
}
