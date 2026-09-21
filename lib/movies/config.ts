/**
 * Parametrii Swypik Movies. Toate valorile vin din env cu fallback explicit —
 * niciun număr magic în rute sau componente.
 */
import { intEnv } from "@/lib/config/env";

/** Cota creatorului din fiecare deblocare, în basis points (7000 = 70 %). */
export const MOVIES_CREATOR_SHARE_BPS = intEnv("MOVIES_CREATOR_SHARE_BPS", 7000, 0, 10_000);
/** Reducere la deblocarea sezonului întreg (procent din suma episoadelor blocate). */
export const MOVIES_SEASON_DISCOUNT_PCT = intEnv("MOVIES_SEASON_DISCOUNT_PCT", 40, 0, 90);
/** Limite pentru prețul per episod (subunități; 100 = 1 SWYP). Publisher-ul alege între ele. */
export const MOVIES_EPISODE_PRICE_MIN_UNITS = intEnv("MOVIES_EPISODE_PRICE_MIN_UNITS", 100, 1, 1_000_000);
export const MOVIES_EPISODE_PRICE_MAX_UNITS = intEnv("MOVIES_EPISODE_PRICE_MAX_UNITS", 5_000, 1, 1_000_000);
export const MOVIES_DEFAULT_EPISODE_PRICE_UNITS = intEnv("MOVIES_DEFAULT_EPISODE_PRICE_UNITS", 500, 1, 1_000_000);
export const MOVIES_DEFAULT_FREE_EPISODES = intEnv("MOVIES_DEFAULT_FREE_EPISODES", 3, 0, 10);
export const MOVIES_MAX_FREE_EPISODES = 10;
export const MOVIES_MAX_EPISODE_DURATION_MS = intEnv("MOVIES_MAX_EPISODE_DURATION_MS", 180_000, 10_000, 3_600_000);
/** Cât e valid un token de stream pentru un episod blocat. */
export const MOVIES_STREAM_TOKEN_TTL_S = intEnv("MOVIES_STREAM_TOKEN_TTL_S", 600, 60, 3_600);
export const MOVIES_CATALOG_PAGE_SIZE = 24;
export const SWYP_UNITS_PER_COIN = 100;
