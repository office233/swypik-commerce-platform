import { describe, it, expect } from "vitest";
import { canStream } from "@/lib/music/access";
import { albumPriceUnits, clampTrackPrice, isValidTipUnits } from "@/lib/music/pricing";
import { MUSIC_TIP_MAX_UNITS, MUSIC_TRACK_PRICE_MAX_UNITS, MUSIC_TRACK_PRICE_MIN_UNITS } from "@/lib/music/config";
import type { MusicViewer } from "@/lib/music/types";

const viewer = (o: Partial<MusicViewer> = {}): MusicViewer => ({ userId: "u1", isAdmin: false, unlockedTrackIds: new Set(), unlockedAlbumIds: new Set(), ...o });
const free = { id: "t1", artist_user_id: "a1", status: "published" as const, is_premium: false, album_id: null };
const prem = { id: "t2", artist_user_id: "a1", status: "published" as const, is_premium: true, album_id: "al1" };

describe("music/access", () => {
  it("piesele gratuite publicate se ascultă de oricine, cele nepublicate doar de artist/admin", () => {
    expect(canStream(viewer({ userId: null }), free)).toBe(true);
    expect(canStream(viewer({ userId: null }), { ...free, status: "draft" })).toBe(false);
    expect(canStream(viewer({ userId: "a1" }), { ...free, status: "draft" })).toBe(true);
    expect(canStream(viewer({ isAdmin: true }), { ...free, status: "draft" })).toBe(true);
  });
  it("premium: doar cu unlock pe piesă sau pe album, artist sau admin", () => {
    expect(canStream(viewer(), prem)).toBe(false);
    expect(canStream(viewer({ unlockedTrackIds: new Set(["t2"]) }), prem)).toBe(true);
    expect(canStream(viewer({ unlockedAlbumIds: new Set(["al1"]) }), prem)).toBe(true);
    expect(canStream(viewer({ userId: "a1" }), prem)).toBe(true);
  });
});

describe("music/pricing", () => {
  it("prețul albumului: cel setat, altfel suma pieselor premium cu discount", () => {
    const tracks = [{ is_premium: true, price_units: 300 }, { is_premium: true, price_units: 300 }, { is_premium: false, price_units: null }];
    expect(albumPriceUnits({ price_units: 400 }, tracks, 30)).toBe(400);
    expect(albumPriceUnits({ price_units: null }, tracks, 30)).toBe(420);
    expect(albumPriceUnits({ price_units: null }, [{ is_premium: false, price_units: null }], 30)).toBe(0);
  });
  it("limitele de preț și de tip", () => {
    expect(clampTrackPrice(1)).toBe(MUSIC_TRACK_PRICE_MIN_UNITS);
    expect(clampTrackPrice(99_999_999)).toBe(MUSIC_TRACK_PRICE_MAX_UNITS);
    expect(isValidTipUnits(500)).toBe(true);
    expect(isValidTipUnits(50)).toBe(false);
    expect(isValidTipUnits(MUSIC_TIP_MAX_UNITS + 1)).toBe(false);
    expect(isValidTipUnits(150.5)).toBe(false);
  });
});
