/**
 * Internal endpoint for the standalone Swypik 18+ stack (swypik-adult-web)
 * to resolve a shared cookie token into the authenticated user.
 *
 * Replaces the previous pattern where swypik-adult had read-only direct
 * access to swypik.user_sessions. Now both Postgres instances are
 * completely isolated; the only cross-stack link is this HTTP call over
 * the internal Docker network (swypik-prod_default).
 *
 * Security:
 *   - Caller MUST present `Authorization: Bearer <MAINSTREAM_AUTH_SHARED_SECRET>`
 *   - Endpoint is NOT exposed via Caddy (only reachable on web-next:3000 from inside Docker)
 *   - Response carries only userId/email/role (no PII beyond that)
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

declare global {
  // eslint-disable-next-line no-var
  var __VERIFY_SESSION_POOL__: Pool | undefined;
}

function getPool(): Pool {
  if (!global.__VERIFY_SESSION_POOL__) {
    global.__VERIFY_SESSION_POOL__ = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      idleTimeoutMillis: 30_000,
      application_name: "web-next:verify-session",
    });
  }
  return global.__VERIFY_SESSION_POOL__;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  // 1) Validate shared secret
  const expected = process.env.MAINSTREAM_AUTH_SHARED_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "endpoint_disabled" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization") || "";
  const presented = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!presented || !timingSafeEqual(presented, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) Read token from body
  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const token = (body.token || "").trim();
  if (!token) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  // 3) Lookup session
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  try {
    const { rows } = await getPool().query<{
      user_id: string;
      role: string | null;
      email: string | null;
    }>(
      `SELECT s.user_id::text, u.role, u.email
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.session_token_hash = $1
          AND s.expires_at > now()
          AND s.revoked_at IS NULL
        LIMIT 1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ user: null }, { status: 200 });
    return NextResponse.json({
      user: {
        userId: row.user_id,
        email: row.email,
        role: row.role || "shopper",
        isAdmin: row.role === "admin",
      },
    });
  } catch (err) {
    console.warn("[verify-session]", (err as Error).message);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
