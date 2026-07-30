/**
 * ============================================================================
 * CONTRACT EVENIMENTE FEED — sursă unică de adevăr pentru numele evenimentelor
 * ============================================================================
 *
 * ATENȚIE AGENT VIDEO-PLAYER: folosește EXACT aceste nume de event_type când
 * trimiți evenimente. Ingest-ul există deja:
 *   - POST /api/feed/event          — un singur eveniment (fire-and-forget)
 *   - POST /api/feed/events/batch   — flush batched din player (max 50/req);
 *                                     clientul flushează la 10s / la schimbarea
 *                                     clipului / on unload (sendBeacon) —
 *                                     vezi lib/feed/track.ts (trackEvent,
 *                                     trackWatchTime, getSessionId).
 *
 * Evenimente folosite de algoritmul de scoring + remunerație (FRONT 3):
 *   "video_view"   — view calificat: emis DOAR după ≥3s de redare (VIEW_MIN_MS)
 *   "watch_time"   — periodic + la părăsirea clipului; OBLIGATORIU watch_ms
 *                    (milisecunde vizionate de la ultimul raport, incremental)
 *   "like"         — utilizatorul a dat like ("unlike" pentru revert)
 *   "share"        — utilizatorul a distribuit clipul
 *   "add_to_cart"  — a adăugat în coș un produs din clip
 *   "purchase"     — comandă plătită atribuită clipului
 *
 * Alte evenimente acceptate de pipeline (deja definite în lib/feed/events.ts):
 *   completion, rewatch, skip_fast, pause, resume, seek, save/unsave,
 *   comment, follow/unfollow, product_click, not_interested,
 *   more_like_this, report, impression.
 *
 * Toate se scriu în tabela `feed_events` (coloane relevante: video_id,
 * actor_user_id, session_id, event_type, watch_ms, occurred_at). NU există
 * și nu trebuie creată o tabelă separată `video_events` — feed_events este
 * pipeline-ul canonic, cu index pe (event_type, video_id, occurred_at).
 */

export {
  FEED_EVENT_TYPES,
  FEED_EVENT_WEIGHTS,
  isFeedEventType,
  type FeedEventType,
} from "@/lib/feed/events";

/** Prag minim de redare (ms) pentru a emite "video_view". */
export const VIEW_MIN_MS = 3000;

/** Evenimentele consumate de scoring + fondul creator. */
export const ALGO_EVENT_TYPES = [
  "video_view",
  "watch_time",
  "like",
  "share",
  "add_to_cart",
  "purchase",
] as const;

export type AlgoEventType = (typeof ALGO_EVENT_TYPES)[number];
