/**
 * Token-uri LiveKit pentru Live: gazda publică (cameră + microfon), spectatorii
 * doar se abonează. Regulile de acces sunt aici ca să fie testabile separat.
 */
import { randomBytes } from "crypto";
import { dbQuery } from "@/lib/db";
import { createAccessToken, requireLiveKitConfig } from "@/lib/livekit/server";
import { hostIdentity, LIVE_CONFIG, liveRoomName, viewerIdentity } from "./config";
import type { LiveStreamPublic } from "./queries";

export type LiveRole = "host" | "viewer";
export type Viewer = { userId: string; role: string | null } | null;

export type TokenDecision =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 409; error: "unauthorized" | "forbidden" | "stream_not_live" | "stream_ended" };

/** Cine poate primi ce token, pentru ce stare a streamului. */
export function decideLiveToken(role: LiveRole, stream: Pick<LiveStreamPublic, "status" | "creator_id">, viewer: Viewer): TokenDecision {
  if (role === "host") {
    if (!viewer) return { ok: false, status: 401, error: "unauthorized" };
    if (stream.creator_id !== viewer.userId && viewer.role !== "admin") return { ok: false, status: 403, error: "forbidden" };
    if (stream.status === "ended" || stream.status === "failed") return { ok: false, status: 409, error: "stream_ended" };
    return { ok: true };
  }
  if (stream.status !== "live") return { ok: false, status: 409, error: "stream_not_live" };
  return { ok: true };
}

async function displayName(userId: string): Promise<string | null> {
  const { rows } = await dbQuery<{ display_name: string | null; username: string | null }>(
    `SELECT display_name, username FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.display_name || rows[0]?.username || null;
}

export async function issueLiveToken(
  role: LiveRole,
  streamId: string,
  viewer: Viewer,
  guestName: string,
): Promise<{ token: string; serverUrl: string; room: string; identity: string }> {
  const { url } = requireLiveKitConfig();
  const room = liveRoomName(streamId);
  const name = (viewer && (await displayName(viewer.userId))) || guestName;

  if (role === "host" && viewer) {
    const identity = hostIdentity(viewer.userId);
    const token = await createAccessToken({
      identity,
      name,
      ttl: LIVE_CONFIG.tokenTtl,
      grant: { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false },
    });
    return { token, serverUrl: url, room, identity };
  }

  const identity = viewerIdentity(viewer?.userId ?? `guest-${randomBytes(6).toString("hex")}`);
  const token = await createAccessToken({
    identity,
    name,
    ttl: LIVE_CONFIG.tokenTtl,
    grant: { roomJoin: true, room, canPublish: false, canSubscribe: true, canPublishData: false },
  });
  return { token, serverUrl: url, room, identity };
}
