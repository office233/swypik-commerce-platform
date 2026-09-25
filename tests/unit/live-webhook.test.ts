import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import { AccessToken } from "livekit-server-sdk";

const { dbQuery, push } = vi.hoisted(() => ({ dbQuery: vi.fn(), push: vi.fn(async () => undefined) }));
vi.mock("@/lib/db", () => ({ dbQuery }));
vi.mock("@/lib/push/web-push", () => ({ sendPushToUser: push }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

import { POST } from "@/app/api/live/webhook/route";
import { handleLiveKitEvent } from "@/lib/live/webhook";
import type { WebhookEvent } from "livekit-server-sdk";

const KEY = "APIkeyTest";
const SECRET = "secret-secret-secret-secret-secret-1234";
const STREAM_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CREATOR = "11111111-1111-4111-8111-111111111111";

async function sign(body: string, secret = SECRET): Promise<string> {
  const at = new AccessToken(KEY, secret);
  at.sha256 = createHash("sha256").update(body).digest("base64");
  return at.toJwt();
}

function hook(body: string, auth: string | null): Request {
  return new Request("http://localhost/api/live/webhook", {
    method: "POST",
    headers: { "content-type": "application/webhook+json", ...(auth ? { authorization: auth } : {}) },
    body,
  });
}

const published = JSON.stringify({
  event: "track_published",
  room: { name: `live-${STREAM_ID}`, numParticipants: 1 },
  participant: { identity: `host:${CREATOR}` },
});

beforeEach(() => {
  process.env.LIVEKIT_URL = "wss://swypik-test.livekit.cloud";
  process.env.LIVEKIT_API_KEY = KEY;
  process.env.LIVEKIT_API_SECRET = SECRET;
  push.mockClear();
  dbQuery.mockReset();
  dbQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("SET status = 'live'")) {
      return { rows: [{ id: STREAM_ID, creator_id: CREATOR, title: "Show", prev_status: "scheduled" }] };
    }
    if (sql.includes("FROM follows")) return { rows: [{ follower_user_id: "f-1", title: "t" }] };
    if (sql.includes("SET status = 'ended'")) return { rows: [{ id: STREAM_ID }] };
    return { rows: [] };
  });
});

describe("POST /api/live/webhook — signature", () => {
  it("accepts a correctly signed event and marks the stream live", async () => {
    const res = await POST(hook(published, await sign(published)));
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("live");
    const update = dbQuery.mock.calls.find((c) => String(c[0]).includes("SET status = 'live'"));
    expect(update?.[1]).toEqual([STREAM_ID, CREATOR]);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing Authorization header without touching the DB", async () => {
    const res = await POST(hook(published, null));
    expect(res.status).toBe(401);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("rejects a token signed with another secret", async () => {
    const res = await POST(hook(published, await sign(published, "another-secret-another-secret-123456")));
    expect(res.status).toBe(401);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("rejects a body that does not match the signed sha256", async () => {
    const tampered = published.replace(CREATOR, "22222222-2222-4222-8222-222222222222");
    const res = await POST(hook(tampered, await sign(published)));
    expect(res.status).toBe(401);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("answers 503 when LiveKit is not configured", async () => {
    delete process.env.LIVEKIT_API_SECRET;
    const res = await POST(hook(published, "x"));
    expect(res.status).toBe(503);
  });
});

describe("handleLiveKitEvent", () => {
  const ev = (e: Record<string, unknown>) => e as unknown as WebhookEvent;

  it("ignores rooms that are not live streams (e.g. messenger calls)", async () => {
    expect(await handleLiveKitEvent(ev({ event: "room_finished", room: { name: "swypik_call_x" } }))).toBe("ignored");
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("does not go live when a viewer publishes", async () => {
    const out = await handleLiveKitEvent(
      ev({ event: "track_published", room: { name: `live-${STREAM_ID}` }, participant: { identity: "viewer:guest-1" } }),
    );
    expect(out).toBe("noop");
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("updates the viewer count from presence (host excluded)", async () => {
    await handleLiveKitEvent(ev({ event: "participant_joined", room: { name: `live-${STREAM_ID}`, numParticipants: 4 } }));
    const call = dbQuery.mock.calls.find((c) => String(c[0]).includes("viewer_count = $2"));
    expect(call?.[1]).toEqual([STREAM_ID, 3]);
  });

  it("ends the stream when the room finishes", async () => {
    expect(await handleLiveKitEvent(ev({ event: "room_finished", room: { name: `live-${STREAM_ID}` } }))).toBe("ended");
  });
});
