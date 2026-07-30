import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function GET_impl() {
  return NextResponse.json(
    { endpoint: "/api/voice/search", method: "POST", body: "{ audio: <base64|url> }" },
    { status: 200 },
  );
}

function POST_impl() {
  return NextResponse.json(
    { error: "use_search_endpoint", endpoint: "/api/voice/search", method: "POST" },
    { status: 308, headers: { Location: "/api/voice/search" } },
  );
}

export const GET = withErrorHandling(GET_impl);
export const POST = withErrorHandling(POST_impl);
