import { describe, it, expect, vi, beforeEach } from "vitest";

const transfers: Array<Record<string, unknown>> = [];
const inserted: Array<unknown[]> = [];
let insertConflict = false;
let insufficient = false;

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

const series = { id: "s1", owner_user_id: "owner-1", status: "published", free_episodes: 3, episode_price_units: "500" };
async function query(sql: string, params: unknown[] = []) {
  if (sql.includes("FROM movie_episodes e") && sql.includes("JOIN movie_series")) {
    return { rows: [{ id: "ep-5", series_id: "s1", episode_number: 5, ...series }], rowCount: 1 };
  }
  if (sql.includes("FROM movie_series") && sql.includes("FOR UPDATE")) return { rows: [series], rowCount: 1 };
  if (sql.includes("COUNT(*)") && sql.includes("movie_episodes")) return { rows: [{ count: "40" }], rowCount: 1 };
  if (sql.startsWith("INSERT INTO movie_unlocks")) {
    if (insertConflict) return { rows: [], rowCount: 0 };
    inserted.push(params);
    return { rows: [{ id: "unlock-1" }], rowCount: 1 };
  }
  if (sql.startsWith("UPDATE movie_unlocks")) return { rows: [], rowCount: 1 };
  throw new Error("unexpected sql: " + sql.slice(0, 60));
}

import { unlockEpisode, unlockSeason, unlockRefId } from "@/lib/movies/unlock";

beforeEach(() => { transfers.length = 0; inserted.length = 0; insertConflict = false; insufficient = false; });

describe("movies/unlock", () => {
  it("refId-ul este determinist per user+țintă", () => {
    expect(unlockRefId("u1", { episodeId: "e1" })).toBe("movie_unlock:u1:episode:e1");
    expect(unlockRefId("u1", { seriesId: "s1" })).toBe("movie_unlock:u1:season:s1");
  });
  it("deblocarea unui episod: debit viewer + cotă creator, în această ordine, cu același refId", async () => {
    const r = await unlockEpisode({ userId: "viewer-1", episodeId: "ep-5" });
    expect(r).toEqual({ ok: true, alreadyApplied: false, unitsPaid: 500, creatorShareUnits: 350 });
    expect(transfers).toHaveLength(2);
    expect(transfers[0]).toMatchObject({ kind: "spend", from: { userId: "viewer-1" }, to: { pool: "rewards" }, amountUnits: 500n, refType: "movie_unlock", refId: "movie_unlock:viewer-1:episode:ep-5" });
    expect(transfers[1]).toMatchObject({ kind: "reward", from: { pool: "rewards" }, to: { userId: "owner-1" }, amountUnits: 350n, refType: "movie_creator_share", refId: "movie_unlock:viewer-1:episode:ep-5" });
  });
  it("al doilea apel (dublu-tap) nu mai debitează nimic", async () => {
    insertConflict = true;
    const r = await unlockEpisode({ userId: "viewer-1", episodeId: "ep-5" });
    expect(r).toEqual({ ok: true, alreadyApplied: true, unitsPaid: 0, creatorShareUnits: 0 });
    expect(transfers).toHaveLength(0);
  });
  it("sold insuficient → insufficient_balance, fără rând de unlock", async () => {
    insufficient = true;
    const r = await unlockEpisode({ userId: "viewer-1", episodeId: "ep-5" });
    expect(r).toEqual({ ok: false, reason: "insufficient_balance" });
  });
  it("owner-ul nu primește cotă când își deblochează propriul serial", async () => {
    await unlockEpisode({ userId: "owner-1", episodeId: "ep-5" });
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ kind: "spend" });
  });
  it("sezonul: 37 episoade blocate × 500 − 40 % = 11100, cotă 7770", async () => {
    const r = await unlockSeason({ userId: "viewer-1", seriesId: "s1" });
    expect(r).toEqual({ ok: true, alreadyApplied: false, unitsPaid: 11100, creatorShareUnits: 7770 });
  });
});
