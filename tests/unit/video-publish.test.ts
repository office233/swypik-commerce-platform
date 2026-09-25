import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let userId: string | null = "0b1e2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
let role: string | null = "creator";
vi.mock("@/lib/creator/session", () => ({
  getCreatorUserId: async () => userId,
  getUserRole: async () => role,
}));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: async () => ({ success: true }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/ai/auto-embed", () => ({ autoEmbedVideo: vi.fn() }));
vi.mock("@/lib/moderation/labelVideo", () => ({ labelVideo: vi.fn(async () => undefined) }));
vi.mock("@/lib/moderation/strikes", () => ({ recordStrike: vi.fn(async () => undefined) }));
const ai = vi.hoisted(() => ({ moderate: vi.fn(async () => ({ flagged: false, reasons: [] as string[] })) }));
vi.mock("@/lib/ai/moderate", () => ai);
const notify = vi.hoisted(() => ({ notifyFollowersNewPost: vi.fn(async () => 1) }));
vi.mock("@/lib/notifications/dispatch", () => notify);

type Q = { sql: string; params: unknown[] };
let calls: Q[] = [];
let respond: (sql: string, params: unknown[]) => { rows: unknown[] } = () => ({ rows: [] });
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });
  return respond(sql, params);
});
vi.mock("@/lib/db", () => ({
  dbQuery: (sql: string, params?: unknown[]) => query(sql, params),
  getDb: () => ({ connect: async () => ({ query: (sql: string, params?: unknown[]) => query(sql, params), release: () => undefined }) }),
}));

import { PATCH } from "@/app/api/creator/videos/[id]/route";
import { GET as publicStatus } from "@/app/api/videos/[id]/status/route";
import { buildDetailsUpdate } from "@/lib/video/publish";
import { moderateOnPublish } from "@/lib/video/moderation-gate";
import type { OwnedVideo } from "@/lib/video/auth";
import { isJpeg } from "@/lib/video/cover";

const VID = "7a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d";
const OWNER = "0b1e2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const ctx = { params: Promise.resolve({ id: VID }) };

function video(over: Partial<OwnedVideo> = {}): OwnedVideo {
  return {
    id: VID, creator_id: OWNER, status: "ready", visibility: "draft", moderation_status: "pending_review",
    published_at: null, title: "t", description: "", tags: [], metadata: {}, ...over,
  };
}

function patch(body: unknown): Request {
  return new Request("http://l/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  userId = OWNER;
  role = "creator";
  calls = [];
  respond = () => ({ rows: [] });
  ai.moderate.mockClear();
  notify.notifyFollowersNewPost.mockClear();
});

afterEach(() => {
  delete process.env.VIDEO_MODERATION_MODE;
});

describe("buildDetailsUpdate", () => {
  it("publish=public sets visibility + published_at and asks for moderation", () => {
    const u = buildDetailsUpdate({ publish: "public", title: "Nou" }, video());
    expect(u.publishing).toBe(true);
    expect(u.sets).toContain("published_at = COALESCE(published_at, NOW())");
    expect(u.values).toContain("public");
  });

  it("allows publishing while processing but not before the upload finished", () => {
    expect(() => buildDetailsUpdate({ publish: "public" }, video({ status: "processing" }))).not.toThrow();
    expect(() => buildDetailsUpdate({ publish: "public" }, video({ status: "uploading" }))).toThrow(/not uploaded/);
    expect(() => buildDetailsUpdate({ publish: "draft" }, video({ status: "uploading" }))).not.toThrow();
  });

  it("scheduling requires a future date", () => {
    const now = Date.parse("2026-09-26T10:00:00Z");
    expect(() =>
      buildDetailsUpdate({ publish: "scheduled", scheduled_publish_at: "2026-09-26T09:00:00Z" }, video(), now),
    ).toThrow();
    const ok = buildDetailsUpdate({ publish: "scheduled", scheduled_publish_at: "2026-09-27T09:00:00Z" }, video(), now);
    expect(ok.sets).toContain("visibility = 'draft'");
  });

  it("uses $2.. placeholders ($1 = video id) and rejects empty bodies", () => {
    const u = buildDetailsUpdate({ title: "a", allow_duet: false }, video());
    expect(u.sets[0]).toBe("title = $2");
    expect(u.sets[1]).toBe("allow_duet = $3");
    expect(() => buildDetailsUpdate({}, video())).toThrow();
  });
});

