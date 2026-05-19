/**
 * POST /api/auth/adult-handoff
 *
 * Authenticated endpoint on swypik.com. Mints a one-shot token for the
 * current user and returns the URL the browser should be redirected to
 * on the adult subdomain.
 *
 * Why this exists: see lib/adult/handoff.ts header.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { mintHandoffToken } from "@/lib/adult/handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADULT_HOST = process.env.ADULT_HOST || "18.swypik.com";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let next = "/adult";
  try {
    const body = (await req.json().catch(() => ({}))) as { next?: unknown };
    if (typeof body.next === "string" && body.next.startsWith("/adult")) {
      next = body.next;
    }
  } catch { /* noop */ }

  try {
    const token = await mintHandoffToken(user.userId);
    const url = `https://${ADULT_HOST}/welcome?h=${token}&next=${encodeURIComponent(next)}`;
    return NextResponse.json({ url }, { status: 200 });
  } catch (err) {
    console.error("[adult-handoff] mint failed:", (err as Error).message);
    return NextResponse.json({ error: "mint_failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
