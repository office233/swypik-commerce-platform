import { NextResponse } from "next/server";
import { getSocialApiBaseUrl } from "@/lib/social/proxy";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

type RawEvent = Record<string, unknown>;

export type FeedEvent = {
  type: string;
  video_id?: string;
  product_id?: string;
  creator_id?: string;
  watch_ms?: number;
  position_ms?: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
};

export type FeedEventBatch = {
  session_id: string;
  events: FeedEvent[];
};

const PLATFORM_EVENT_TYPES = new Set([
  "video_impression",
  "video_start",
  "video_progress",
  "video_complete",
  "video_rewatch",
  "video_like",
  "video_unlike",
  "video_save",
  "video_share",
  "comment_create",
  "profile_open",
  "product_click",
  "add_to_cart",
  "checkout_start",
  "purchase_complete",
  "report_video",
  "not_interested",
  "follow_creator",
]);

const LEGACY_EVENT_TYPE_MAP: Record<string, string> = {
  view: "video_impression",
  impression: "video_impression",
  watch: "video_progress",
  progress: "video_progress",
  complete: "video_complete",
  swipe: "video_start",
  like: "video_like",
  unlike: "video_unlike",
  save: "video_save",
  share: "video_share",
  comment_open: "comment_create",
  product_click: "product_click",
  add_to_cart: "add_to_cart",
};

export function isBatchFallbackStatus(status: number) {
  return status === 404 || status === 405 || status === 501;
}

export function fallbackAccepted(count: number, source = "next-fallback") {
  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      persisted: false,
      count,
      source,
    },
    { status: 202 }
  );
}

export function validationError(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export function normalizeBatchPayload(body: unknown): FeedEventBatch | null {
  const source = isRecord(body) ? body : {};
  const rawEvents = Array.isArray(source.events)
    ? source.events
    : Array.isArray(body)
      ? body
      : isRecord(body)
        ? [body]
        : [];

  const events = rawEvents
    .map((event) => (isRecord(event) ? normalizeEvent(event) : null))
    .filter((event): event is FeedEvent => Boolean(event));

  const sessionId = asString(source.session_id || source.sessionId) || "web-anonymous";

  return {
    session_id: sessionId,
    events,
  };
}

export async function postJSONToGo(req: Request, path: string, payload: unknown) {
  const baseUrl = getSocialApiBaseUrl();
  if (!baseUrl) return null;

  const upstreamUrl = new URL(path.replace(/^\//, ""), baseUrl);
  const authorization = req.headers.get("authorization");

  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  if (authorization) headers.set("Authorization", authorization);

  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.set("x-Swypik-upstream", "go-social-api");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function postLegacyEvents(req: Request, batch: FeedEventBatch) {
  const baseUrl = getSocialApiBaseUrl();
  if (!baseUrl) return null;

  let accepted = 0;
  let lastStatus = 202;

  for (const event of batch.events) {
    const upstream = await postJSONToGo(req, "/v1/events", toLegacyEvent(event, batch.session_id));
    if (!upstream) return null;
    lastStatus = upstream.status;
    if (upstream.ok) accepted += 1;
    await upstream.arrayBuffer().catch(() => null);
  }

  return { accepted, lastStatus };
}

function normalizeEvent(raw: RawEvent): FeedEvent | null {
  const rawType = asString(raw.type || raw.event_type || raw.eventType);
  const type = normalizeEventType(rawType, raw);
  if (!type || !PLATFORM_EVENT_TYPES.has(type)) return null;

  const productId = asString(raw.product_id || raw.productId || raw.productID);
  const videoId =
    asString(raw.video_id || raw.videoId) ||
    asString(raw.subject_id || raw.subjectId) ||
    productId;
  const metadata = normalizeMetadata(raw, rawType);
  const watchMs = asPositiveInt(raw.watch_ms || raw.watchMs);
  const positionMs = asPositiveInt(raw.position_ms || raw.positionMs);

  return {
    type,
    ...(videoId ? { video_id: videoId } : {}),
    ...(productId ? { product_id: productId } : {}),
    ...(asString(raw.creator_id || raw.creatorId) ? { creator_id: asString(raw.creator_id || raw.creatorId) } : {}),
    ...(watchMs !== undefined ? { watch_ms: watchMs } : {}),
    ...(positionMs !== undefined ? { position_ms: positionMs } : {}),
    ...(Object.keys(metadata).length ? { metadata } : {}),
    timestamp: normalizeTimestamp(raw.timestamp || raw.occurredAt || raw.occurred_at),
  };
}

function normalizeEventType(rawType: string, raw: RawEvent) {
  if (rawType === "watch" && raw.complete === true) return "video_complete";
  return LEGACY_EVENT_TYPE_MAP[rawType] || rawType;
}

function normalizeMetadata(raw: RawEvent, rawType: string) {
  const metadata: Record<string, unknown> = isRecord(raw.metadata) ? { ...raw.metadata } : {};

  for (const key of ["source", "position", "complete", "quantity", "seed"]) {
    if (raw[key] !== undefined) metadata[key] = raw[key];
  }

  if (rawType && !PLATFORM_EVENT_TYPES.has(rawType)) {
    metadata.legacy_type = rawType;
  }

  return metadata;
}

function toLegacyEvent(event: FeedEvent, sessionId: string) {
  const numericProductId = Number(event.product_id);
  return {
    event_type: event.type,
    subject_id: event.video_id || event.product_id || event.type,
    user_id: sessionId,
    product_id: Number.isFinite(numericProductId) && numericProductId > 0 ? numericProductId : 0,
    video_id: event.video_id || "",
    metadata: event.metadata || {},
  };
}

function normalizeTimestamp(value: unknown) {
  const fallback = new Date().toISOString();
  if (!value) return fallback;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function asPositiveInt(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return Math.trunc(number);
}

function asString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
