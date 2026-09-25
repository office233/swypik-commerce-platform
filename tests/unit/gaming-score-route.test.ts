import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || "test-secret-key-for-gaming-tests";

let userId: string | null = "user-1";
let sessionRow: { started_at: string } | null = null;
let xpDailyEarned = 0;
const inserted: Record<string, unknown[][]> = {};

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: () => true,
  frozenResponse: () => new Response("frozen", { status: 410 }),
}));

vi.mock("@/lib/social/session", () => ({
  getAccountUserId: async () => userId,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: async () => ({ success: true, remaining: 10 }),
  getClientIP: () => "127.0.0.1",
}));

vi.mock("@/lib/db", () => {
  const dbQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
    (inserted[sql.slice(0, 30)] ??= []).push(params);
    if (sql.includes("UPDATE gaming_game_sessions")) {
      if (!sessionRow) return { rows: [], rowCount: 0 };
      const row = sessionRow;
      sessionRow = null; // single-use
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO gaming_scores")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO gaming_xp_daily")) return { rows: [], rowCount: 1 };
    if (sql.includes("SELECT xp_earned FROM gaming_xp_daily")) return { rows: [{ xp_earned: xpDailyEarned }], rowCount: 1 };
    if (sql.includes("UPDATE gaming_xp_daily SET xp_earned")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO gaming_user_profiles")) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { dbQuery, withTransaction: async <T,>(fn: (q: typeof dbQuery) => Promise<T>) => fn(dbQuery) };
});

import { POST } from "@/app/api/gaming/score/route";
import { issueGamingToken } from "@/lib/gaming/tokens";

function req(body: unknown): Request {
  return new Request("http://localhost/api/gaming/score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  userId = "user-1";
  sessionRow = null;
  xpDailyEarned = 0;
  for (const k of Object.keys(inserted)) delete inserted[k];
});

describe("POST /api/gaming/score", () => {
  it("rejects when no sessionToken is present", async () => {
    const res = await POST(req({ gameId: "game_2048", score: 100 }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_payload");
  });

  it("rejects an unauthenticated request", async () => {
    userId = null;
    const res = await POST(req({ gameId: "game_2048", score: 100, sessionToken: "x" }) as any);
    expect(res.status).toBe(401);
  });

  it("rejects a tampered/invalid session token", async () => {
    const res = await POST(req({ gameId: "game_2048", score: 100, sessionToken: "not-a-real-token" }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_session_token");
  });

  it("rejects a token issued for a different user", async () => {
    const token = issueGamingToken("session", "someone-else", "game_2048", 600);
    const res = await POST(req({ gameId: "game_2048", score: 100, sessionToken: token }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_session_token");
  });

  it("rejects a reused/expired session row (DB says already used)", async () => {
    const token = issueGamingToken("session", "user-1", "game_2048", 600);
    sessionRow = null; // simulates UPDATE finding no matching unused row
    const res = await POST(req({ gameId: "game_2048", score: 100, sessionToken: token }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("session_token_reused_or_expired");
  });

  it("rejects a submission that is too fast for the game's min duration", async () => {
    const token = issueGamingToken("session", "user-1", "game_2048", 600);
    sessionRow = { started_at: new Date(Date.now() - 100).toISOString() }; // 100ms ago, cap is 8000ms
    const res = await POST(req({ gameId: "game_2048", score: 100, sessionToken: token }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("too_fast");
  });

  it("rejects a score above the plausible cap", async () => {
    const token = issueGamingToken("session", "user-1", "game_2048", 600);
    sessionRow = { started_at: new Date(Date.now() - 20_000).toISOString() };
    const res = await POST(req({ gameId: "game_2048", score: 999_999_999, sessionToken: token }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("score_over_cap");
  });

  it("accepts a plausible score and awards XP", async () => {
    const token = issueGamingToken("session", "user-1", "game_2048", 600);
    sessionRow = { started_at: new Date(Date.now() - 20_000).toISOString() };
    const res = await POST(req({ gameId: "game_2048", score: 500, sessionToken: token }) as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.earnedXp).toBeGreaterThan(0);
  });

  it("caps earned XP at the daily limit even for a big score", async () => {
    const token = issueGamingToken("session", "user-1", "game_2048", 600);
    sessionRow = { started_at: new Date(Date.now() - 20_000).toISOString() };
    xpDailyEarned = 295; // 5 units of headroom left under the 300 cap
    const res = await POST(req({ gameId: "game_2048", score: 500, sessionToken: token }) as any);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.earnedXp).toBeLessThanOrEqual(5);
  });
});
