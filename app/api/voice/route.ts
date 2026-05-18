import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com";

export function GET() {
  return NextResponse.redirect(new URL("/api/voice/search", BASE), 308);
}

export function POST() {
  return NextResponse.redirect(new URL("/api/voice/search", BASE), 308);
}
