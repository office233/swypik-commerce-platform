import { describe, it, expect } from "vitest";
import { seasonPriceUnits, creatorShareUnits, clampEpisodePrice } from "@/lib/movies/pricing";
import { SWYPIK_OFFICIAL_ID } from "@/lib/config/accounts";
import { MOVIES_EPISODE_PRICE_MAX_UNITS, MOVIES_EPISODE_PRICE_MIN_UNITS } from "@/lib/movies/config";

describe("movies/pricing", () => {
  it("prețul sezonului = episoade blocate × preț × (1 − discount)", () => {
    // 40 episoade, 3 gratuite → 37 × 500 = 18500 → −40 % = 11100
    expect(seasonPriceUnits({ free_episodes: 3, episode_price_units: 500 }, 40, 40)).toBe(11100);
    expect(seasonPriceUnits({ free_episodes: 3, episode_price_units: 500 }, 3, 40)).toBe(0);
  });
  it("cota creatorului = 70 % rotunjit în jos; 0 pentru contul oficial și pentru self-unlock", () => {
    expect(creatorShareUnits(500, "owner-1", "viewer-1", 7000)).toBe(350);
    expect(creatorShareUnits(333, "owner-1", "viewer-1", 7000)).toBe(233);
    expect(creatorShareUnits(500, SWYPIK_OFFICIAL_ID, "viewer-1", 7000)).toBe(0);
    expect(creatorShareUnits(500, "owner-1", "owner-1", 7000)).toBe(0);
    expect(creatorShareUnits(0, "owner-1", "viewer-1", 7000)).toBe(0);
  });
  it("prețul per episod se limitează la intervalul configurat", () => {
    expect(clampEpisodePrice(1)).toBe(MOVIES_EPISODE_PRICE_MIN_UNITS);
    expect(clampEpisodePrice(10_000_000)).toBe(MOVIES_EPISODE_PRICE_MAX_UNITS);
    expect(clampEpisodePrice(750.7)).toBe(750);
  });
});
