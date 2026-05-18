import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { endpoint: "/api/voice/search", method: "POST", body: "{ audio: <base64|url> }" },
    { status: 200 },
  );
}

export function POST() {
  return NextResponse.json(
    { error: "use_search_endpoint", endpoint: "/api/voice/search", method: "POST" },
    { status: 308, headers: { Location: "/api/voice/search" } },
  );
}
