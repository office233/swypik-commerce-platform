import { NextResponse } from "next/server";

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

export async function POST() {
  return gated();
}

export async function GET() {
  return gated();
}
