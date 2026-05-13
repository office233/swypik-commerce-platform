import { NextResponse } from "next/server";
import { createAdminSessionAndGetCookie, isAdminConfigured, isAdminToken } from "@/lib/security/admin-auth";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

export async function POST(req: Request) {
  try {
    if (!isAdminConfigured()) {
      return NextResponse.json(
        { success: false, error: "ADMIN_SECRET is not configured." },
        { status: 503 }
      );
    }

    // Rate limit: 5 attempts per 5 minutes per IP
    const ip = getClientIP(req);
    const { success: allowed } = await rateLimit("admin-login", ip, { limit: 5, window: 300 });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Too many login attempts. Please wait." },
        { status: 429 }
      );
    }

    const { password } = await req.json();

    if (!password) {
      return NextResponse.json({ success: false, error: "Admin password is required." }, { status: 400 });
    }

    // Timing-safe comparison via isAdminToken (uses crypto.timingSafeEqual)
    if (!isAdminToken(password)) {
      return NextResponse.json({ success: false, error: "Incorrect admin password." }, { status: 401 });
    }

    const cookieHeader = await createAdminSessionAndGetCookie();
    const response = NextResponse.json({ success: true });
    response.headers.set("Set-Cookie", cookieHeader);
    return response;
  } catch (error: any) {
    console.error("[Admin Login] Error:", error?.message);
    return NextResponse.json({ success: false, error: "Login failed." }, { status: 500 });
  }
}
