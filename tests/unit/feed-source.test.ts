import { describe, it, expect, vi, afterEach } from "vitest";
import { buildFeedUrl, fetchFeedPage, parseFeedPage } from "@/lib/feed/client/feed-source";

describe("buildFeedUrl", () => {
  it("prima pagină For You cu sesiune, categorie și clip fixat", () => {
    const url = buildFeedUrl({ page: 1, sessionId: "s 1", category: "beauty", pinnedVideoId: "v1" });
    const sp = new URL(url, "https://x.test").searchParams;
    expect(url.startsWith("/api/explore/feed?")).toBe(true);
    expect(sp.get("limit")).toBe("30");
    expect(sp.get("page")).toBe("1");
    expect(sp.get("session_id")).toBe("s 1");
    expect(sp.get("taxonomy_node_slug")).toBe("beauty");
    expect(sp.get("v")).toBe("v1");
    expect(sp.has("source")).toBe(false);
  });

  it("paginile următoare nu mai trimit clipul fixat; Following trimite source", () => {
    const sp = new URL(buildFeedUrl({ page: 3, source: "following", pinnedVideoId: "v1", creatorId: "c1" }), "https://x.test")
      .searchParams;
    expect(sp.get("page")).toBe("3");
    expect(sp.get("source")).toBe("following");
    expect(sp.has("v")).toBe(false);
    expect(sp.get("creator_id")).toBe("c1");
  });

  it("normalizează pagina invalidă la 1", () => {
    expect(new URL(buildFeedUrl({ page: 0 }), "https://x.test").searchParams.get("page")).toBe("1");
  });
});

describe("parseFeedPage", () => {
  it("tolerează răspunsuri incomplete", () => {
    expect(parseFeedPage(null)).toEqual({ videos: [], hasMore: false });
    expect(parseFeedPage({ videos: [{ id: "a" }], hasMore: 1 })).toEqual({ videos: [{ id: "a" }], hasMore: true });
  });
});

describe("fetchFeedPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returnează null la eroare HTTP", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    expect(await fetchFeedPage({ page: 1 })).toBeNull();
  });

  it("parsează pagina", async () => {
    const fetchMock = vi.fn(async () => Response.json({ videos: [{ id: "v" }], hasMore: false }));
    vi.stubGlobal("fetch", fetchMock);
    const page = await fetchFeedPage<{ id: string }>({ page: 2 });
    expect(page).toEqual({ videos: [{ id: "v" }], hasMore: false });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("page=2");
  });
});
