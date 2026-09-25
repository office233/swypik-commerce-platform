/**
 * Swypik Live — nume de cameră/identități LiveKit și limite reglabile din env
 * (LIVE_<NUME>_LIMIT / _WINDOW, LIVE_NOTIFY_PUSH_MAX, LIVE_POLL_MS …).
 */
import type { RateLimitConfig } from "@/lib/security/rate-limit";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function limit(key: string, defLimit: number, defWindow: number): RateLimitConfig {
  return { limit: envInt(`LIVE_${key}_LIMIT`, defLimit), window: envInt(`LIVE_${key}_WINDOW`, defWindow) };
}

export const LIVE_CONFIG = {
  /** Câți followeri primesc push la pornirea unui live (notificarea in-app o primesc toți). */
  get notifyPushMax() { return envInt("LIVE_NOTIFY_PUSH_MAX", 500); },
  /** Cât de des își reîmprospătează viewer-ul numărul de spectatori și produsele. */
  get viewerPollMs() { return envInt("LIVE_POLL_MS", 15000); },
  /** Valabilitatea token-ului LiveKit. */
  get tokenTtl() { return process.env.LIVE_TOKEN_TTL || "4h"; },
  rate: {
    get hostToken() { return limit("HOST_TOKEN", 20, 60); },
    get viewerTokenIp() { return limit("VIEWER_TOKEN_IP", 60, 60); },
  },
} as const;

const ROOM_PREFIX = "live-";
const HOST_PREFIX = "host:";
const VIEWER_PREFIX = "viewer:";

export function liveRoomName(streamId: string): string {
  return `${ROOM_PREFIX}${streamId}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id-ul streamului dintr-un nume de cameră `live-<uuid>`, altfel null (ex. camere de apel). */
export function streamIdFromRoom(roomName: string | undefined | null): string | null {
  if (!roomName?.startsWith(ROOM_PREFIX)) return null;
  const id = roomName.slice(ROOM_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

export function hostIdentity(userId: string): string {
  return `${HOST_PREFIX}${userId}`;
}

export function viewerIdentity(userIdOrGuest: string): string {
  return `${VIEWER_PREFIX}${userIdOrGuest}`;
}

/** User id-ul gazdei dintr-o identitate `host:<uuid>`, altfel null. */
export function hostUserIdFromIdentity(identity: string | undefined | null): string | null {
  if (!identity?.startsWith(HOST_PREFIX)) return null;
  const id = identity.slice(HOST_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

export function isViewerIdentity(identity: string | undefined | null): boolean {
  return Boolean(identity?.startsWith(VIEWER_PREFIX));
}
