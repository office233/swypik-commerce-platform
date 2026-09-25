import { NextResponse } from "next/server";
import { isLiveKitConfigured, receiveWebhook } from "@/lib/livekit/server";
import { handleLiveKitEvent } from "@/lib/live/webhook";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/live/webhook — webhook LiveKit Cloud (Settings → Webhooks →
 * https://swypik.com/api/live/webhook). Semnătura (JWT cu sha256 al corpului,
 * cheia API) e verificată ÎNAINTE de orice citire/scriere în DB.
 */
export async function POST(req: Request) {
  if (!isLiveKitConfigured()) return NextResponse.json({ error: "live_unavailable" }, { status: 503 });
  const raw = await req.text();
  let event;
  try {
    event = await receiveWebhook(raw, req.headers.get("authorization"));
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, "[live/webhook] invalid signature");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  try {
    const outcome = await handleLiveKitEvent(event);
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    logger.error({ err, event: event.event }, "[live/webhook] handler failed");
    // 500 → LiveKit reîncearcă livrarea.
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
}
