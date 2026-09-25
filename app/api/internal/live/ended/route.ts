import { withErrorHandling } from "@/lib/api-handler";
import { NextRequest, NextResponse } from "next/server";
import { readStreamKey, verifyInternal } from "@/lib/live/internal-hook";
import { markStreamEnded } from "@/lib/live/lifecycle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** MediaMTX runOnNotReady (streamuri RTMP moștenite) → ended. */
async function POST_impl(req: NextRequest) {
  if (!verifyInternal(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const streamKey = await readStreamKey(req);
  if (!streamKey) return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  await markStreamEnded({ streamKey });
  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling(POST_impl);
