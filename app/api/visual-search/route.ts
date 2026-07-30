import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

function gated() {
  if (process.env.NEXT_PUBLIC_FEATURE_VISUAL_SEARCH !== "1") {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.json(
    {
      error: "NotImplemented",
      message: "CLIP integration planned. Vezi docs/ai-roadmap.md.",
    },
    { status: 501 },
  );
}

async function POST_impl(req: Request) {
  const rl = await rateLimit("visualSearch", getClientIP(req));
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  return gated();
}

async function GET_impl() {
  return gated();
}

export const POST = withErrorHandling(POST_impl);
export const GET = withErrorHandling(GET_impl);
