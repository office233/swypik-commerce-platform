import { NextRequest, NextResponse } from "next/server";
import { getOptionalSocialUserId, getOrCreateSocialUser } from "@/lib/social/session";
import { generateLiveKitToken } from "@/lib/messenger/livekit";
import { dbQuery } from "@/lib/db";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isEnabled("messenger")) return frozenResponse("messenger");

  try {
    const session = await getOrCreateSocialUser();
    const userId = session?.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { conversationId, callType = "video", callId } = body;

    // Obținem numele utilizatorului din tabela users dacă există
    const userRes = await dbQuery<{ display_name: string | null; username: string | null }>(
      `SELECT display_name, username FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const userName = userRes.rows[0]?.display_name || userRes.rows[0]?.username || `User_${userId.slice(0, 6)}`;

    let targetCallId = callId;
    let roomName = "";

    if (targetCallId) {
      // Participă la un apel existent
      const callRes = await dbQuery<{ id: string; livekit_room_name: string; status: string }>(
        `SELECT id, livekit_room_name, status FROM call_sessions WHERE id = $1 LIMIT 1`,
        [targetCallId]
      );
      if (!callRes.rows.length) {
        return NextResponse.json({ error: "Call not found" }, { status: 404 });
      }
      roomName = callRes.rows[0].livekit_room_name;

      // Actualizăm statusul apelului ca accepted dacă era în ringing
      await dbQuery(
        `UPDATE call_sessions SET status = 'accepted', answered_at = COALESCE(answered_at, now()) WHERE id = $1`,
        [targetCallId]
      );
    } else {
      // Inițiază un apel nou
      roomName = `swypik_call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const newCall = await dbQuery<{ id: string }>(
        `INSERT INTO call_sessions (conversation_id, caller_id, call_type, status, livekit_room_name)
         VALUES ($1, $2, $3, 'initiating', $4)
         RETURNING id`,
        [conversationId || null, userId, callType, roomName]
      );
      targetCallId = newCall.rows[0].id;
    }

    // Generăm token-ul LiveKit
    const token = await generateLiveKitToken({
      roomName,
      participantIdentity: userId,
      participantName: userName,
    });

    const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://127.0.0.1:7880";

    return NextResponse.json({
      ok: true,
      callId: targetCallId,
      roomName,
      token,
      serverUrl,
    });
  } catch (err: any) {
    console.error("[LiveKit Call Token Error]", err);
    return NextResponse.json({ error: err.message || "Failed to generate call token" }, { status: 500 });
  }
}
