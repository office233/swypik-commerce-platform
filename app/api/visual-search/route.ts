import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error: "NotImplemented",
      message: "CLIP integration planned. Vezi docs/ai-roadmap.md.",
    },
    { status: 501 }
  );
}

export async function GET() {
  return POST();
}
