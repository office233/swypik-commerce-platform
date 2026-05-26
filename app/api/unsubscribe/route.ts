import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { unsubscribeToken } from "@/lib/email/service";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<Response> {
  const rl = await rateLimit("unsubscribe", getClientIP(req));
  if (!rl.success) return new NextResponse("Too many requests", { status: 429 });
  const url = new URL(req.url);
  let email = url.searchParams.get("email");
  let token = url.searchParams.get("t");

  if ((!email || !token) && req.method === "POST") {
    try {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await req.json();
        email = email || body?.email || null;
        token = token || body?.t || null;
      } else if (ct.includes("application/x-www-form-urlencoded")) {
        const form = await req.formData();
        email = email || (form.get("email") as string | null);
        token = token || (form.get("t") as string | null);
      }
    } catch {}
  }

  if (!email || !token) {
    return new NextResponse("Bad request", { status: 400 });
  }
  if (token !== unsubscribeToken(email)) {
    return new NextResponse("Invalid token", { status: 403 });
  }

  try {
    await dbQuery(
      `INSERT INTO email_unsubscribes(email_lower) VALUES($1) ON CONFLICT (email_lower) DO NOTHING`,
      [email.toLowerCase()]
    );
  } catch (e) {
    console.error("[unsubscribe] db error", e);
    return new NextResponse("Server error", { status: 500 });
  }

  // RFC 8058 one-click POST → plain 200
  if (req.method === "POST") {
    return new NextResponse("Unsubscribed.", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // GET → redirect la landing page-ul confirmation
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com").replace(/\/$/, "");
  return NextResponse.redirect(`${base}/unsubscribe?email=${encodeURIComponent(email)}`, { status: 303 });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
