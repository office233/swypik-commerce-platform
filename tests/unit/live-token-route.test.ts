import { describe, it, expect, vi, beforeEach } from "vitest";

function jwtDecode(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}

const { dbQuery, state } = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  state: {
    session: null as { userId: string; role: string } | null,
    stream: null as Record<string, unknown> | null,
    rateOk: true,
  },
}));

vi.mock("@/lib/db", () => ({ dbQuery }));
vi.mock("@/lib/auth/session", () => ({ getAuthSession: async () => state.session }));
vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: async () => ({ success: state.rateOk, remaining: 1 }),
  getClientIP: () => "1.2.3.4",
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

import { POST } from "@/app/api/live/streams/[id]/token/route";
import { decideLiveToken } from "@/lib/live/token";

const STREAM_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CREATOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function req(role: "host" | "viewer"): Request {
  return new Request(`http://localhost/api/live/streams/${STREAM_ID}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
}
const ctx = (id = STREAM_ID) => ({ params: Promise.resolve({ id }) });

function configure(on: boolean) {
  if (on) {
    process.env.LIVEKIT_URL = "wss://swypik-test.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "APIkeyTest";
    process.env.LIVEKIT_API_SECRET = "secret-secret-secret-secret-secret-1234";
  } else {
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
  }
}

beforeEach(() => {
  configure(true);
  state.session = null;
  state.rateOk = true;
  state.stream = { id: STREAM_ID, status: "live", creator_id: CREATOR, title: "Show" };
  dbQuery.mockReset();
  dbQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM live_streams")) return { rows: state.stream ? [state.stream] : [] };
    if (sql.includes("FROM users")) return { rows: [{ display_name: "Ana", username: "ana" }] };
    return { rows: [] };
  });
});

describe("POST /api/live/streams/[id]/token", () => {
  it("answers 503 live_unavailable when LiveKit keys are missing", async () => {
    configure(false);
    const res = await POST(req("viewer"), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("live_unavailable");
  });

  it("rejects an invalid stream id before touching the DB", async () => {
    const res = await POST(req("viewer"), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("requires a session for the host token", async () => {
    const res = await POST(req("host"), ctx());
    expect(res.status).toBe(401);
  });

  it("refuses the host token to someone who does not own the stream", async () => {
    state.session = { userId: OTHER, role: "creator" };
    const res = await POST(req("host"), ctx());
    expect(res.status).toBe(403);
  });

  it("gives the owner a publish-capable token for a scheduled stream", async () => {
    state.session = { userId: CREATOR, role: "creator" };
    state.stream = { ...state.stream, status: "scheduled" };
    const res = await POST(req("host"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serverUrl).toBe("wss://swypik-test.livekit.cloud");
    const claims = jwtDecode(body.token);
    expect(claims.sub).toBe(`host:${CREATOR}`);
    expect(claims.video).toMatchObject({ room: `live-${STREAM_ID}`, roomJoin: true, canPublish: true });
  });

  it("gives guests a subscribe-only token while the stream is live", async () => {
    const res = await POST(req("viewer"), ctx());
    expect(res.status).toBe(200);
    const claims = jwtDecode((await res.json()).token);
    expect(String(claims.sub)).toMatch(/^viewer:guest-/);
    expect(claims.video).toMatchObject({ canPublish: false, canSubscribe: true, canPublishData: false });
  });

  it("refuses viewer tokens until the media server confirmed the stream", async () => {
    state.stream = { ...state.stream, status: "scheduled" };
    const res = await POST(req("viewer"), ctx());
    expect(res.status).toBe(409);
  });

  it("rate-limits token requests", async () => {
    state.rateOk = false;
    const res = await POST(req("viewer"), ctx());
    expect(res.status).toBe(429);
  });

  it("returns 404 for an unknown stream", async () => {
    state.stream = null;
    const res = await POST(req("viewer"), ctx());
    expect(res.status).toBe(404);
  });
});

describe("decideLiveToken", () => {
  const live = { status: "live" as const, creator_id: CREATOR };
  it("lets an admin host any stream", () => {
    expect(decideLiveToken("host", live, { userId: OTHER, role: "admin" })).toEqual({ ok: true });
  });
  it("never issues a host token for an ended stream", () => {
    expect(decideLiveToken("host", { ...live, status: "ended" }, { userId: CREATOR, role: "creator" })).toMatchObject({
      ok: false,
      status: 409,
    });
  });
});
