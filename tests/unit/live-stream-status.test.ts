import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbQuery, push, state } = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  push: vi.fn(async () => undefined),
  state: { prevStatus: "scheduled" as string | null },
}));

vi.mock("@/lib/db", () => ({ dbQuery }));
vi.mock("@/lib/push/web-push", () => ({ sendPushToUser: push }));
vi.mock("@/lib/auth/session", () => ({ getAuthSession: async () => ({ userId: "creator-1", role: "creator" }) }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: async () => ({ success: true, remaining: 1 }) }));

process.env.INTERNAL_SECRET = "internal-secret-123";

import { POST as createStream } from "@/app/api/live/streams/route";
import { POST as started } from "@/app/api/internal/live/started/route";

beforeEach(() => {
  push.mockClear();
  dbQuery.mockReset();
  state.prevStatus = "scheduled";
  dbQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("INSERT INTO live_streams")) return { rows: [{ id: "s-1" }], rowCount: 1 };
    if (sql.includes("UPDATE live_streams ls SET status = 'live'")) {
      return state.prevStatus
        ? { rows: [{ id: "s-1", creator_id: "creator-1", title: "T", prev_status: state.prevStatus }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (sql.includes("FROM follows")) return { rows: [{ follower_user_id: "f-1" }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
});

function startedReq(secret = "internal-secret-123"): Request {
  return new Request("http://localhost/api/internal/live/started", {
    method: "POST",
    // mediamtx trimite form-urlencoded (curl -d "path=$MTX_PATH")
    headers: { "x-internal": secret, "content-type": "application/x-www-form-urlencoded" },
    body: "path=live/abcdef123456",
  });
}

describe("live stream lifecycle", () => {
  it("creates streams as 'scheduled' even without scheduled_at", async () => {
    const res = await createStream(
      new Request("http://localhost/api/live/streams", { method: "POST", body: JSON.stringify({ title: "Show" }) }) as never,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("scheduled");
    const insert = dbQuery.mock.calls.find((c) => String(c[0]).includes("INSERT INTO live_streams"));
    expect((insert?.[1] as unknown[]).at(-1)).toBe("scheduled");
  });

  it("goes live only through the signed media-server callback and notifies followers once", async () => {
    expect((await started(startedReq("wrong-secret-xxx") as never)).status).toBe(403);
    const res = await started(startedReq() as never);
    expect(res.status).toBe(200);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("does not re-notify on encoder reconnect", async () => {
    state.prevStatus = "live";
    const res = await started(startedReq() as never);
    expect(res.status).toBe(200);
    expect(push).not.toHaveBeenCalled();
  });

  it("does not revive an ended stream", async () => {
    state.prevStatus = null;
    const res = await started(startedReq() as never);
    expect(res.status).toBe(404);
  });
});
