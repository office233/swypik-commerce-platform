import { NextResponse } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getAuthSession } from "@/lib/auth/session";
import { isLiveKitConfigured } from "@/lib/livekit/server";
import { LIVE_CONFIG } from "@/lib/live/config";
import { getLiveStream } from "@/lib/live/queries";
import { decideLiveToken, issueLiveToken } from "@/lib/live/token";
import { logger } from "@/lib/logger";
import { getClientIP, rateLimit } from "@/lib/security/rate-limit";
import { invalidIdResponse, isUuidParam } from "@/lib/validation/params";
import { parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({ role: z.enum(["host", "viewer"]).default("viewer") });

/**
 * POST /api/live/streams/[id]/token { role: "host" | "viewer" }
 *  - host: doar creatorul streamului (sau admin), stream ne-încheiat → poate publica
 *  - viewer: oricine (și vizitatori), doar cât streamul e confirmat live → doar abonare
 *  - fără chei LiveKit: 503 { error: "live_unavailable" }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuidParam(id)) return invalidIdResponse();
  if (!isLiveKitConfigured()) return NextResponse.json({ error: "live_unavailable" }, { status: 503 });

  const parsed = parseBody(BodySchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const role = parsed.data.role;

  const session = await getAuthSession().catch(() => null);
  const viewer = session ? { userId: session.userId, role: session.role ?? null } : null;
  const rl =
    role === "host" && viewer
      ? await rateLimit("liveHostToken", viewer.userId, LIVE_CONFIG.rate.hostToken)
      : await rateLimit("liveViewerToken", getClientIP(req), LIVE_CONFIG.rate.viewerTokenIp);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const stream = await getLiveStream(id);
  if (!stream) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const decision = decideLiveToken(role, stream, viewer);
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });

  try {
    const t = await getTranslations("live.viewer").catch(() => null);
    const guestName = t ? t("guestName") : "Guest";
    const issued = await issueLiveToken(role, id, viewer, guestName);
    return NextResponse.json({ ...issued, role });
  } catch (err) {
    logger.error({ err, streamId: id, role }, "[live/token] issue failed");
    return NextResponse.json({ error: "token_failed" }, { status: 500 });
  }
}
