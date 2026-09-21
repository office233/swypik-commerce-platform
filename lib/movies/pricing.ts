import { platformShareUnits } from "@/lib/swyp/share";
import {
    MOVIES_CREATOR_SHARE_BPS,
    MOVIES_EPISODE_PRICE_MAX_UNITS,
    MOVIES_EPISODE_PRICE_MIN_UNITS,
    MOVIES_SEASON_DISCOUNT_PCT,
} from "./config";
import { lockedEpisodeCount } from "./access";
import type { MovieSeriesRow } from "./types";

export function seasonPriceUnits(
    series: Pick<MovieSeriesRow, "free_episodes" | "episode_price_units">,
    totalEpisodes: number,
    discountPct: number = MOVIES_SEASON_DISCOUNT_PCT,
): number {
    const locked = lockedEpisodeCount(series, totalEpisodes);
    if (locked === 0) return 0;
    return Math.round(locked * series.episode_price_units * (1 - discountPct / 100));
}

/**
 * Cota creatorului dintr-o deblocare. Zero când serialul e al contului oficial
 * (platforma nu se plătește pe sine) și când viewer-ul e chiar owner-ul
 * (altfel ar putea „recicla" SWYP prin pool).
 */
export function creatorShareUnits(
    amountUnits: number,
    ownerUserId: string,
    viewerUserId: string,
    shareBps: number = MOVIES_CREATOR_SHARE_BPS,
): number {
    return platformShareUnits(amountUnits, ownerUserId, viewerUserId, shareBps);
}

export function clampEpisodePrice(units: number): number {
    const n = Math.trunc(Number(units) || 0);
    return Math.min(MOVIES_EPISODE_PRICE_MAX_UNITS, Math.max(MOVIES_EPISODE_PRICE_MIN_UNITS, n));
}
