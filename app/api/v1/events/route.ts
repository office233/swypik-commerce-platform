import { NextResponse } from "next/server";
import { proxyToSocialApi } from "@/lib/social/proxy";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

const EVENT_TYPES = new Set([
  "view",
  "watch",
  "complete",
  "swipe",
  "like",
  "unlike",
  "save",
  "share",
  "comment_open",
  "product_click",
  "add_to_cart",
]);

export async function POST(req: Request) {
  try {
    const proxied = await proxyToSocialApi(req, "/v1/events");
    if (proxied) return proxied;

    const body = await req.json().catch(() => null);
    const eventType = String(body?.eventType || body?.type || "");

    if (!EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ ok: false, error: "Invalid event type" }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        accepted: true,
        persisted: false,
        source: "next-fallback",
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[Social Events Fallback]", error);
    return NextResponse.json({ ok: false, error: "Event rejected" }, { status: 500 });
  }
}
