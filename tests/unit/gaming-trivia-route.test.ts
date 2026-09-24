import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || "test-secret-key-for-gaming-tests";

const QUESTIONS = [
  { id: "q1", category: "Video Games", difficulty: "easy", question: "Q1?", options: ["A", "B"], correctAnswer: "A" },
  { id: "q2", category: "Video Games", difficulty: "easy", question: "Q2?", options: ["A", "B"], correctAnswer: "B" },
];

let userId: string | null = "user-1";
let roundRow: { id: string; questions: typeof QUESTIONS } | null = null;
let xpDailyEarned = 0;

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: () => true,
  frozenResponse: () => new Response("frozen", { status: 410 }),
}));

vi.mock("@/lib/social/session", () => ({
  getOrCreateSocialUser: async () => (userId ? { userId } : null),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: async () => ({ success: true, remaining: 10 }),
  getClientIP: () => "127.0.0.1",
}));

vi.mock("@/lib/db", () => {
  const dbQuery = vi.fn(async (sql: string) => {
    if (sql.includes("UPDATE gaming_trivia_rounds") && sql.includes("used_at = now()")) {
      if (!roundRow) return { rows: [], rowCount: 0 };
      const row = roundRow;
      roundRow = null; // single-use
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes("UPDATE gaming_trivia_rounds SET score")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO gaming_scores")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO gaming_xp_daily")) return { rows: [], rowCount: 1 };
    if (sql.includes("SELECT xp_earned FROM gaming_xp_daily")) return { rows: [{ xp_earned: xpDailyEarned }], rowCount: 1 };
    if (sql.includes("UPDATE gaming_xp_daily SET xp_earned")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO gaming_user_profiles")) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { dbQuery, withTransaction: async <T,>(fn: (q: typeof dbQuery) => Promise<T>) => fn(dbQuery) };
});

import { POST } from "@/app/api/gaming/trivia/answer/route";
import { issueGamingToken } from "@/lib/gaming/tokens";

function req(body: unknown): Request {
  return new Request("http://localhost/api/gaming/trivia/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  userId = "user-1";
  roundRow = { id: "round-1", questions: QUESTIONS };
  xpDailyEarned = 0;
});

describe("POST /api/gaming/trivia/answer", () => {
  it("grades correctly and computes score server-side", async () => {
    const token = issueGamingToken("trivia", "user-1", "round-1", 600);
    const res = await POST(
      req({ roundToken: token, answers: [{ questionId: "q1", answer: "A" }, { questionId: "q2", answer: "A" }] }) as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.correctCount).toBe(1); // q1 correct, q2 wrong
    expect(json.score).toBe(50);
    expect(json.results.find((r: any) => r.questionId === "q2").correctAnswer).toBe("B");
  });

  it("rejects a tampered round token", async () => {
    const token = issueGamingToken("trivia", "user-1", "round-1", 600);
    const tampered = token.slice(0, -2) + "zz";
    const res = await POST(req({ roundToken: tampered, answers: [{ questionId: "q1", answer: "A" }] }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_round_token");
  });

  it("rejects an expired round token", async () => {
    const token = issueGamingToken("trivia", "user-1", "round-1", -1);
    const res = await POST(req({ roundToken: token, answers: [{ questionId: "q1", answer: "A" }] }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_round_token");
  });

  it("rejects reuse of an already-answered round", async () => {
    const token = issueGamingToken("trivia", "user-1", "round-1", 600);
    const first = await POST(req({ roundToken: token, answers: [{ questionId: "q1", answer: "A" }] }) as any);
    expect(first.status).toBe(200);

    // Second submission with the same token: DB row is now consumed.
    const second = await POST(req({ roundToken: token, answers: [{ questionId: "q1", answer: "A" }] }) as any);
    expect(second.status).toBe(400);
    const json = await second.json();
    expect(json.error).toBe("round_token_reused_or_expired");
  });

  it("rejects a token belonging to another user", async () => {
    const token = issueGamingToken("trivia", "someone-else", "round-1", 600);
    const res = await POST(req({ roundToken: token, answers: [{ questionId: "q1", answer: "A" }] }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_round_token");
  });

  it("caps earned XP at the daily limit", async () => {
    xpDailyEarned = 295;
    const token = issueGamingToken("trivia", "user-1", "round-1", 600);
    const res = await POST(
      req({ roundToken: token, answers: [{ questionId: "q1", answer: "A" }, { questionId: "q2", answer: "B" }] }) as any,
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.correctCount).toBe(2);
    expect(json.earnedXp).toBeLessThanOrEqual(5);
  });
});
