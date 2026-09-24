import { AccessToken } from "livekit-server-sdk";

export interface GenerateCallTokenParams {
  roomName: string;
  participantIdentity: string;
  participantName: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
}

/**
 * Thrown when LiveKit isn't configured (missing env vars). Routes should
 * catch this and respond 503 { error: "calls_unavailable" } instead of
 * falling back to a shared dev secret in production.
 */
export class CallsUnavailableError extends Error {
  constructor(missing: string[]) {
    super(`LiveKit calls are not configured (missing: ${missing.join(", ")})`);
    this.name = "CallsUnavailableError";
  }
}

function getLiveKitEnv(): { apiKey: string; apiSecret: string; url: string } {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;

  const missing: string[] = [];
  if (!apiKey) missing.push("LIVEKIT_API_KEY");
  if (!apiSecret) missing.push("LIVEKIT_API_SECRET");
  if (!url) missing.push("LIVEKIT_URL");
  if (missing.length > 0) {
    throw new CallsUnavailableError(missing);
  }

  return { apiKey: apiKey as string, apiSecret: apiSecret as string, url: url as string };
}

/** Throws CallsUnavailableError if LIVEKIT_URL is not set. */
export function getLiveKitServerUrl(): string {
  return getLiveKitEnv().url;
}

export async function generateLiveKitToken({
  roomName,
  participantIdentity,
  participantName,
  canPublish = true,
  canSubscribe = true,
}: GenerateCallTokenParams): Promise<string> {
  const { apiKey, apiSecret } = getLiveKitEnv();

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
    ttl: "2h",
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe,
    canPublishData: true,
  });

  return await at.toJwt();
}