describe("moderateOnPublish", () => {
  const input = { videoId: VID, creatorId: OWNER, currentStatus: "pending_review", title: "Rochie", description: "vara", tags: [] };

  it("auto mode approves clean text; manual mode always waits for review", async () => {
    expect(await moderateOnPublish(input)).toBe("approved");
    process.env.VIDEO_MODERATION_MODE = "manual";
    expect(await moderateOnPublish(input)).toBe("pending_review");
  });

  it("AI-flagged text goes to review and opens a case", async () => {
    ai.moderate.mockResolvedValueOnce({ flagged: true, reasons: ["hate"] });
    expect(await moderateOnPublish(input)).toBe("pending_review");
    expect(calls.some((c) => c.sql.includes("INSERT INTO moderation_cases"))).toBe(true);
  });

  it("an admin rejection cannot be undone by republishing", async () => {
    expect(await moderateOnPublish({ ...input, currentStatus: "rejected" })).toBe("rejected");
    expect(ai.moderate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/creator/videos/[id]", () => {
  function ownedResponder(state: { status?: string; product?: boolean } = {}) {
    return (sql: string) => {
      if (sql.includes("FROM videos WHERE id = $1 AND status <> 'deleted'")) return { rows: [video({ status: state.status ?? "ready" })] };
      if (sql.includes("FROM marketplace_products p")) return { rows: state.product ? [{ id: "p" }] : [] };
      if (sql.startsWith("SELECT status, visibility, moderation_status")) {
        return { rows: [{ status: state.status ?? "ready", visibility: "public", moderation_status: "pending_review", title: "t", description: "", tags: [] }] };
      }
      if (sql.includes("followers_notified_at")) return { rows: [{ creator_id: OWNER }] };
      return { rows: [] };
    };
  }

  it("403 for another creator's video; sellers can publish their own", async () => {
    respond = ownedResponder();
    userId = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
    expect((await PATCH(patch({ publish: "public" }), ctx)).status).toBe(403);
    userId = OWNER;
    role = "seller";
    expect((await PATCH(patch({ publish: "public" }), ctx)).status).toBe(200);
  });

  it("rejects unknown fields (strict schema) and non-eligible products", async () => {
    respond = ownedResponder();
    expect((await PATCH(patch({ visibility: "public" }), ctx)).status).toBe(400);
    const res = await PATCH(patch({ product_id: "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f" }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("product_not_eligible");
  });

  it("publishing runs moderation, stores the decision and notifies followers once when live", async () => {
    respond = ownedResponder();
    const res = await PATCH(patch({ publish: "public", title: "Nou", tags: ["vara"] }), ctx);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, moderationStatus: "approved", liveNow: true });
    const stored = calls.find((c) => c.sql.startsWith("UPDATE videos SET moderation_status"));
    expect(stored?.params).toEqual([VID, "approved"]);
    expect(notify.notifyFollowersNewPost).toHaveBeenCalledTimes(1);
  });

  it("publishing while still processing is accepted but not live yet", async () => {
    respond = ownedResponder({ status: "processing" });
    const body = await (await PATCH(patch({ publish: "public" }), ctx)).json();
    expect(body.liveNow).toBe(false);
    expect(notify.notifyFollowersNewPost).not.toHaveBeenCalled();
  });

  it("tagging an eligible product writes the overlay link at the chosen second", async () => {
    respond = ownedResponder({ product: true });
    await PATCH(patch({ product_id: "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f", product_overlay_ms: 3000 }), ctx);
    const link = calls.find((c) => c.sql.includes("INSERT INTO video_product_links"));
    expect(link?.params).toEqual([VID, "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f", 3000]);
  });
});

describe("GET /api/videos/[id]/status (was unauthenticated)", () => {
  const base = {
    id: VID, creator_id: OWNER, status: "processing", visibility: "draft", is_hidden: false, effective_label: "pending",
    moderation_status: "pending_review", playback_url: "https://cdn/x.m3u8", thumbnail_url: null, duration_ms: null,
    width: null, height: null, job_status: "running", job_stage: "transcoding", job_progress: 30, job_error_code: null,
  };

  it("hides drafts from strangers and shows details to the owner", async () => {
    respond = () => ({ rows: [base] });
    userId = null;
    expect((await publicStatus(new Request("http://l/x"), ctx)).status).toBe(404);
    userId = OWNER;
    const body = await (await publicStatus(new Request("http://l/x"), ctx)).json();
    expect(body).toMatchObject({ progress: 30, stage: "transcoding", moderationStatus: "pending_review" });
  });

  it("public viewers get only playback fields for visible videos", async () => {
    respond = () => ({ rows: [{ ...base, status: "ready", visibility: "public", effective_label: "safe" }] });
    userId = null;
    const body = await (await publicStatus(new Request("http://l/x"), ctx)).json();
    expect(body.playbackUrl).toBe("https://cdn/x.m3u8");
    expect(body.stage).toBeUndefined();
  });
});

describe("cover validation", () => {
  it("accepts only real JPEG bytes", () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });
});
