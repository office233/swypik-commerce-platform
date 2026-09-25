import { NextRequest, NextResponse } from "next/server";
import { readStreamKey, verifyInternal } from "@/lib/live/internal-hook";
import { markStreamLive } from "@/lib/live/lifecycle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** MediaMTX runOnReady (streamuri RTMP moștenite) → live + notificarea followerilor. */
export async function POST(req: NextRequest) {
  if (!verifyInternal(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const streamKey = await readStreamKey(req);
  if (!streamKey) return NextResponse.json({ error: "invalid_path" }, { status: 400 });

  // Doar un stream programat/în curs poate (re)deveni live — nu și unul încheiat.
  const stream = await markStreamLive({ streamKey });
  if (!stream) return NextResponse.json({ error: "stream_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, stream_id: stream.id });
}
