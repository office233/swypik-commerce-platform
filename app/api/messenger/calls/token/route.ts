import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAccountUserId } from "@/lib/social/session";
import { generateLiveKitToken, getLiveKitServerUrl, CallsUnavailableError } from "@/lib/messenger/livekit";
import { dbQuery } from "@/lib/db";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/security/rate-limit";
import { parseBody } from "@/lib/validation/schemas";
import { createCall, joinCall, CallAuthError, CallNotFoundError } from "@/lib/messenger/calls";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const TokenBodySchema = z.union([
  // Join an existing call.
  z.object({
    callId: z.string().uuid("callId must be a valid UUID"),
  }),
  // Start a new call.
  z.object({
    conversationId: z.string().uuid("conversationId must be a valid UUID"),
    callType: z.enum(["audio", "video"]).default("video"),
  }),
]);

export async function POST(req: NextRequest) {
  if (!isEnabled("messenger")) return frozenResponse("messenger");

  try {
    // Cont real obligatoriu: anonimii nu pot scrie DM / apela (audit messenger P0).
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("messengerCallToken", userId, { limit: 20, window: 60 });
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const rawBody = await req.json().catch(() => ({}));
    const parsed = parseBody(TokenBodySchema, rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, issues: parsed.issues }, { status: 400 });
    }

    const userRes = await dbQuery<{ display_name: string | null; username: string | null }>(
      `SELECT display_name, username FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const userName = userRes.rows[0]?.display_name || userRes.rows[0]?.username || `User_${userId.slice(0, 6)}`;

    let targetCallId: string;
    let roomName: string;

    if ("callId" in parsed.data) {
      const joined = await joinCall(userId, parsed.data.callId);
      targetCallId = parsed.data.callId;
      roomName = joined.roomName;
    } else {
      const created = await createCall(userId, parsed.data.conversationId, parsed.data.callType);
      targetCallId = created.callId;
      roomName = created.roomName;
    }

    const token = await generateLiveKitToken({
      roomName,
      participantIdentity: userId,
      participantName: userName,
    });
    const serverUrl = getLiveKitServerUrl();

    return NextResponse.json({ ok: true, callId: targetCallId, roomName, token, serverUrl });
  } catch (err: unknown) {
    if (err instanceof CallsUnavailableError) {
      return NextResponse.json({ error: "calls_unavailable" }, { status: 503 });
    }
    if (err instanceof CallAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof CallNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error({ err }, "[messenger] call token error");
    return NextResponse.json({ error: "Failed to generate call token" }, { status: 500 });
  }
}
