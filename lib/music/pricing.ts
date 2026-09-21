import {
    MUSIC_ALBUM_DISCOUNT_PCT,
    MUSIC_TIP_MAX_UNITS,
    MUSIC_TIP_MIN_UNITS,
    MUSIC_TRACK_PRICE_MAX_UNITS,
    MUSIC_TRACK_PRICE_MIN_UNITS,
} from "./config";
import type { MusicAlbumRow, MusicTrackRow } from "./types";

/**
 * Prețul unui album: cel setat explicit de artist, altfel suma pieselor premium
 * cu reducerea de album. 0 când albumul nu are nimic de deblocat.
 */
export function albumPriceUnits(
    album: Pick<MusicAlbumRow, "price_units">,
    tracks: Pick<MusicTrackRow, "is_premium" | "price_units">[],
    discountPct: number = MUSIC_ALBUM_DISCOUNT_PCT,
): number {
    if (album.price_units && album.price_units > 0) return Number(album.price_units);
    const sum = tracks.filter((t) => t.is_premium).reduce((acc, t) => acc + Number(t.price_units ?? 0), 0);
    return sum === 0 ? 0 : Math.round(sum * (1 - discountPct / 100));
}

export function clampTrackPrice(units: number): number {
    const n = Math.trunc(Number(units) || 0);
    return Math.min(MUSIC_TRACK_PRICE_MAX_UNITS, Math.max(MUSIC_TRACK_PRICE_MIN_UNITS, n));
}

/** Un tip e un întreg de subunități între minim și plafon. */
export function isValidTipUnits(units: number): boolean {
    return Number.isInteger(units) && units >= MUSIC_TIP_MIN_UNITS && units <= MUSIC_TIP_MAX_UNITS;
}
