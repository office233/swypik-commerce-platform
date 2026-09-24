/**
 * Shared validation for the arcade iframe <-> parent postMessage bridge.
 * Extracted from components/gaming/GamePlayerModal.tsx so it's unit
 * testable without mounting React.
 */

export type GameOverMessage = { type: "SWYPIK_GAME_OVER"; gameId: string; score: number; durationMs?: number };

/**
 * Only same-origin /games/<slug>/... paths may ever be loaded in the
 * sandboxed iframe (`allow-same-origin` + an attacker-controlled src would
 * let a malicious page read/write this origin's cookies and DOM).
 */
export function isSafeGameUrl(url: string): boolean {
  if (typeof url !== "string" || !url.startsWith("/games/")) return false;
  if (url.includes("//")) return false; // blocks protocol-relative / absolute tricks
  if (url.includes("..")) return false;
  return true;
}

export function isGameOverMessage(data: unknown): data is GameOverMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.type !== "SWYPIK_GAME_OVER") return false;
  if (typeof d.gameId !== "string" || d.gameId.length === 0) return false;
  if (typeof d.score !== "number" || !Number.isFinite(d.score)) return false;
  return true;
}
