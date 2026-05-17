import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return NextResponse.redirect(new URL("/api/voice/search", req.url), 308);
}

export function POST(req: Request) {
  return NextResponse.redirect(new URL("/api/voice/search", req.url), 308);
}
