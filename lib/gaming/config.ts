/**
 * Server-side plausibility limits per game. The HTML5 games run entirely in
 * the client's browser, so score/duration in a POST body is just a claim —
 * these caps are what actually stop a forged postMessage from paying out.
 */
export type GameCap = {
  /** Highest score we will accept as plausible for this game. */
  maxScore: number;
  /** Minimum real time (ms) the round must have taken, measured server-side
   *  from the signed session-start token, not from the client's durationMs. */
  minDurationMs: number;
};

export const GAME_CAPS: Record<string, GameCap> = {
  game_2048: { maxScore: 200_000, minDurationMs: 8_000 },
  game_flappy: { maxScore: 5_000, minDurationMs: 4_000 },
};

export const DEFAULT_GAME_CAP: GameCap = { maxScore: 10_000, minDurationMs: 5_000 };

export function getGameCap(gameId: string): GameCap {
  return GAME_CAPS[gameId] ?? DEFAULT_GAME_CAP;
}

/** Session-start token lifetime — long enough for a real play session. */
export const SESSION_TOKEN_TTL_SECONDS = 30 * 60;

/** Trivia round token lifetime, per spec (single-use, ~10 min). */
export const TRIVIA_ROUND_TTL_SECONDS = 10 * 60;

/** Hard daily ceiling on gaming XP per user, independent of SWYP caps. */
export const DAILY_XP_CAP = 300;
