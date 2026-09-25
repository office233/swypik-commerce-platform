/**
 * Sursa de date a feed-ului video pe client (Home + /explore).
 *
 * Interfață mică, intenționat: UI-ul cere „pagina N” și primește videoclipuri
 * + `hasMore`. Agentul de ranking poate schimba endpoint-ul (cursor, itemi
 * unificați din alte module) modificând DOAR acest fișier.
 */
export type FeedSourceKind = "foryou" | "following";

export type FeedQuery = {
  /** 1-based. */
  page: number;
  source?: FeedSourceKind;
  /** Slug de taxonomie (filtru de categorie). */
  category?: string;
  /** Doar clipurile unui creator (context de profil). */
  creatorId?: string;
  /** Clip fixat primul (deep link `?v=`); trimis doar pe prima pagină. */
  pinnedVideoId?: string;
  sessionId?: string;
  limit?: number;
};

export type FeedPage<T> = { videos: T[]; hasMore: boolean };

export const FEED_PAGE_SIZE = 30;
const FEED_ENDPOINT = "/api/explore/feed";

export function buildFeedUrl(q: FeedQuery): string {
  const sp = new URLSearchParams();
  sp.set("limit", String(q.limit ?? FEED_PAGE_SIZE));
  sp.set("page", String(Math.max(1, Math.floor(q.page))));
  if (q.source === "following") sp.set("source", "following");
  if (q.category) sp.set("taxonomy_node_slug", q.category);
  if (q.sessionId) sp.set("session_id", q.sessionId);
  if (q.pinnedVideoId && q.page <= 1) sp.set("v", q.pinnedVideoId);
  if (q.creatorId) sp.set("creator_id", q.creatorId);
  return `${FEED_ENDPOINT}?${sp.toString()}`;
}

/** Normalizează răspunsul API-ului; `null` la eroare HTTP (apelantul decide). */
export function parseFeedPage<T>(data: unknown): FeedPage<T> {
  const obj = (data && typeof data === "object" ? data : {}) as { videos?: unknown; hasMore?: unknown };
  return {
    videos: Array.isArray(obj.videos) ? (obj.videos as T[]) : [],
    hasMore: Boolean(obj.hasMore),
  };
}

export async function fetchFeedPage<T>(q: FeedQuery, init?: RequestInit): Promise<FeedPage<T> | null> {
  const res = await fetch(buildFeedUrl(q), init);
  if (!res.ok) return null;
  return parseFeedPage<T>(await res.json());
}
