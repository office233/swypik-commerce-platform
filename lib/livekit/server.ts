/**
 * LiveKit (Cloud) — configurare comună pentru apelurile Messenger și Live.
 * Env: LIVEKIT_URL (wss://<proiect>.livekit.cloud), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
 * Fără chei, `getLiveKitConfig()` întoarce null și funcțiile care au nevoie de
 * ele aruncă `LiveKitUnavailableError` — rutele răspund 503 onest.
 */
import { AccessToken, RoomServiceClient, WebhookReceiver, type VideoGrant, type WebhookEvent } from "livekit-server-sdk";

export type LiveKitConfig = { url: string; apiKey: string; apiSecret: string };

export class LiveKitUnavailableError extends Error {
  constructor(public readonly missing: string[]) {
    super(`LiveKit is not configured (missing: ${missing.join(", ")})`);
    this.name = "LiveKitUnavailableError";
  }
}

function missingVars(): string[] {
  const missing: string[] = [];
  if (!process.env.LIVEKIT_URL?.trim()) missing.push("LIVEKIT_URL");
  if (!process.env.LIVEKIT_API_KEY?.trim()) missing.push("LIVEKIT_API_KEY");
  if (!process.env.LIVEKIT_API_SECRET?.trim()) missing.push("LIVEKIT_API_SECRET");
  return missing;
}

export function getLiveKitConfig(): LiveKitConfig | null {
  if (missingVars().length > 0) return null;
  return {
    url: String(process.env.LIVEKIT_URL).trim(),
    apiKey: String(process.env.LIVEKIT_API_KEY).trim(),
    apiSecret: String(process.env.LIVEKIT_API_SECRET).trim(),
  };
}

export function isLiveKitConfigured(): boolean {
  return getLiveKitConfig() !== null;
}

export function requireLiveKitConfig(): LiveKitConfig {
  const cfg = getLiveKitConfig();
  if (!cfg) throw new LiveKitUnavailableError(missingVars());
  return cfg;
}

export type TokenInput = {
  identity: string;
  name: string;
  grant: VideoGrant;
  ttl?: string;
  metadata?: string;
};

export async function createAccessToken(input: TokenInput): Promise<string> {
  const { apiKey, apiSecret } = requireLiveKitConfig();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    name: input.name,
    ttl: input.ttl ?? "2h",
    metadata: input.metadata,
  });
  at.addGrant(input.grant);
  return at.toJwt();
}

/**
 * Verifică semnătura unui webhook LiveKit (JWT în Authorization, cu sha256
 * al corpului) și întoarce evenimentul. Aruncă la semnătură invalidă.
 */
export async function receiveWebhook(rawBody: string, authHeader: string | null): Promise<WebhookEvent> {
  const { apiKey, apiSecret } = requireLiveKitConfig();
  if (!authHeader) throw new Error("missing authorization");
  return new WebhookReceiver(apiKey, apiSecret).receive(rawBody, authHeader);
}

/** URL-ul HTTP(S) al API-ului de server (din wss://…). */
export function liveKitHttpUrl(url: string): string {
  return url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

/** Închide camera pentru toți (best-effort; camera poate să nu existe). */
export async function deleteRoom(roomName: string): Promise<void> {
  const cfg = requireLiveKitConfig();
  const client = new RoomServiceClient(liveKitHttpUrl(cfg.url), cfg.apiKey, cfg.apiSecret);
  await client.deleteRoom(roomName);
}
