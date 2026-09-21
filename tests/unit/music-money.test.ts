import { describe, it, expect, vi, beforeEach } from "vitest";

const transfers: Array<Record<string, unknown>> = [];
let unlockConflict = false;
let tipConflict = false;
let insufficient = false;
let artistExists = true;

vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn(query),
  dbQuery: vi.fn(),
}));
vi.mock("@/lib/swyp/ledger", async () => {
  class SwypInsufficientFundsError extends Error {}
  return {
    SwypInsufficientFundsError,
    swypTransferInTx: vi.fn(async (_q: unknown, args: Record<string, unknown>) => {
      if (insufficient && args.kind === "spend") throw new SwypInsufficientFundsError("insufficient");
      transfers.push(args);
      return { entry: { id: `entry-${transfers.length}` }, alreadyApplied: false };
    }),
  };
});

const premiumTrack = { id: "t2", artist_user_id: "artist-1", status: "published", is_premium: true, price_units: "300", album_id: "al1" };
const freeTrack = { id: "t1", artist_user_id: "artist-1", status: "published", is_premium: false, price_units: null, album_id: null };
let currentTrack: Record<string, unknown> = premiumTrack;

async function query(sql: string, params: unknown[] = []) {
  if (sql.includes("FROM music_tracks t") && sql.includes("FOR UPDATE")) return { rows: [currentTrack], rowCount: 1 };
  if (sql.includes("FROM music_albums al") && sql.includes("FOR UPDATE")) {
    return { rows: [{ id: "al1", artist_user_id: "artist-1", status: "published", price_units: null }], rowCount: 1 };
  }
  if (sql.includes("FROM music_tracks WHERE album_id")) {
    return { rows: [{ is_premium: true, price_units: "300" }, { is_premium: true, price_units: "300" }, { is_premium: false, price_units: null }], rowCount: 3 };
  }
  if (sql.startsWith("INSERT INTO music_unlocks")) return unlockConflict ? { rows: [], rowCount: 0 } : { rows: [{ id: "unlock-1" }], rowCount: 1 };
  if (sql.startsWith("UPDATE music_unlocks")) return { rows: [], rowCount: 1 };
  if (sql.startsWith("SELECT 1 FROM music_artists")) return artistExists ? { rows: [{ "?column?": 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
  if (sql.startsWith("INSERT INTO music_tips")) {
    expect(params[3]).toBe("key-1");
    return tipConflict ? { rows: [], rowCount: 0 } : { rows: [{ id: "tip-1" }], rowCount: 1 };
  }
  if (sql.startsWith("UPDATE music_tips")) return { rows: [], rowCount: 1 };
  throw new Error("unexpected sql: " + sql.slice(0, 60));
}

import { unlockTrack, unlockAlbum, musicUnlockRefId } from "@/lib/music/unlock";
import { tipArtist, tipRefId } from "@/lib/music/tip";

beforeEach(() => { transfers.length = 0; unlockConflict = false; tipConflict = false; insufficient = false; artistExists = true; currentTrack = premiumTrack; });

describe("music/unlock", () => {
  it("refId determinist per user + țintă", () => {
    expect(musicUnlockRefId("u1", { trackId: "t2" })).toBe("music_unlock:u1:track:t2");
    expect(musicUnlockRefId("u1", { albumId: "al1" })).toBe("music_unlock:u1:album:al1");
  });
  it("piesă premium: debit 300 + cotă artist 210, același refId", async () => {
    const r = await unlockTrack({ userId: "viewer-1", trackId: "t2" });
    expect(r).toEqual({ ok: true, alreadyApplied: false, unitsPaid: 300, artistShareUnits: 210 });
    expect(transfers).toHaveLength(2);
    expect(transfers[0]).toMatchObject({ kind: "spend", from: { userId: "viewer-1" }, to: { pool: "rewards" }, amountUnits: 300n, refType: "music_unlock", refId: "music_unlock:viewer-1:track:t2" });
    expect(transfers[1]).toMatchObject({ kind: "reward", from: { pool: "rewards" }, to: { userId: "artist-1" }, amountUnits: 210n, refType: "music_artist_share", refId: "music_unlock:viewer-1:track:t2" });
  });
  it("dublu-tap: al doilea apel nu debitează nimic", async () => {
    unlockConflict = true;
    const r = await unlockTrack({ userId: "viewer-1", trackId: "t2" });
    expect(r).toEqual({ ok: true, alreadyApplied: true, unitsPaid: 0, artistShareUnits: 0 });
    expect(transfers).toHaveLength(0);
  });
  it("sold insuficient ⇒ insufficient_balance, fără cotă", async () => {
    insufficient = true;
    expect(await unlockTrack({ userId: "viewer-1", trackId: "t2" })).toEqual({ ok: false, reason: "insufficient_balance" });
    expect(transfers).toHaveLength(0);
  });
  it("self-unlock (artistul isi plateste propria piesa): debit fara cota", async () => {
    const r = await unlockTrack({ userId: "artist-1", trackId: "t2" });
    expect(r).toEqual({ ok: true, alreadyApplied: false, unitsPaid: 300, artistShareUnits: 0 });
    expect(transfers).toHaveLength(1);
  });
  it("piesa gratuită nu se deblochează", async () => {
    currentTrack = freeTrack;
    expect(await unlockTrack({ userId: "viewer-1", trackId: "t1" })).toEqual({ ok: false, reason: "not_premium" });
  });
  it("album fără preț setat: suma pieselor premium cu discount (600 → 420), cotă 294", async () => {
    const r = await unlockAlbum({ userId: "viewer-1", albumId: "al1" });
    expect(r).toEqual({ ok: true, alreadyApplied: false, unitsPaid: 420, artistShareUnits: 294 });
    expect(transfers[0]).toMatchObject({ amountUnits: 420n, refId: "music_unlock:viewer-1:album:al1" });
  });
});

describe("music/tip", () => {
  const args = { userId: "viewer-1", artistUserId: "artist-1", trackId: null, units: 1000, idempotencyKey: "key-1" };
  it("refId = music_tip:<user>:<idempotencyKey>", () => {
    expect(tipRefId("u1", "k")).toBe("music_tip:u1:k");
  });
  it("tip 1000: debit 1000 + cotă artist 700", async () => {
    const r = await tipArtist(args);
    expect(r).toEqual({ ok: true, alreadyApplied: false, units: 1000, artistShareUnits: 700 });
    expect(transfers[0]).toMatchObject({ kind: "spend", amountUnits: 1000n, refType: "music_tip", refId: "music_tip:viewer-1:key-1" });
    expect(transfers[1]).toMatchObject({ kind: "reward", to: { userId: "artist-1" }, amountUnits: 700n, refType: "music_artist_share", refId: "music_tip:viewer-1:key-1" });
  });
  it("retry cu același idempotencyKey ⇒ alreadyApplied, zero transferuri", async () => {
    tipConflict = true;
    expect(await tipArtist(args)).toEqual({ ok: true, alreadyApplied: true, units: 0, artistShareUnits: 0 });
    expect(transfers).toHaveLength(0);
  });
  it("self-tip: doar debitul, cota 0", async () => {
    const r = await tipArtist({ ...args, userId: "artist-1" });
    expect(r).toEqual({ ok: true, alreadyApplied: false, units: 1000, artistShareUnits: 0 });
    expect(transfers).toHaveLength(1);
  });
  it("sumă invalidă și artist inexistent", async () => {
    expect(await tipArtist({ ...args, units: 50 })).toEqual({ ok: false, reason: "invalid_units" });
    artistExists = false;
    expect(await tipArtist(args)).toEqual({ ok: false, reason: "artist_not_found" });
    expect(transfers).toHaveLength(0);
  });
});
