/**
 * Clientul HTTP al fluxului de creare video (browser). Toate erorile devin
 * UploadApiError cu `code` stabil (tradus în UI prin videoUpload.errors.*).
 */
import type { UploadStatus } from "@/lib/video/upload/status";
import type { VideoDetailsInput } from "@/lib/video/upload/schemas";
import type { CaptionTrack } from "@/lib/video/captions";

export type { UploadStatus };

export class UploadApiError extends Error {
  code: string;
  status: number;
  missing?: number[];
  constructor(code: string, status: number, missing?: number[]) {
    super(code);
    this.name = "UploadApiError";
    this.code = code;
    this.status = status;
    this.missing = missing;
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new UploadApiError("network_error", 0);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof body.code === "string" ? body.code : typeof body.error === "string" ? body.error : "error";
    throw new UploadApiError(code, res.status, Array.isArray(body.missing) ? (body.missing as number[]) : undefined);
  }
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const SESSION = "/api/creator/upload-session";

export type CreatedSession = { sessionId: string; videoId: string; partSize: number; totalParts: number; expiresAt: string };

export const uploadApi = {
  createSession: (body: { filename: string; contentType: string; sizeBytes: number; source: "gallery" | "camera" }) =>
    call<CreatedSession>(SESSION, json("POST", body)),
  openSessions: () => call<{ sessions: UploadStatus[] }>(SESSION).then((r) => r.sessions),
  signParts: (sessionId: string, partNumbers: number[]) =>
    call<{ parts: Array<{ partNumber: number; url: string }> }>(`${SESSION}/${sessionId}/parts`, json("POST", { partNumbers })).then(
      (r) => r.parts,
    ),
  listParts: (sessionId: string) =>
    call<{ partSize: number; totalParts: number; uploaded: Array<{ partNumber: number; size: number }> }>(
      `${SESSION}/${sessionId}/parts`,
    ),
  complete: (sessionId: string, trim: { startMs: number | null; endMs: number | null }) =>
    call<{ videoId: string; jobId: string | null; status: string }>(`${SESSION}/${sessionId}/complete`, json("POST", { trim })),
  abort: (sessionId: string) => call<{ aborted: boolean }>(`${SESSION}/${sessionId}`, { method: "DELETE" }),
  status: (sessionId: string) => call<UploadStatus>(`${SESSION}/${sessionId}`),
};

export type VideoPatchResult = {
  videoId: string;
  status: string;
  visibility: string;
  moderationStatus: string;
  liveNow: boolean;
};

export type OwnedVideoDto = {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  preview_url: string | null;
  playback_url: string | null;
  status: string;
  visibility: string;
  tags: string[] | null;
  allow_comments: boolean;
  allow_duet: boolean;
  allow_stitch: boolean;
  audio_track_id: number | null;
  product_refs: Array<{ product_id?: string }> | null;
  product_title: string | null;
  product_overlay_ms: number | null;
  mission_slug: string | null;
  captions_enabled: boolean;
  scheduled_publish_at: string | null;
  duration_ms: number | null;
  session_id: string | null;
};

const VIDEOS = "/api/creator/videos";

export const videoApi = {
  get: (videoId: string) => call<{ video: OwnedVideoDto }>(`${VIDEOS}/${videoId}`).then((r) => r.video),
  patch: (videoId: string, body: VideoDetailsInput) => call<VideoPatchResult>(`${VIDEOS}/${videoId}`, json("PATCH", body)),
  reprocess: (videoId: string) => call<{ jobId: string }>(`${VIDEOS}/${videoId}/reprocess`, json("POST")),
  uploadCover: (videoId: string, jpeg: Blob) =>
    call<{ thumbnailUrl: string }>(`${VIDEOS}/${videoId}/cover`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: jpeg,
    }),
  captions: (videoId: string) => call<{ tracks: CaptionTrack[] }>(`${VIDEOS}/${videoId}/captions`).then((r) => r.tracks),
  generateCaptions: (videoId: string, lang: string) =>
    call<{ track: CaptionTrack }>(`${VIDEOS}/${videoId}/captions`, json("POST", { lang })).then((r) => r.track),
  saveCaptions: (videoId: string, lang: string, segments: CaptionTrack["segments"]) =>
    call<{ track: CaptionTrack }>(`${VIDEOS}/${videoId}/captions`, json("PUT", { lang, segments })).then((r) => r.track),
};

export type TaggableProductDto = { id: string; title: string; image_url: string | null; price_cents: number; currency: string };
export type MissionDto = { id: string; slug: string; title: string; endsAt: string | null };

export const pickerApi = {
  products: (q: string, signal?: AbortSignal) =>
    call<{ products: TaggableProductDto[] }>(`/api/creator/products/search?q=${encodeURIComponent(q)}`, { signal }).then(
      (r) => r.products,
    ),
  /** Extension point: lista vine din API-ul Missions existent (GET /api/missions). */
  missions: () => call<{ missions: MissionDto[] }>("/api/missions?limit=20").then((r) => r.missions),
  submitMission: (slug: string, videoId: string) =>
    call<{ ok: boolean }>(`/api/missions/${encodeURIComponent(slug)}/submit`, json("POST", { videoId })),
};
