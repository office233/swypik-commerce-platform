/** Formularul „Detalii” (pur): valori implicite, hashtag-uri, corpul PATCH. */
import type { DetailsDraft } from "@/lib/upload/draft-store";
import type { VideoDetailsInput } from "@/lib/video/upload/schemas";
import { VIDEO_LIMITS } from "@/lib/video/limits";

export const EMPTY_DETAILS: DetailsDraft = {
  title: "",
  description: "",
  productId: null,
  productTitle: null,
  productOverlaySec: 0,
  missionSlug: null,
  audioTrackId: null,
  audioTrackLabel: null,
  allowComments: true,
  allowDuet: true,
  allowStitch: true,
  captionsEnabled: false,
};

/** #hashtag-uri din descriere (litere Unicode, cifre, _), fără duplicate, max hashtagsMax. */
export function extractHashtags(text: string): string[] {
  const found = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const tags: string[] = [];
  for (const raw of found) {
    const tag = raw.slice(1).toLowerCase().slice(0, VIDEO_LIMITS.hashtagMaxChars);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, VIDEO_LIMITS.hashtagsMax);
}

export type PublishIntent = "draft" | "public" | "scheduled";

export function toVideoPatch(d: DetailsDraft, intent: PublishIntent, scheduledAt?: string): VideoDetailsInput {
  const body: VideoDetailsInput = {
    description: d.description.trim(),
    tags: extractHashtags(d.description),
    allow_comments: d.allowComments,
    allow_duet: d.allowDuet,
    allow_stitch: d.allowStitch,
    audio_track_id: d.audioTrackId,
    product_id: d.productId,
    mission_slug: d.missionSlug,
    captions_enabled: d.captionsEnabled,
    publish: intent,
  };
  const title = d.title.trim();
  if (title) body.title = title;
  if (d.productId) body.product_overlay_ms = Math.max(0, Math.round(d.productOverlaySec * 1000));
  if (intent === "scheduled" && scheduledAt) body.scheduled_publish_at = scheduledAt;
  return body;
}
