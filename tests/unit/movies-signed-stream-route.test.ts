import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || "test-secret-key-for-movies-stream";

const PUBLIC_BASE = "https://cdn.example.com/media";
const PAID_URL = `${PUBLIC_BASE}/private/videos/hls/vid-paid/master.m3u8`;
const FREE_URL = `${PUBLIC_BASE}/videos/hls/vid-free/master.m3u8`;

let episodeRow: { id: string; playback_url: string | null; video_id: string; thumbnail_url: string | null; duration_ms: number | null } | null = null;
let viewerUserId: string | null = "viewer-1";
let canPlayResult = true;
let freeEpisode = false;
const presignCalls: Array<{ key: string; ttl: number }> = [];

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: () => true,
  frozenResponse: () => new Response("frozen", { status: 410 }),
}));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: async () => ({ success: true, remaining: 10 }), getClientIP: () => "127.0.0.1" }));
vi.mock("@/lib/storage/video-storage", () => ({
  objectKeyFromAssetUrl: (url: string) => (url.startsWith(`${PUBLIC_BASE}/`) ? url.slice(PUBLIC_BASE.length + 1) : null),
  createPresignedGetUrl: async (key: string, ttl: number) => {
    presignCalls.push({ key, ttl });
    return `https://minio.internal/bucket/${key}?X-Amz-Signature=sig`;
  },
}));
vi.mock("@/lib/movies/repository", () => ({
  getEpisodeById: async () => episodeRow,
  getSeriesBySlug: async () => ({ id: "s1", status: "published", free_episodes: 3, episode_price_cents: 500, license_expires_at: null, owner_user_id: "owner" }),
  getEpisode: async () => ({ id: "ep-5", episode_number: 5, status: "published" }),
  listEpisodes: async () => [],
}));
vi.mock("@/lib/movies/viewer", () => ({ buildViewerContext: async () => ({}) }));
vi.mock("@/lib/movies/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/movies/access")>()),
  canPlay: () => canPlayResult,
  isFreeEpisode: () => freeEpisode,
  isSeriesPublic: () => true,
}));
vi.mock("@/lib/auth/getAuthUser", () => ({ getAuthUser: async () => ({ userId: viewerUserId, isAdmin: false }) }));

import { GET as streamGET } from "@/app/api/movies/stream/[token]/[...path]/route";
import { GET as playGET } from "@/app/api/movies/[slug]/episodes/[n]/play/route";
import { signStreamToken } from "@/lib/media/stream-token";
import { getStreamSecret } from "@/lib/media/stream-secret";

const fetchMock = vi.fn();
beforeEach(() => {
  episodeRow = { id: "ep-5", playback_url: PAID_URL, video_id: "vid-paid", thumbnail_url: null, duration_ms: 120_000 };
  viewerUserId = "viewer-1";
  canPlayResult = true;
  freeEpisode = false;
  presignCalls.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const token = (overrides: Partial<{ scope: "movies" | "music"; expiresAt: number; mediaId: string }> = {}) =>
  signStreamToken({ userId: "viewer-1", scope: "movies", mediaId: "ep-5", expiresAt: Date.now() + 60_000, ...overrides }, getStreamSecret());
const callStream = (tok: string, path: string[]) =>
  streamGET(new Request(`https://swypik.test/api/movies/stream/${tok}/${path.join("/")}`), { params: Promise.resolve({ token: tok, path }) });

describe("GET /api/movies/stream/[token]/[...path] — media plătită doar prin URL semnat", () => {
  it("citește obiectul privat printr-un GET presemnat, scurt, și rescrie playlist-ul prin proxy", async () => {
    fetchMock.mockResolvedValue(new Response("#EXTM3U\n#EXTINF:4,\nseg0.ts\n", { status: 200, headers: { "content-type": "application/vnd.apple.mpegurl" } }));
    const tok = token();
    const res = await callStream(tok, ["master.m3u8"]);
    expect(res.status).toBe(200);
    expect(presignCalls).toEqual([{ key: "private/videos/hls/vid-paid/master.m3u8", ttl: expect.any(Number) }]);
    expect(presignCalls[0].ttl).toBeLessThanOrEqual(900);
    expect(String(fetchMock.mock.calls[0][0])).toContain("X-Amz-Signature");
    const body = await res.text();
    expect(body).toContain(`/api/movies/stream/${tok}/seg0.ts`);
    expect(body).not.toContain("cdn.example.com");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("respinge token expirat, token de alt scope și căi care ies din directorul episodului", async () => {
    expect((await callStream(token({ expiresAt: Date.now() - 1 }), ["master.m3u8"])).status).toBe(403);
    expect((await callStream(token({ scope: "music" }), ["master.m3u8"])).status).toBe(403);
    expect((await callStream(token(), ["..", "vid-other", "master.m3u8"])).status).toBe(403);
    expect((await callStream("garbage.sig", ["master.m3u8"])).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("upstream indisponibil → 502, fără a scurge URL-ul real", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 403 }));
    const res = await callStream(token(), ["seg0.ts"]);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("private/");
  });
});

describe("GET /api/movies/[slug]/episodes/[n]/play", () => {
  const callPlay = () => playGET(new Request("https://swypik.test/api/movies/s/episodes/5/play"), { params: Promise.resolve({ slug: "s", n: "5" }) });

  it("episod plătit deblocat → doar URL de proxy cu token, fără videoId, cu expirare", async () => {
    const res = await callPlay();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.videoId).toBeUndefined();
    expect(body.playbackUrl).toMatch(/^\/api\/movies\/stream\/[^/]+\/master\.m3u8$/);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("episod blocat → 402, fără nicio informație despre media", async () => {
    canPlayResult = false;
    const res = await callPlay();
    const body = await res.json();
    expect(res.status).toBe(402);
    expect(body).not.toHaveProperty("playbackUrl");
    expect(body).not.toHaveProperty("videoId");
  });

  it("episod gratuit stocat public → URL public direct (ca în feed)", async () => {
    freeEpisode = true;
    episodeRow = { id: "ep-1", playback_url: FREE_URL, video_id: "vid-free", thumbnail_url: null, duration_ms: 60_000 };
    const body = await (await callPlay()).json();
    expect(body.playbackUrl).toBe(FREE_URL);
    expect(body.videoId).toBe("vid-free");
  });

  it("episod gratuit dar stocat în prefixul privat → tot prin proxy", async () => {
    freeEpisode = true;
    const body = await (await callPlay()).json();
    expect(body.playbackUrl).toMatch(/^\/api\/movies\/stream\//);
  });
});
