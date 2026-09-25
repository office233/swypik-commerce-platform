/**
 * Token-uri LiveKit pentru apelurile Messenger. Configurarea (env, verificare)
 * e comună cu Live: lib/livekit/server.ts.
 */
import { createAccessToken, LiveKitUnavailableError, requireLiveKitConfig } from "@/lib/livekit/server";

export { isLiveKitConfigured } from "@/lib/livekit/server";

export interface GenerateCallTokenParams {
  roomName: string;
  participantIdentity: string;
  participantName: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
}

/** Păstrat pentru rutele de apel existente (503 `calls_unavailable`). */
export const CallsUnavailableError = LiveKitUnavailableError;

/** Throws CallsUnavailableError if LiveKit is not configured. */
export function getLiveKitServerUrl(): string {
  return requireLiveKitConfig().url;
}

export async function generateLiveKitToken({
  roomName,
  participantIdentity,
  participantName,
  canPublish = true,
  canSubscribe = true,
}: GenerateCallTokenParams): Promise<string> {
  return createAccessToken({
    identity: participantIdentity,
    name: participantName,
    grant: { roomJoin: true, room: roomName, canPublish, canSubscribe, canPublishData: true },
  });
}
