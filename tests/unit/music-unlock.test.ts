import { describe, it, expect, vi, beforeEach } from "vitest";

let insertConflictStatus: string | null = null;
let createdIntent: { id: string; client_secret: string | null } = { id: "pi_1", client_secret: "secret_1" };
let stripeCreateCalls: Array<Record<string, unknown>> = [];
let creditCalls: Array<Record<string, unknown>> = [];

const premiumTrack = { id: "t2", artist_user_id: "artist-1", status: "published", is_premium: true, price_cents: "300" };
const freeTrack = { id: "t1", artist_user_id: "artist-1", status: "published", is_premium: false, price_cents: null };
let currentTrack: Record<string, unknown> = premiumTrack;

vi.mock("@/lib/db", () => ({ dbQuery: vi.fn(query) }));
vi.mock("@/lib/stripe/checkout", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        stripeCreateCalls.push(params);
        return createdIntent;
      }),
    },
  }),
}));
vi.mock("@/lib/wallet/ledger", () => ({
  creditUser: vi.fn(async (args: Record<string, unknown>) => {
    creditCalls.push(args);
    return { entry: { id: "ledger-1" }, alreadyApplied: false };
  }),
}));

async function query(sql: string, params: unknown[] = []) {
  if (sql.includes("FROM music_tracks t WHERE t.id = $1")) return { rows: [currentTrack], rowCount: 1 };
  if (sql.includes("FROM music_albums al WHERE al.id = $1")) {
    return { rows: [{ id: "al1", artist_user_id: "artist-1", status: "published", price_cents: null }], rowCount: 1 };
  }
  if (sql.includes("FROM music_tracks WHERE album_id")) {
    return { rows: [{ is_premium: true, price_cents: "300" }, { is_premium: true, price_cents: "300" }, { is_premium: false, price_cents: null }], rowCount: 3 };
  }
  if (sql.startsWith("INSERT INTO music_unlocks")) {
    return { rows: [{ id: "unlock-1", status: insertConflictStatus ?? "pending" }], rowCount: 1 };
  }
  if (sql.includes("UPDATE music_unlocks u") && sql.includes("SET status = 'paid'")) {
    if (params[0] !== "pi_1") return { rows: [], rowCount: 0 };
    return {
      rows: [{ id: "unlock-1", user_id: "viewer-1", track_id: "t2", album_id: null, amount_cents: "300", artist_user_id: "artist-1" }],
      rowCount: 1,
    };
  }
  if (sql.startsWith("UPDATE music_unlocks SET payment_intent_id")) return { rows: [], rowCount: 1 };
  if (sql.startsWith("UPDATE music_unlocks SET units_paid")) return { rows: [], rowCount: 1 };
  throw new Error("unexpected sql: " + sql.slice(0, 80));
}

import { createTrackUnlockIntent, createAlbumUnlockIntent, markMusicUnlockPaid, musicUnlockRefId } from "@/lib/music/unlock";

beforeEach(() => {
  insertConflictStatus = null;
  createdIntent = { id: "pi_1", client_secret: "secret_1" };
  stripeCreateCalls = [];
  creditCalls = [];
  currentTrack = premiumTrack;
});

describe("music/unlock — card (Stripe, RON)", () => {
  it("refId determinist per user + țintă", () => {
    expect(musicUnlockRefId("u1", { trackId: "t2" })).toBe("music_unlock:u1:track:t2");
    expect(musicUnlockRefId("u1", { albumId: "al1" })).toBe("music_unlock:u1:album:al1");
  });

  it("piesă premium: creează PaymentIntent de 300 cenți cu metadata corectă", async () => {
    const r = await createTrackUnlockIntent({ userId: "viewer-1", trackId: "t2" });
    expect(r).toEqual({ ok: true, alreadyUnlocked: false, clientSecret: "secret_1", amountCents: 300 });
    expect(stripeCreateCalls[0]).toMatchObject({ amount: 300, currency: "ron", metadata: { kind: "music_track_unlock", trackId: "t2", userId: "viewer-1" } });
  });

  it("piesă gratuită → not_premium", async () => {
    currentTrack = freeTrack;
    expect(await createTrackUnlockIntent({ userId: "viewer-1", trackId: "t1" })).toEqual({ ok: false, reason: "not_premium" });
  });

  it("preț nesetat (null) → price_not_set", async () => {
    currentTrack = { ...premiumTrack, price_cents: null };
    expect(await createTrackUnlockIntent({ userId: "viewer-1", trackId: "t2" })).toEqual({ ok: false, reason: "price_not_set" });
  });

  it("deja plătită → alreadyUnlocked, fără PaymentIntent nou", async () => {
    insertConflictStatus = "paid";
    expect(await createTrackUnlockIntent({ userId: "viewer-1", trackId: "t2" })).toEqual({ ok: true, alreadyUnlocked: true });
    expect(stripeCreateCalls).toHaveLength(0);
  });

  it("album fără preț propriu: suma pieselor premium cu discount (600 → 420 cenți)", async () => {
    const r = await createAlbumUnlockIntent({ userId: "viewer-1", albumId: "al1" });
    expect(r).toEqual({ ok: true, alreadyUnlocked: false, clientSecret: "secret_1", amountCents: 420 });
  });

  it("webhook payment_intent.succeeded: marchează plătit + creditează cota artistului (70%)", async () => {
    await markMusicUnlockPaid("pi_1");
    expect(creditCalls).toHaveLength(1);
    expect(creditCalls[0]).toMatchObject({ userId: "artist-1", amountCents: 210, refType: "music_artist_share", refId: "unlock-1" });
  });

  it("webhook idempotent: payment_intent necunoscut/deja plătit → no-op", async () => {
    await markMusicUnlockPaid("pi_unknown");
    expect(creditCalls).toHaveLength(0);
  });
});
