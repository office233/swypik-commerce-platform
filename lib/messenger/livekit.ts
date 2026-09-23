import { AccessToken } from "livekit-server-sdk";

export interface GenerateCallTokenParams {
  roomName: string;
  participantIdentity: string;
  participantName: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
}

export async function generateLiveKitToken({
  roomName,
  participantIdentity,
  participantName,
  canPublish = true,
  canSubscribe = true,
}: GenerateCallTokenParams): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
  const apiSecret = process.env.LIVEKIT_API_SECRET || "swypik_livekit_dev_secret_32chars";

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
    ttl: "2h", // Valabil 2 ore pentru durata convorbirii
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
